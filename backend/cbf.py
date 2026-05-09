from typing import Optional

import numpy as np
from sklearn.metrics.pairwise import cosine_similarity

from data_loader import get_books_df
from embedding_store import encode_text, get_book_embedding_bundle

_embeddings: Optional[np.ndarray] = None
_isbn_index: Optional[dict[str, int]] = None


def build_embeddings(force_rebuild: bool = False):
    global _embeddings, _isbn_index
    _embeddings, _isbn_index = get_book_embedding_bundle(force_rebuild=force_rebuild)
    print("[CBF] Embeddings ready.")


def get_embeddings():
    if _embeddings is None or _isbn_index is None:
        build_embeddings()
    return _embeddings, _isbn_index


def _genre_centroid_from_catalog(preferred_genres: list, embeddings: np.ndarray, isbn_index: dict[str, int]) -> Optional[np.ndarray]:
    wanted = {str(genre).strip().lower() for genre in preferred_genres if str(genre).strip()}
    if not wanted:
        return None

    df = get_books_df()
    matched_vectors = []
    for _, row in df.iterrows():
        categories = {
            category.strip().lower()
            for category in str(row.get("categories", "")).split(",")
            if category.strip()
        }
        if not categories & wanted:
            continue

        isbn = str(row.get("isbn13", ""))
        if isbn in isbn_index:
            matched_vectors.append(embeddings[isbn_index[isbn]])

    if not matched_vectors:
        return None

    return np.mean(matched_vectors, axis=0)


def cbf_scores_for_user(favourite_isbns: list, preferred_genres: list, candidate_isbns: list) -> dict:
    embeddings, isbn_index = get_embeddings()
    seed_vectors = []

    for isbn in favourite_isbns:
        if isbn in isbn_index:
            seed_vectors.append(embeddings[isbn_index[isbn]])

    if preferred_genres:
        genre_text = "Genres: " + " ".join(preferred_genres)
        try:
            genre_vec = encode_text(genre_text)
        except Exception as exc:
            print(f"[CBF] Torch text encoding failed for genres; using catalog centroid fallback. {exc}")
            genre_vec = _genre_centroid_from_catalog(preferred_genres, embeddings, isbn_index)
        if genre_vec is not None:
            seed_vectors.append(genre_vec * 0.75)

    if not seed_vectors:
        return {isbn: 0.0 for isbn in candidate_isbns}

    seed = np.mean(seed_vectors, axis=0, keepdims=True)
    candidate_indices = [isbn_index[isbn] for isbn in candidate_isbns if isbn in isbn_index]
    valid_isbns = [isbn for isbn in candidate_isbns if isbn in isbn_index]

    if not valid_isbns:
        return {isbn: 0.0 for isbn in candidate_isbns}

    candidate_embeddings = embeddings[candidate_indices]
    sims = cosine_similarity(seed, candidate_embeddings)[0]
    scores = {isbn: float(sim) for isbn, sim in zip(valid_isbns, sims)}
    for isbn in candidate_isbns:
        if isbn not in scores:
            scores[isbn] = 0.0
    return scores


def cbf_similar_books(isbn13: str, candidate_isbns: list, top_n: int = 12) -> list:
    embeddings, isbn_index = get_embeddings()
    if isbn13 not in isbn_index:
        return []
    source_vec = embeddings[isbn_index[isbn13]].reshape(1, -1)
    candidate_indices = [isbn_index[isbn] for isbn in candidate_isbns if isbn in isbn_index]
    valid_isbns = [isbn for isbn in candidate_isbns if isbn in isbn_index]
    if not valid_isbns:
        return []
    candidate_embs = embeddings[candidate_indices]
    sims = cosine_similarity(source_vec, candidate_embs)[0]
    ranked = sorted(zip(valid_isbns, sims), key=lambda x: x[1], reverse=True)
    return [{"isbn13": isbn, "score": float(score)} for isbn, score in ranked[:top_n]]
