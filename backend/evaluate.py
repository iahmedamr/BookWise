"""
evaluate.py — Precision@K evaluation for BookWise recommendation components.

Precision@K = (# relevant books in top-K results) / K

Relevance definitions:
  CF      → held-out ratings ≥ 4 (user genuinely liked the book)
  CBF     → books sharing genre/author with the user's favourites
  Hybrid  → held-out liked ratings if available, else CBF proxy
  Chatbot → returned book cards that appear in user's liked books

Usage (CLI):
    python evaluate.py --user-id <uuid> --k 10
    python evaluate.py --all-users --k 10 --components cf cbf hybrid
    python evaluate.py --user-id <uuid> --chatbot-query "dark philosophical fiction" --k 5
    python evaluate.py --user-id <uuid> --k 10 --json

NOTE on the DLL error:
    If you get "OSError: [WinError 1114]" when importing torch/sentence-transformers,
    reinstall a compatible PyTorch CPU wheel:
        pip uninstall torch torchvision torchaudio -y
        pip install torch --index-url https://download.pytorch.org/whl/cpu
    On Windows this usually means torch could not initialize c10.dll or one of
    its runtime dependencies.
"""

import argparse
import asyncio
import json
import random
from collections import defaultdict
from typing import Optional

import pandas as pd


# ── lazy imports so the file can be imported without triggering torch ────────
def _import_ml():
    """Import ML modules lazily — avoids the torch DLL crash at module load."""
    from data_loader import get_books_df, get_supabase, get_user_signals
    from cbf import cbf_scores_for_user, build_embeddings
    from cf import cf_scores_for_user, train_cf
    from hybrid import get_recommendations, train_hybrid, _minmax
    return (
        get_books_df, get_supabase, get_user_signals,
        cbf_scores_for_user, build_embeddings,
        cf_scores_for_user, train_cf,
        get_recommendations, train_hybrid, _minmax,
    )


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

DEFAULT_K = 10
RELEVANCE_THRESHOLD = 4
HELD_OUT_FRACTION = 0.2
RANDOM_SEED = 42


# ---------------------------------------------------------------------------
# Data helpers
# ---------------------------------------------------------------------------

def _fetch_all_ratings():
    from data_loader import get_supabase
    client = get_supabase()
    rows, page, page_size = [], 0, 1000
    while True:
        res = (
            client.table("ratings")
            .select("user_id, book_isbn13, rating")
            .range(page * page_size, (page + 1) * page_size - 1)
            .execute()
        )
        if not res.data:
            break
        rows.extend(res.data)
        if len(res.data) < page_size:
            break
        page += 1
    df = pd.DataFrame(rows) if rows else pd.DataFrame(columns=["user_id", "book_isbn13", "rating"])
    df.rename(columns={"book_isbn13": "isbn13"}, inplace=True)
    return df


def _split_ratings(ratings_df, user_id: str):
    """
    Hold out HELD_OUT_FRACTION of a user's ratings.
    Returns (train_df, held_out_liked_isbns).
    """
    user_rows = ratings_df[ratings_df["user_id"] == user_id]
    if user_rows.empty:
        return ratings_df, set()

    rng = random.Random(RANDOM_SEED)
    indices = user_rows.index.tolist()
    rng.shuffle(indices)
    n_held = max(1, int(len(indices) * HELD_OUT_FRACTION))
    held_idx = set(indices[:n_held])

    held = user_rows.loc[user_rows.index.isin(held_idx)]
    liked = set(held[held["rating"] >= RELEVANCE_THRESHOLD]["isbn13"].tolist())
    train_df = ratings_df.drop(index=list(held_idx))
    return train_df, liked


def _cbf_relevant_isbns(user_id: str) -> set[str]:
    """Content-based relevance proxy: books sharing genre/author with user's favourites."""
    from data_loader import get_books_df, get_user_signals
    signals = get_user_signals(user_id)
    df = get_books_df()

    if not signals["favourite_isbns"] and not signals["genres"]:
        return set()

    target_genres: set[str] = set()
    target_authors: set[str] = set()
    fav_set = set(str(i) for i in signals["favourite_isbns"])

    for _, row in df[df["isbn13"].isin(fav_set)].iterrows():
        for g in str(row.get("categories", "")).split(","):
            target_genres.add(g.strip().lower())
        for a in str(row.get("authors", "")).split(","):
            target_authors.add(a.strip().lower())

    for g in signals["genres"]:
        target_genres.add(g.strip().lower())

    relevant = set()
    for _, row in df.iterrows():
        isbn = str(row["isbn13"])
        if isbn in fav_set:
            continue
        row_genres = {g.strip().lower() for g in str(row.get("categories", "")).split(",")}
        row_authors = {a.strip().lower() for a in str(row.get("authors", "")).split(",")}
        if row_genres & target_genres or row_authors & target_authors:
            relevant.add(isbn)
    return relevant


def _isbn_to_title(isbns: list[str]) -> list[str]:
    from data_loader import get_books_df
    idx = get_books_df().set_index("isbn13")["title"].to_dict()
    return [idx.get(i, i) for i in isbns]


# ---------------------------------------------------------------------------
# Core metric
# ---------------------------------------------------------------------------

def precision_at_k(ranked: list[str], relevant: set[str], k: int) -> float:
    if not relevant or k <= 0:
        return 0.0
    hits = sum(1 for isbn in ranked[:k] if isbn in relevant)
    return hits / k


# ---------------------------------------------------------------------------
# Per-component evaluators
# ---------------------------------------------------------------------------

def evaluate_cf(user_id: str, k: int = DEFAULT_K, ratings_df=None) -> dict:
    """
    Hold out ratings, refit Surprise SVD on the remainder, measure Precision@K.
    Works for any number of ratings (including zero).
    """
    from surprise import Dataset, Reader, SVD
    from data_loader import get_books_df

    if ratings_df is None:
        ratings_df = _fetch_all_ratings()

    train_df, held_out_liked = _split_ratings(ratings_df, user_id)

    if not held_out_liked:
        return {
            "component": "CF", "user_id": user_id, "k": k,
            "precision_at_k": None,
            "note": "No held-out liked ratings — user needs ≥ 1 rating of 4+ to evaluate CF.",
        }

    user_rows = train_df[train_df["user_id"] == user_id]
    if user_rows.empty:
        return {
            "component": "CF", "user_id": user_id, "k": k,
            "precision_at_k": None,
            "note": "All ratings were held out — cannot fit CF model.",
        }

    # SVD fit on the training split (same hyper-params as cf.py)
    reader = Reader(rating_scale=(1, 5))
    data = Dataset.load_from_df(train_df[["user_id", "isbn13", "rating"]], reader)
    trainset = data.build_full_trainset()
    model = SVD(n_factors=50, n_epochs=20, lr_all=0.005, reg_all=0.02, random_state=RANDOM_SEED)
    model.fit(trainset)
    df_books = get_books_df()
    excluded = set(train_df[train_df["user_id"] == user_id]["isbn13"].tolist())
    candidates = [isbn for isbn in df_books["isbn13"].tolist() if isbn not in excluded]

    raw = {isbn: float(model.predict(user_id, isbn).est) for isbn in candidates}

    if raw:
        raw_vals = list(raw.values())
        mn, mx = min(raw_vals), max(raw_vals)
        denom = (mx - mn) if mx > mn else 1.0
        scored = {isbn: (s - mn) / denom for isbn, s in raw.items()}
    else:
        scored = {}

    ranked = sorted(scored, key=lambda x: scored[x], reverse=True)
    p = precision_at_k(ranked, held_out_liked, k)

    return {
        "component": "CF", "user_id": user_id, "k": k,
        "precision_at_k": round(p, 4),
        "held_out_liked_count": len(held_out_liked),
        "top_k_titles": _isbn_to_title(ranked[:k]),
        "relevant_titles": _isbn_to_title(list(held_out_liked)[:5]),
    }


def evaluate_cbf(user_id: str, k: int = DEFAULT_K) -> dict:
    """CBF evaluation using content-proxy relevance (genre/author overlap)."""
    from cbf import cbf_scores_for_user, build_embeddings
    from data_loader import get_books_df, get_user_signals

    build_embeddings()
    signals = get_user_signals(user_id)
    df = get_books_df()

    excluded = set(signals["reading_list_isbns"]) | set(signals["rated"].keys())
    candidates = [isbn for isbn in df["isbn13"].tolist() if isbn not in excluded] or df["isbn13"].tolist()

    relevant = _cbf_relevant_isbns(user_id)
    if not relevant:
        return {
            "component": "CBF", "user_id": user_id, "k": k,
            "precision_at_k": None,
            "note": "Cannot determine CBF relevance — no favourites or genre preferences found.",
        }

    raw = cbf_scores_for_user(
        favourite_isbns=signals["favourite_isbns"],
        preferred_genres=signals["genres"],
        candidate_isbns=candidates,
    )
    ranked = sorted(raw, key=lambda x: raw[x], reverse=True)
    p = precision_at_k(ranked, relevant, k)

    return {
        "component": "CBF", "user_id": user_id, "k": k,
        "precision_at_k": round(p, 4),
        "relevant_pool_size": len(relevant),
        "top_k_titles": _isbn_to_title(ranked[:k]),
    }


def evaluate_hybrid(user_id: str, k: int = DEFAULT_K, ratings_df=None) -> dict:
    """Hybrid evaluation using held-out ratings when available, else CBF proxy."""
    from hybrid import get_recommendations

    if ratings_df is None:
        ratings_df = _fetch_all_ratings()

    _, held_out_liked = _split_ratings(ratings_df, user_id)

    if held_out_liked:
        relevant = held_out_liked
        relevance_source = "held-out ratings"
    else:
        relevant = _cbf_relevant_isbns(user_id)
        relevance_source = "CBF content proxy"

    if not relevant:
        return {
            "component": "Hybrid", "user_id": user_id, "k": k,
            "precision_at_k": None,
            "note": "No relevance signal available.",
        }

    results = get_recommendations(user_id=user_id, top_n=max(k * 10, 200))
    ranked = [r["isbn13"] for r in results]
    weights = results[0].get("_weights") if results else {}

    p = precision_at_k(ranked, relevant, k)

    return {
        "component": "Hybrid", "user_id": user_id, "k": k,
        "precision_at_k": round(p, 4),
        "relevance_source": relevance_source,
        "held_out_liked_count": len(held_out_liked),
        "learned_weights": weights,
        "top_k_titles": _isbn_to_title(ranked[:k]),
        "relevant_titles": _isbn_to_title(list(relevant)[:5]),
    }


async def evaluate_chatbot(user_id: str, query: str, k: int = DEFAULT_K, ratings_df=None) -> dict:
    """Chatbot evaluation: how many returned cards match the user's query intent."""
    from chatbot import chat, _normalize_text
    from vector_store import clean_search_query
    from data_loader import get_books_df

    df = get_books_df()
    books_index = {
        str(row["title"]).lower(): {
            "isbn13": str(row["isbn13"]),
            "title": str(row.get("title", "")),
            "authors": str(row.get("authors", "")),
            "categories": str(row.get("categories", "")),
            "thumbnail": str(row.get("thumbnail", "")),
            "description": str(row.get("description", ""))[:700],
            "average_rating": float(row.get("average_rating", 0)),
        }
        for _, row in df.iterrows()
    }

    result = await chat([{"role": "user", "content": query}], books_index)
    cards = result.get("book_cards", [])
    query_tokens = [
        token
        for token in clean_search_query(query).split()
        if len(token) > 1
    ]

    def _card_matches_query(card: dict) -> bool:
        if not query_tokens:
            return bool(card.get("title"))
        searchable_tokens = set(
            _normalize_text(
                " ".join(
                    [
                        str(card.get("title", "")),
                        str(card.get("authors", "")),
                        str(card.get("categories", "")),
                        str(card.get("description", "")),
                    ]
                )
            ).split()
        )
        return any(token.lower() in searchable_tokens for token in query_tokens)

    ranked_relevance = [str(card.get("isbn13", "")) for card in cards if _card_matches_query(card)]
    ranked_cards = [str(card.get("isbn13", "")) for card in cards]
    relevant_returned = set(ranked_relevance)

    if not ranked_cards:
        return {
            "component": "Chatbot", "user_id": user_id, "query": query, "k": k,
            "precision_at_k": None,
            "note": "Chatbot returned no book cards.",
            "cards_returned": 0,
            "retrieval_query": clean_search_query(query),
            "reply_preview": result.get("reply", "")[:200],
        }

    p = precision_at_k(ranked_cards, relevant_returned, k)
    return {
        "component": "Chatbot", "user_id": user_id, "query": query, "k": k,
        "precision_at_k": round(p, 4),
        "relevance_source": "query/catalog term match",
        "retrieval_query": result.get("retrieval_query") or clean_search_query(query),
        "cards_returned": len(cards),
        "relevant_cards_returned": len(relevant_returned),
        "card_titles": [c.get("title", "") for c in cards],
        "reply_preview": result.get("reply", "")[:200],
    }


# ---------------------------------------------------------------------------
# Multi-user aggregation
# ---------------------------------------------------------------------------

def evaluate_all(
    k: int = DEFAULT_K,
    components: list[str] = ("cf", "cbf", "hybrid"),
    user_ids: Optional[list[str]] = None,
    max_users: int = 50,
) -> dict:
    from cbf import build_embeddings
    from hybrid import train_hybrid

    ratings_df = _fetch_all_ratings()
    if user_ids is None:
        all_users = ratings_df["user_id"].unique().tolist()
        random.seed(RANDOM_SEED)
        random.shuffle(all_users)
        user_ids = all_users[:max_users]

    build_embeddings()
    train_hybrid()

    scores: dict[str, list[float]] = defaultdict(list)

    for i, uid in enumerate(user_ids):
        print(f"  [{i+1}/{len(user_ids)}] Evaluating {uid[:8]}...")
        if "cf" in components:
            r = evaluate_cf(uid, k=k, ratings_df=ratings_df)
            if r["precision_at_k"] is not None:
                scores["CF"].append(r["precision_at_k"])
        if "cbf" in components:
            r = evaluate_cbf(uid, k=k)
            if r["precision_at_k"] is not None:
                scores["CBF"].append(r["precision_at_k"])
        if "hybrid" in components:
            r = evaluate_hybrid(uid, k=k, ratings_df=ratings_df)
            if r["precision_at_k"] is not None:
                scores["Hybrid"].append(r["precision_at_k"])

    summary = {}
    for comp, vals in scores.items():
        if vals:
            summary[comp] = {
                "mean_precision_at_k": round(sum(vals) / len(vals), 4),
                "min": round(min(vals), 4),
                "max": round(max(vals), 4),
                "evaluated_users": len(vals),
            }
        else:
            summary[comp] = {"mean_precision_at_k": None, "evaluated_users": 0}

    return {"k": k, "total_users_attempted": len(user_ids), "results": summary}


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def _print_result(r: dict, as_json: bool = False):
    if as_json:
        print(json.dumps(r, indent=2))
        return
    comp = r.get("component", "?")
    uid = r.get("user_id", "")[:8]
    k = r.get("k", "?")
    p = r.get("precision_at_k")
    note = r.get("note", "")
    if p is None:
        print(f"[{comp}] user={uid}... k={k}  →  P@K = N/A   ({note})")
    else:
        print(f"[{comp}] user={uid}... k={k}  →  P@K = {p:.4f}")
        if r.get("learned_weights"):
            w = r["learned_weights"]
            print(f"         learned weights: cf={w.get('cf', '?')}, cbf={w.get('cbf', '?')}")
        if r.get("top_k_titles"):
            print(f"         top-{k}: {r['top_k_titles'][:4]}")
        if r.get("relevant_titles"):
            print(f"         relevant: {r['relevant_titles'][:4]}")
        if r.get("retrieval_query"):
            print(f"         retrieval query: {r['retrieval_query']}")
        if r.get("card_titles"):
            print(f"         cards: {r['card_titles']}")
        if r.get("reply_preview"):
            print(f"         reply: {r['reply_preview']}")


def main():
    parser = argparse.ArgumentParser(description="BookWise Precision@K evaluator")
    parser.add_argument("--user-id", type=str)
    parser.add_argument("--all-users", action="store_true")
    parser.add_argument("--max-users", type=int, default=50)
    parser.add_argument("--k", type=int, default=DEFAULT_K)
    parser.add_argument("--components", nargs="+", choices=["cf", "cbf", "hybrid"],
                        default=["cf", "cbf", "hybrid"])
    parser.add_argument("--chatbot-query", type=str)
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()

    if args.all_users:
        print(f"Running Precision@{args.k} across up to {args.max_users} users ...")
        summary = evaluate_all(k=args.k, components=args.components, max_users=args.max_users)
        if args.json:
            print(json.dumps(summary, indent=2))
        else:
            print(f"\n=== Precision@{args.k} Summary ===")
            for comp, stats in summary["results"].items():
                mean = stats.get("mean_precision_at_k")
                n = stats.get("evaluated_users", 0)
                if mean is not None:
                    print(f"  {comp:8s}  mean={mean:.4f}  min={stats['min']:.4f}  max={stats['max']:.4f}  n={n}")
                else:
                    print(f"  {comp:8s}  N/A (no evaluable users)")
        return

    if not args.user_id:
        print("Error: provide --user-id <uuid> or --all-users")
        return

    # Single-user path — import ML lazily here (avoids the DLL crash at module load)
    from cbf import build_embeddings
    from hybrid import train_hybrid

    print("Loading embeddings and training model ...")
    build_embeddings()
    train_hybrid()

    ratings_df = _fetch_all_ratings()

    for comp in args.components:
        if comp == "cf":
            r = evaluate_cf(args.user_id, k=args.k, ratings_df=ratings_df)
        elif comp == "cbf":
            r = evaluate_cbf(args.user_id, k=args.k)
        else:
            r = evaluate_hybrid(args.user_id, k=args.k, ratings_df=ratings_df)
        _print_result(r, as_json=args.json)

    if args.chatbot_query:
        r = asyncio.run(evaluate_chatbot(
            user_id=args.user_id,
            query=args.chatbot_query,
            k=args.k,
            ratings_df=ratings_df,
        ))
        _print_result(r, as_json=args.json)


if __name__ == "__main__":
    main()
