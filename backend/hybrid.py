from data_loader import get_books_df, get_user_signals
from cbf import cbf_scores_for_user, cbf_similar_books
from cf import cf_scores_for_user, normalize_cf_scores


def _normalize(scores: dict[str, float]) -> dict[str, float]:
    """Min-max normalize a score dict to [0, 1]."""
    if not scores:
        return {}
    values = list(scores.values())
    mn, mx = min(values), max(values)
    if mx == mn:
        return {k: 0.5 for k in scores}
    return {k: (v - mn) / (mx - mn) for k, v in scores.items()}


def _adaptive_weights(signals: dict, has_cf: bool) -> tuple[float, float]:
    """
    Adapt blending weights to the richness of each user's data.

    - Cold start / sparse-rating users lean heavily on CBF.
    - Users with richer rating history get progressively more CF influence.
    """
    if not has_cf:
        return 0.0, 1.0

    rated_count = len(signals["rated"])
    favourite_count = len(signals["favourite_isbns"])
    genre_count = len(signals["genres"])

    cf_signal = min(1.0, rated_count / 15.0)
    content_signal = min(1.0, (rated_count + favourite_count * 2 + genre_count) / 12.0)

    if rated_count <= 2:
        cf_signal *= 0.35
    elif rated_count <= 5:
        cf_signal *= 0.6
    elif rated_count <= 10:
        cf_signal *= 0.85

    cf_weight = max(0.1, cf_signal)
    cbf_weight = max(0.25, content_signal)

    total = cf_weight + cbf_weight
    return cf_weight / total, cbf_weight / total


def get_recommendations(user_id: str, top_n: int = 100) -> list[dict]:
    """
    Hybrid recommendation for a logged-in user.

    Steps:
    1. Fetch user signals (genres, favourites, exclusions)
    2. Build candidate pool = all books minus excluded
    3. Score candidates with CBF (always) + CF (if model trained)
    4. Blend scores, sort, return top_n with book metadata
    """
    df = get_books_df()
    signals = get_user_signals(user_id)

    # Exclusion set: reading list (all statuses) + already-rated books
    excluded = set(signals["reading_list_isbns"]) | set(signals["rated"].keys())

    all_isbns = df["isbn13"].tolist()
    candidates = [isbn for isbn in all_isbns if isbn not in excluded]

    if not candidates:
        candidates = all_isbns  # edge case: user has read everything

    # --- CBF scores ---
    cbf_raw = cbf_scores_for_user(
        favourite_isbns=signals["favourite_isbns"],
        preferred_genres=signals["genres"],
        candidate_isbns=candidates,
    )
    cbf_norm = _normalize(cbf_raw)

    # --- CF scores ---
    cf_raw = cf_scores_for_user(user_id, candidates)
    cf_norm = _normalize(normalize_cf_scores(cf_raw))

    has_cf = bool(cf_norm)
    cf_weight, cbf_weight = _adaptive_weights(signals, has_cf)

    final_scores: dict[str, float] = {}
    for isbn in candidates:
        cbf_s = cbf_norm.get(isbn, 0.0)
        if has_cf:
            cf_s = cf_norm.get(isbn, 0.0)
            score = cf_weight * cf_s + cbf_weight * cbf_s
        else:
            score = cbf_s
        final_scores[isbn] = score

    # Sort descending
    ranked_isbns = sorted(final_scores, key=lambda x: final_scores[x], reverse=True)[:top_n]

    # Attach book metadata
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
        })

    return results


def get_similar_books(isbn13: str, top_n: int = 12) -> list[dict]:
    """
    Pure CBF similar books for BookDetailPage.
    Excludes the source book itself.
    """
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
