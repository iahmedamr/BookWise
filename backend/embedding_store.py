import hashlib
import json
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd
from sentence_transformers import SentenceTransformer

from data_loader import get_books_df

MODEL_NAME = "all-MiniLM-L6-v2"
EMBEDDING_DIM = 384
TEXT_FORMAT_VERSION = "book-text-v2"

BACKEND_DIR = Path(__file__).resolve().parent
CACHE_DIR = BACKEND_DIR / "cache"
CACHE_FILE = CACHE_DIR / "book_embeddings_minilm.npz"
METADATA_FILE = CACHE_DIR / "book_embeddings_minilm_meta.json"

_model: Optional[SentenceTransformer] = None


def get_model() -> SentenceTransformer:
    global _model
    if _model is None:
        print(f"[Embedding Store] Loading {MODEL_NAME} ...")
        _model = SentenceTransformer(MODEL_NAME)
        print("[Embedding Store] Model loaded.")
    return _model


def build_book_text(row: pd.Series) -> str:
    title = str(row.get("title", ""))
    authors = str(row.get("authors", ""))
    categories = str(row.get("categories", ""))
    description = str(row.get("description", ""))[:700]
    return " ".join(
        [
            f"Title: {title}. {title}.",
            f"Genres: {categories}. {categories}. {categories}.",
            f"Description: {description}. {description}.",
            f"Authors: {authors}.",
        ]
    )


def encode_text(text: str) -> np.ndarray:
    model = get_model()
    return model.encode([text], normalize_embeddings=True)[0]


def _current_signature() -> dict:
    df = get_books_df()
    csv_path = Path(df.attrs.get("csv_path", ""))
    stat = csv_path.stat() if csv_path.exists() else None
    return {
        "model_name": MODEL_NAME,
        "embedding_dim": EMBEDDING_DIM,
        "text_format_version": TEXT_FORMAT_VERSION,
        "csv_path": str(csv_path),
        "csv_mtime_ns": stat.st_mtime_ns if stat else None,
        "csv_size": stat.st_size if stat else None,
    }


def _signature_digest(signature: dict) -> str:
    return hashlib.sha256(
        json.dumps(signature, sort_keys=True).encode("utf-8")
    ).hexdigest()


def _load_cached_bundle() -> Optional[tuple[np.ndarray, list[str]]]:
    if not CACHE_FILE.exists() or not METADATA_FILE.exists():
        return None

    try:
        metadata = json.loads(METADATA_FILE.read_text(encoding="utf-8"))
        signature = _current_signature()
        if metadata.get("signature_digest") != _signature_digest(signature):
            return None

        bundle = np.load(CACHE_FILE, allow_pickle=False)
        embeddings = bundle["embeddings"]
        isbns = bundle["isbns"].tolist()
        print(f"[Embedding Store] Loaded {len(isbns)} cached book embeddings.")
        return embeddings, isbns
    except Exception:
        return None


def _save_cached_bundle(embeddings: np.ndarray, isbns: list[str]):
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(CACHE_FILE, embeddings=embeddings, isbns=np.array(isbns))

    signature = _current_signature()
    METADATA_FILE.write_text(
        json.dumps(
            {
                "signature_digest": _signature_digest(signature),
                "signature": signature,
                "count": len(isbns),
            },
            indent=2,
        ),
        encoding="utf-8",
    )


def get_book_embedding_bundle(force_rebuild: bool = False) -> tuple[np.ndarray, dict[str, int]]:
    if not force_rebuild:
        cached = _load_cached_bundle()
        if cached is not None:
            embeddings, isbns = cached
            return embeddings, {isbn: idx for idx, isbn in enumerate(isbns)}

    df = get_books_df()
    model = get_model()
    texts = [build_book_text(row) for _, row in df.iterrows()]
    print(f"[Embedding Store] Building {len(texts)} book embeddings ...")
    embeddings = model.encode(
        texts,
        batch_size=64,
        show_progress_bar=True,
        normalize_embeddings=True,
    )
    isbns = [str(isbn) for isbn in df["isbn13"].tolist()]
    _save_cached_bundle(embeddings, isbns)
    print("[Embedding Store] Book embeddings cached.")
    return embeddings, {isbn: idx for idx, isbn in enumerate(isbns)}
