from typing import Optional
import numpy as np
import pandas as pd
from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity
from data_loader import get_books_df

# Loaded once at startup
_model: Optional[SentenceTransformer] = None
_embeddings: Optional[np.ndarray] = None
_isbn_index: Optional[dict] = None   # isbn13 → row index


def _get_model() -> SentenceTransformer:
    global _model
    if _model is None:
        print("[CBF] Loading all-MiniLM-L6-v2 ...")
        _model = SentenceTransformer("all-MiniLM-L6-v2")
        print("[CBF] Model loaded.")
    return _model


def _build_text(row: pd.Series) -> str:
    title = row.get("title", "")
    authors = row.get("authors", "")
    categories = row.get("categories", "")
    description = str(row.get("description", ""))[:300]
    return f"{title} {title} {title} {authors} {authors} {categories} {categories} {description}"


def build_embeddings():
    global _embeddings, _isbn_index
    df = get_books_df()
    model = _get_model()
    texts = [_build_text(row) for _, row in df.iterrows()]
    print(f"[CBF] Embedding {len(texts)} books ...")
    _embeddings = model.encode(texts, batch_size=64, show_progress_bar=True, normalize_embeddings=True)
    _isbn_index = {isbn: idx for idx, isbn in enumerate(df["isbn13"].tolist())}
    print("[CBF] Embeddings ready.")


def get_embeddings():
    if _embeddings is None or _isbn_index is None:
        build_embeddings()
    return _embeddings, _isbn_index


def cbf_scores_for_user(favourite_isbns: list, preferred_genres: list, candidate_isbns: list) -> dict:
    embeddings, isbn_index = get_embeddings()
    model = _get_model()
    seed_vectors = []

    for isbn in favourite_isbns:
        if isbn in isbn_index:
            seed_vectors.append(embeddings[isbn_index[isbn]])

    if preferred_genres:
        genre_text = " ".join(preferred_genres)
        genre_vec = model.encode([genre_text], normalize_embeddings=True)[0]
        seed_vectors.append(genre_vec * 0.5)

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