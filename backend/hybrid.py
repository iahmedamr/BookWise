"""
hybrid.py - hybrid recommender with learned per-user CF/CBF weights.

CF remains the Surprise SVD model from cf.py. CBF remains the single content
score from cbf.py, where favourite ISBNs and preferred genres are handled
together. This module only learns how much to trust the final CF score versus
the final CBF score for each user.
"""

import threading
from typing import Optional

import numpy as np
from sklearn.linear_model import Ridge
from sklearn.preprocessing import StandardScaler

from data_loader import get_books_df, get_user_signals, get_all_ratings
from cbf import cbf_scores_for_user, cbf_similar_books
from cf import cf_scores_for_user, train_cf

_lock = threading.RLock()

_weight_model: Optional[Ridge] = None
_weight_scaler: Optional[StandardScaler] = None
_global_prior: Optional[np.ndarray] = None  # shape (2,) -> [w_cf, w_cbf]
_MIN_RATINGS_TO_REGRESS = 3


def _minmax(scores: dict[str, float]) -> dict[str, float]:
    if not scores:
        return {}
    vals = list(scores.values())
    mn, mx = min(vals), max(vals)
    if mx == mn:
        return {k: 0.5 for k in scores}
    return {k: (v - mn) / (mx - mn) for k, v in scores.items()}


def _user_feature_vector(signals: dict, cf_available: bool) -> np.ndarray:
    rated = signals["rated"]
    n_rated = len(rated)
    n_fav = len(signals["favourite_isbns"])
    n_genre = len(signals["genres"])

    has_cf = float(cf_available and n_rated > 0)
    n_rated_norm = float(np.log1p(n_rated) / np.log1p(200))
    n_fav_norm = float(np.log1p(n_fav) / np.log1p(50))
    n_genre_norm = float(min(n_genre / 10.0, 1.0))

    if rated:
        ratings_vals = list(rated.values())
        avg_rating = float(np.mean(ratings_vals) / 5.0)
        frac_high = float(sum(1 for r in ratings_vals if r >= 4) / len(ratings_vals))
    else:
        avg_rating = 0.5
        frac_high = 0.0

    return np.array(
        [has_cf, n_rated_norm, n_fav_norm, n_genre_norm, avg_rating, frac_high],
        dtype=np.float32,
    )


def _learn_blend_weights(ratings_df) -> tuple[Optional[Ridge], Optional[StandardScaler], np.ndarray]:
    """
    Learn per-user blend targets from component precision:
      target: [CF usefulness, CBF usefulness]
      features: user's available signal richness
    """
    if ratings_df.empty:
        prior = np.array([1.0, 1.0], dtype=np.float32)
        prior /= prior.sum()
        return None, None, prior

    df_books = get_books_df()
    all_isbns = df_books["isbn13"].tolist()

    X_rows, y_rows = [], []
    for uid in ratings_df["user_id"].unique().tolist():
        user_ratings = ratings_df[ratings_df["user_id"] == uid]
        liked_isbns = set(user_ratings[user_ratings["rating"] >= 4]["isbn13"].tolist())
        if len(liked_isbns) < _MIN_RATINGS_TO_REGRESS:
            continue

        signals = get_user_signals(uid)
        signals["rated"] = {
            str(r["isbn13"]): float(r["rating"])
            for _, r in user_ratings.iterrows()
        }

        candidates = [isbn for isbn in all_isbns if isbn not in signals["rated"]]
        if not candidates:
            continue

        cf_raw = _minmax(cf_scores_for_user(uid, candidates))
        cbf_raw = _minmax(cbf_scores_for_user(
            favourite_isbns=signals["favourite_isbns"],
            preferred_genres=signals["genres"],
            candidate_isbns=candidates,
        ))

        k = 20

        def _precision(score_dict: dict[str, float]) -> float:
            top = sorted(score_dict, key=lambda x: score_dict[x], reverse=True)[:k]
            return sum(1 for isbn in top if isbn in liked_isbns) / k

        p_cf = _precision(cf_raw)
        p_cbf = _precision(cbf_raw)
        total = p_cf + p_cbf + 1e-9
        y_rows.append(np.array([p_cf / total, p_cbf / total], dtype=np.float32))

        cf_available = bool(cf_raw and any(v > 0 for v in cf_raw.values()))
        X_rows.append(_user_feature_vector(signals, cf_available))

    if len(X_rows) < 2:
        prior = np.array([1.0, 1.0], dtype=np.float32)
        prior /= prior.sum()
        return None, None, prior

    X = np.array(X_rows, dtype=np.float32)
    y = np.array(y_rows, dtype=np.float32)

    global_prior = y.mean(axis=0)
    global_prior /= global_prior.sum()

    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    model = Ridge(alpha=1.0, fit_intercept=True)
    model.fit(X_scaled, y)

    print(f"[Hybrid] Blend regressor trained on {len(X_rows)} users. Global prior: {global_prior.round(3)}")
    return model, scaler, global_prior


def _predict_weights(signals: dict, cf_available: bool) -> tuple[float, float]:
    with _lock:
        model = _weight_model
        scaler = _weight_scaler
        prior = _global_prior

    feat = _user_feature_vector(signals, cf_available)

    if model is not None and scaler is not None:
        feat_scaled = scaler.transform(feat.reshape(1, -1))
        raw_weights = model.predict(feat_scaled)[0]
    else:
        raw_weights = prior if prior is not None else np.ones(2, dtype=np.float32)

    raw_weights = np.clip(raw_weights, 0.0, None)
    total = raw_weights.sum()
    if total < 1e-9:
        raw_weights = np.ones(2, dtype=np.float32)
        total = 2.0
    weights = raw_weights / total

    return float(weights[0]), float(weights[1])


def train_hybrid() -> None:
    global _weight_model, _weight_scaler, _global_prior

    train_cf()

    ratings_df = get_all_ratings()
    model, scaler, prior = _learn_blend_weights(ratings_df)

    with _lock:
        _weight_model = model
        _weight_scaler = scaler
        _global_prior = prior


def get_recommendations(user_id: str, top_n: int = 100) -> list[dict]:
    df = get_books_df()
    signals = get_user_signals(user_id)

    excluded = set(signals["reading_list_isbns"]) | set(signals["rated"].keys())
    all_isbns = df["isbn13"].tolist()
    candidates = [isbn for isbn in all_isbns if isbn not in excluded] or all_isbns

    cf_raw = cf_scores_for_user(user_id, candidates)
    cbf_raw = cbf_scores_for_user(
        favourite_isbns=signals["favourite_isbns"],
        preferred_genres=signals["genres"],
        candidate_isbns=candidates,
    )

    cf_norm = _minmax(cf_raw)
    cbf_norm = _minmax(cbf_raw)
    cf_available = bool(cf_norm and any(v > 0 for v in cf_norm.values()))

    w_cf, w_cbf = _predict_weights(signals, cf_available)

    final_scores: dict[str, float] = {}
    for isbn in candidates:
        final_scores[isbn] = (
            w_cf * cf_norm.get(isbn, 0.0)
            + w_cbf * cbf_norm.get(isbn, 0.0)
        )

    ranked_isbns = sorted(final_scores, key=lambda x: final_scores[x], reverse=True)[:top_n]

    isbn_to_row = df.set_index("isbn13").to_dict(orient="index")
    results = []
    for isbn in ranked_isbns:
        meta = isbn_to_row.get(isbn, {})
        results.append({
            "isbn13": isbn,
            "title": meta.get("title", ""),
            "authors": meta.get("authors", ""),
            "categories": meta.get("categories", ""),
            "thumbnail": meta.get("thumbnail", ""),
            "description": meta.get("description", ""),
            "published_year": meta.get("published_year", 0),
            "average_rating": meta.get("average_rating", 0),
            "num_pages": meta.get("num_pages", 0),
            "ratings_count": meta.get("ratings_count", 0),
            "score": round(final_scores[isbn], 4),
            "_weights": {"cf": round(w_cf, 3), "cbf": round(w_cbf, 3)},
        })

    return results


def get_similar_books(isbn13: str, top_n: int = 12) -> list[dict]:
    df = get_books_df()
    all_isbns = [isbn for isbn in df["isbn13"].tolist() if isbn != isbn13]
    ranked = cbf_similar_books(isbn13, all_isbns, top_n=top_n)

    isbn_to_row = df.set_index("isbn13").to_dict(orient="index")
    results = []
    for item in ranked:
        isbn = item["isbn13"]
        meta = isbn_to_row.get(isbn, {})
        results.append({
            "isbn13": isbn,
            "title": meta.get("title", ""),
            "authors": meta.get("authors", ""),
            "categories": meta.get("categories", ""),
            "thumbnail": meta.get("thumbnail", ""),
            "description": meta.get("description", ""),
            "published_year": meta.get("published_year", 0),
            "average_rating": meta.get("average_rating", 0),
            "num_pages": meta.get("num_pages", 0),
            "ratings_count": meta.get("ratings_count", 0),
            "score": item["score"],
        })
    return results
