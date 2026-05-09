import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from data_loader import get_books_df
from cbf import build_embeddings
from hybrid import get_recommendations, get_similar_books, train_hybrid
from chatbot import chat
from vector_store import sync_book_embeddings


@asynccontextmanager
async def lifespan(app: FastAPI):
    print("[Startup] Loading books CSV ...")
    df = get_books_df()

    app.state.books_index = {
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

    print("[Startup] Building CBF embeddings ...")
    build_embeddings()

    print("[Startup] Training hybrid model (CF + blend regressor) ...")
    train_hybrid()   # handles both ALS-CF and weight learning in one call

    print("[Startup] Ready.")
    yield


app = FastAPI(title="BookWise Recommendation API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:8080",
        "http://127.0.0.1:8080",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class RecommendRequest(BaseModel):
    user_id: str
    top_n: int = 100


class SimilarRequest(BaseModel):
    isbn13: str
    top_n: int = 12


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage]


class SyncEmbeddingsRequest(BaseModel):
    limit: int | None = None
    batch_size: int = 250
    force_rebuild_local: bool = False


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/recommend")
def recommend(req: RecommendRequest):
    try:
        results = get_recommendations(user_id=req.user_id, top_n=req.top_n)
        return {"books": results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/similar")
def similar(req: SimilarRequest):
    try:
        results = get_similar_books(isbn13=req.isbn13, top_n=req.top_n)
        return {"books": results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/chat")
async def chatbot(req: ChatRequest):
    try:
        messages = [{"role": m.role, "content": m.content} for m in req.messages]
        result = await chat(messages, app.state.books_index)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/retrain")
def retrain():
    try:
        train_hybrid()
        return {"status": "retrained"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/sync-book-embeddings")
def sync_embeddings(req: SyncEmbeddingsRequest):
    try:
        return sync_book_embeddings(
            limit=req.limit,
            batch_size=req.batch_size,
            force_rebuild_local=req.force_rebuild_local,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))