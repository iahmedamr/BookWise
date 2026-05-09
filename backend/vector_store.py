from typing import Optional
import re

import numpy as np

from data_loader import get_books_df, get_supabase
from embedding_store import EMBEDDING_DIM, encode_text, get_book_embedding_bundle

SUPABASE_BOOK_EMBEDDINGS_TABLE = "book_embeddings"
SUPABASE_BOOK_MATCH_RPC = "match_book_embeddings"
QUERY_STOPWORDS = {
    "a",
    "an",
    "and",
    "any",
    "book",
    "books",
    "find",
    "for",
    "give",
    "i",
    "like",
    "me",
    "please",
    "recommend",
    "show",
    "something",
    "suggest",
    "the",
    "want",
}


def _vector_literal(values) -> str:
    return "[" + ",".join(f"{float(value):.8f}" for value in values) + "]"


def _query_tokens(query: str) -> list[str]:
    tokens = re.sub(r"[^a-z0-9]+", " ", str(query).lower()).split()
    return [token for token in tokens if len(token) > 1 and token not in QUERY_STOPWORDS]


def clean_search_query(query: str) -> str:
    tokens = _query_tokens(query)
    return " ".join(tokens) or str(query).strip()


def _catalog_centroid_embedding(query: str) -> Optional[np.ndarray]:
    tokens = _query_tokens(query)
    if not tokens:
        return None

    embeddings, isbn_index = get_book_embedding_bundle()
    df = get_books_df()

    weighted_vectors = []
    weights = []

    for _, row in df.iterrows():
        title_tokens = set(_query_tokens(row.get("title", "")))
        author_tokens = set(_query_tokens(row.get("authors", "")))
        category_tokens = set(_query_tokens(row.get("categories", "")))
        description_tokens = set(_query_tokens(row.get("description", "")))

        score = 0.0
        for token in tokens:
            if token in category_tokens:
                score += 6.0
            if token in title_tokens:
                score += 4.0
            if token in author_tokens:
                score += 3.0
            if token in description_tokens:
                score += 1.0

        if score <= 0:
            continue

        isbn13 = str(row.get("isbn13", ""))
        if isbn13 not in isbn_index:
            continue

        weighted_vectors.append(embeddings[isbn_index[isbn13]] * score)
        weights.append(score)

    if not weighted_vectors:
        return None

    centroid = np.sum(weighted_vectors, axis=0) / float(sum(weights))
    norm = np.linalg.norm(centroid)
    if norm > 0:
        centroid = centroid / norm
    return centroid


def search_books_by_query(query: str, top_n: int = 8) -> list[dict]:
    client = get_supabase()
    cleaned_query = clean_search_query(query)

    try:
        query_embedding = encode_text(cleaned_query)
    except Exception as exc:
        print(f"[Vector Store] Text embedding failed; using catalog centroid for query='{cleaned_query}'. {exc}")
        query_embedding = _catalog_centroid_embedding(cleaned_query)
        if query_embedding is None:
            raise

    response = client.rpc(
        SUPABASE_BOOK_MATCH_RPC,
        {
            "query_embedding": _vector_literal(query_embedding),
            "match_count": top_n,
        },
    ).execute()

    return response.data or []


def _get_existing_embedding_isbns() -> set[str]:
    client = get_supabase()
    page = 0
    page_size = 1000
    isbns: set[str] = set()

    while True:
        response = (
            client.table(SUPABASE_BOOK_EMBEDDINGS_TABLE)
            .select("isbn13")
            .range(page * page_size, (page + 1) * page_size - 1)
            .execute()
        )

        rows = response.data or []
        if not rows:
            break

        isbns.update(str(row["isbn13"]) for row in rows if row.get("isbn13"))

        if len(rows) < page_size:
            break

        page += 1

    return isbns


def sync_book_embeddings(limit: Optional[int] = None, batch_size: int = 250, force_rebuild_local: bool = False) -> dict:
    """
    Sync locally generated MiniLM book embeddings into Supabase.
    Local embeddings are cached on disk, so repeated runs avoid recomputing them.
    """
    client = get_supabase()
    df = get_books_df()

    if limit is not None:
        df = df.head(limit)

    embeddings, isbn_index = get_book_embedding_bundle(force_rebuild=force_rebuild_local)
    existing_isbns = _get_existing_embedding_isbns()

    rows_to_sync = []
    for _, row in df.iterrows():
        isbn13 = str(row.get("isbn13", ""))
        if isbn13 in existing_isbns or isbn13 not in isbn_index:
            continue

        rows_to_sync.append(
            {
                "isbn13": isbn13,
                "title": str(row.get("title", "")),
                "authors": str(row.get("authors", "")),
                "categories": str(row.get("categories", "")),
                "description": str(row.get("description", ""))[:700],
                "embedding": _vector_literal(embeddings[isbn_index[isbn13]]),
            }
        )

    total_remaining = len(rows_to_sync)
    if total_remaining == 0:
        print("[Vector Store] All book embeddings already exist. Nothing to sync.")
        return {
            "synced": 0,
            "skipped_existing": len(existing_isbns),
            "dimension": EMBEDDING_DIM,
        }

    synced = 0
    for start in range(0, total_remaining, batch_size):
        payload = rows_to_sync[start : start + batch_size]
        client.table(SUPABASE_BOOK_EMBEDDINGS_TABLE).upsert(
            payload,
            on_conflict="isbn13",
        ).execute()
        synced += len(payload)
        print(f"[Vector Store] Synced {synced}/{total_remaining} new books ...")

    print(f"[Vector Store] Completed sync for {synced} new books.")
    return {
        "synced": synced,
        "skipped_existing": len(existing_isbns),
        "dimension": EMBEDDING_DIM,
    }
