import os

import httpx

from vector_store import search_books_by_query

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-1.5-flash")

SYSTEM_PROMPT = """You are BookWise Assistant, a friendly and grounded book recommendation chatbot.

You help users by:
- Recommending books based on their mood, interests, or descriptions
- Answering questions about specific books from the dataset
- Suggesting books by vibe while staying strictly inside the retrieved catalog

Rules:
- Only discuss or recommend books that appear in the retrieved catalog context
- Never introduce books, authors, or facts outside that retrieved catalog
- If the retrieved catalog is not enough, say so clearly instead of guessing
- When recommending books, always format each one exactly like this on its own line:
BOOK: <exact title> | <exact author>
- Keep responses friendly, concise, and useful
"""


def _normalize_role(role: str) -> str:
    return "model" if role == "assistant" else "user"


def _build_catalog_context(matches: list[dict], books_index: dict) -> str:
    isbn_lookup = {
        str(book["isbn13"]): book for book in (books_index or {}).values()
    }
    lines = []

    for match in matches:
        isbn13 = str(match.get("isbn13", ""))
        similarity = float(match.get("similarity", 0.0))

        book = isbn_lookup.get(isbn13)
        if not book:
            continue

        lines.append(
            "\n".join(
                [
                    f"ISBN13: {book['isbn13']}",
                    f"Title: {book['title']}",
                    f"Authors: {book['authors']}",
                    f"Genres: {book['categories']}",
                    f"Average rating: {book.get('average_rating', 0)}",
                    f"Description: {book.get('description', '')}",
                    f"Similarity: {similarity:.4f}",
                ]
            )
        )

    if not lines:
        return "No retrieved books were found for this query."

    return "\n\n".join(lines)


def _extract_reply_text(data: dict) -> str:
    candidates = data.get("candidates") or []
    if not candidates:
        return "I couldn't generate a response right now."

    parts = candidates[0].get("content", {}).get("parts", [])
    texts = [part.get("text", "") for part in parts if part.get("text")]
    return "\n".join(texts).strip() or "I couldn't generate a response right now."


def _extract_book_cards(reply: str, books_index: dict) -> list[dict]:
    cards = []
    seen = set()

    for line in reply.split("\n"):
        if "BOOK:" not in line:
            continue

        try:
            title_part = line.split("BOOK:", 1)[1].split("|", 1)[0].strip().lower()
        except Exception:
            continue

        for key, book in books_index.items():
            if title_part == key or title_part in key or key in title_part:
                if book["isbn13"] not in seen:
                    seen.add(book["isbn13"])
                    cards.append(book)
                break

    return cards


async def chat(messages: list[dict], books_index: dict = None) -> dict:
    if not GEMINI_API_KEY:
        raise RuntimeError("Missing GEMINI_API_KEY in backend environment.")

    if not messages:
        return {"reply": "Ask me about a mood, genre, or book.", "book_cards": []}

    latest_user_message = next(
        (message["content"] for message in reversed(messages) if message["role"] == "user"),
        "",
    )

    retrieved_books = search_books_by_query(latest_user_message, top_n=8) if latest_user_message else []
    catalog_context = _build_catalog_context(retrieved_books, books_index or {})

    grounding_message = {
        "role": "user",
        "parts": [
            {
                "text": (
                    f"{SYSTEM_PROMPT}\n\n"
                    "Use only the following retrieved catalog entries when answering.\n\n"
                    f"RETRIEVED CATALOG:\n{catalog_context}"
                )
            }
        ],
    }

    contents = [grounding_message]
    contents.extend(
        {
            "role": _normalize_role(message["role"]),
            "parts": [{"text": message["content"]}],
        }
        for message in messages
    )

    url = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        f"{GEMINI_MODEL}:generateContent"
    )

    async with httpx.AsyncClient(timeout=90.0) as client:
        response = await client.post(
            url,
            headers={
                "Content-Type": "application/json",
                "x-goog-api-key": GEMINI_API_KEY,
            },
            json={
                "contents": contents,
                "generationConfig": {
                    "temperature": 0.4,
                    "topP": 0.9,
                    "maxOutputTokens": 600,
                },
            },
        )
        response.raise_for_status()
        data = response.json()

    reply = _extract_reply_text(data)
    book_cards = _extract_book_cards(reply, books_index or {})

    return {"reply": reply, "book_cards": book_cards}
