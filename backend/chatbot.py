import logging
import os
import re
from pathlib import Path

import httpx
from dotenv import load_dotenv

from vector_store import clean_search_query, search_books_by_query

BACKEND_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BACKEND_DIR.parent

load_dotenv(BACKEND_DIR / ".env")
load_dotenv(PROJECT_ROOT / ".env")

logger = logging.getLogger(__name__)
DEFAULT_GEMINI_MODEL = "gemini-2.5-flash"
GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
GEMINI_TIMEOUT = httpx.Timeout(connect=10.0, read=60.0, write=20.0, pool=20.0)
FALLBACK_STOPWORDS = {
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
    "something",
    "suggest",
    "the",
    "want",
}
RECOMMENDATION_WORDS = {
    "book",
    "books",
    "find",
    "give",
    "recommend",
    "show",
    "suggest",
}

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
    normalized = str(role or "user").strip().lower()
    if normalized in {"assistant", "model"}:
        return "model"
    return "user"


def _get_gemini_config() -> tuple[str, str]:
    api_key = (os.getenv("GEMINI_API_KEY") or "").strip()
    model = (os.getenv("GEMINI_MODEL") or DEFAULT_GEMINI_MODEL).strip()
    return api_key, model or DEFAULT_GEMINI_MODEL


def _build_catalog_context(matches: list[dict], books_index: dict) -> str:
    isbn_lookup = {
        str(book["isbn13"]): book for book in (books_index or {}).values()
    }
    lines = []

    for index, match in enumerate(matches or [], start=1):
        isbn13 = str(match.get("isbn13", ""))
        similarity = float(match.get("similarity", 0.0))

        book = isbn_lookup.get(isbn13, {})
        title = str(match.get("title") or book.get("title") or "").strip()
        authors = str(match.get("authors") or book.get("authors") or "").strip()
        categories = str(match.get("categories") or book.get("categories") or "").strip()
        description = str(match.get("description") or book.get("description") or "").strip()
        average_rating = match.get("average_rating", book.get("average_rating", 0))

        if not title and not authors and not description:
            continue

        lines.append(
            "\n".join(
                [
                    f"Match #{index}",
                    f"ISBN13: {isbn13 or book.get('isbn13', '')}",
                    f"Title: {title}",
                    f"Authors: {authors}",
                    f"Genres: {categories}",
                    f"Average rating: {average_rating}",
                    f"Description: {description[:700]}",
                    f"Similarity: {similarity:.4f}",
                ]
            )
        )

    if not lines:
        return "No retrieved books were found for this query."

    return "\n\n".join(lines)


def _extract_reply_text(data: dict) -> str | None:
    if not isinstance(data, dict):
        logger.error("[Chatbot] Gemini response was not a JSON object: %r", data)
        return None

    prompt_feedback = data.get("promptFeedback") or {}
    block_reason = prompt_feedback.get("blockReason")
    if block_reason:
        logger.warning(
            "[Chatbot] Gemini blocked the prompt. blockReason=%s feedback=%s",
            block_reason,
            prompt_feedback,
        )

    candidates = data.get("candidates") or []
    if not candidates:
        logger.warning("[Chatbot] Gemini returned no candidates. Body=%s", data)
        return None

    candidate = candidates[0] or {}
    parts = candidate.get("content", {}).get("parts", [])
    texts = [
        str(part.get("text", "")).strip()
        for part in parts
        if isinstance(part, dict) and part.get("text")
    ]
    reply = "\n".join(text for text in texts if text).strip()

    if reply:
        return reply

    finish_reason = candidate.get("finishReason")
    safety_ratings = candidate.get("safetyRatings")
    logger.warning(
        "[Chatbot] Gemini returned an empty reply. finishReason=%s safetyRatings=%s body=%s",
        finish_reason,
        safety_ratings,
        data,
    )
    return None


def _extract_book_cards(reply: str, books_index: dict) -> list[dict]:
    cards = []
    seen = set()

    for line in reply.split("\n"):
        if "BOOK:" not in line:
            continue

        try:
            title_part = _normalize_text(line.split("BOOK:", 1)[1].split("|", 1)[0])
        except Exception:
            continue

        if len(_normalize_text(title_part)) < 3:
            continue

        for key, book in books_index.items():
            normalized_key = _normalize_text(key)
            if title_part == normalized_key:
                if book["isbn13"] not in seen:
                    seen.add(book["isbn13"])
                    cards.append(book)
                break

    return cards


def _normalize_text(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", str(value).lower()).strip()


def _significant_tokens(value: str) -> list[str]:
    return [
        token
        for token in _normalize_text(value).split()
        if len(token) > 1 and token not in FALLBACK_STOPWORDS
    ]


def _catalog_books(books_index: dict) -> list[dict]:
    books = []
    seen = set()

    for book in (books_index or {}).values():
        isbn13 = str(book.get("isbn13", ""))
        if not isbn13 or isbn13 in seen:
            continue

        seen.add(isbn13)
        books.append(book)

    return books


def _book_from_match(match: dict, books_index: dict) -> dict | None:
    isbn13 = str(match.get("isbn13", ""))
    isbn_lookup = {
        str(book["isbn13"]): book for book in (books_index or {}).values()
    }
    book = dict(isbn_lookup.get(isbn13, {}))

    if not book:
        title = str(match.get("title", "")).strip()
        authors = str(match.get("authors", "")).strip()
        categories = str(match.get("categories", "")).strip()
        description = str(match.get("description", "")).strip()

        if not isbn13 and not title and not authors and not description:
            return None

        book = {
            "isbn13": isbn13,
            "title": title,
            "authors": authors,
            "categories": categories,
            "thumbnail": str(match.get("thumbnail", "")),
            "description": description[:700],
            "average_rating": float(match.get("average_rating", 0) or 0),
        }

    return book


def _books_from_retrieved_matches(retrieved_books: list[dict], books_index: dict, limit: int = 4) -> list[dict]:
    books = []
    seen = set()

    for match in retrieved_books or []:
        book = _book_from_match(match, books_index)
        if not book:
            continue

        isbn13 = str(book.get("isbn13", ""))
        dedupe_key = isbn13 or _normalize_text(book.get("title", ""))
        if not dedupe_key or dedupe_key in seen:
            continue

        seen.add(dedupe_key)
        books.append(book)
        if len(books) >= limit:
            break

    return books


def _is_relevant_to_query(query: str, book: dict) -> bool:
    tokens = set(_significant_tokens(query))
    if not tokens:
        return True

    title = set(_significant_tokens(book.get("title", "")))
    authors = set(_significant_tokens(book.get("authors", "")))
    categories = set(_significant_tokens(book.get("categories", "")))
    description = set(_significant_tokens(book.get("description", "")))
    searchable = title | authors | categories | description
    return bool(tokens & searchable)


def _rank_catalog_books(query: str, books_index: dict, retrieved_books: list[dict] | None = None, limit: int = 4) -> list[dict]:
    candidates = _books_from_retrieved_matches(retrieved_books or [], books_index, limit=20)
    candidates = [book for book in candidates if _is_relevant_to_query(query, book)]

    local_matches = _find_local_catalog_matches(query, books_index, limit=20)
    seen = {str(book.get("isbn13", "")) for book in candidates}
    for book in local_matches:
        isbn13 = str(book.get("isbn13", ""))
        if isbn13 and isbn13 not in seen:
            candidates.append(book)
            seen.add(isbn13)

    scored = [
        (_score_local_match(_normalize_text(query), _significant_tokens(query), book), book)
        for book in candidates
    ]
    scored = [(score, book) for score, book in scored if score > 0]
    scored.sort(
        key=lambda item: (
            item[0],
            float(item[1].get("average_rating", 0) or 0),
            str(item[1].get("title", "")).lower(),
        ),
        reverse=True,
    )
    return [book for _, book in scored[:limit]]


def _score_local_match(query: str, query_tokens: list[str], book: dict) -> float:
    title = _normalize_text(book.get("title", ""))
    authors = _normalize_text(book.get("authors", ""))
    categories = _normalize_text(book.get("categories", ""))
    description = _normalize_text(book.get("description", ""))
    combined = " ".join([title, authors, categories, description]).strip()
    title_tokens = set(_significant_tokens(book.get("title", "")))
    author_tokens = set(_significant_tokens(book.get("authors", "")))
    category_tokens = set(_significant_tokens(book.get("categories", "")))
    description_tokens = set(_significant_tokens(book.get("description", "")))
    combined_tokens = title_tokens | author_tokens | category_tokens | description_tokens

    if not combined:
        return 0.0

    score = 0.0

    is_phrase_query = bool(query and " " in query)
    if is_phrase_query and query in title:
        score += 40
    elif is_phrase_query and query in combined:
        score += 20

    for token in query_tokens:
        if token in title_tokens:
            score += 10
        elif token in author_tokens:
            score += 7
        elif token in category_tokens:
            score += 4
        elif token in description_tokens:
            score += 2

    if query_tokens and all(token in title_tokens for token in query_tokens):
        score += 20
    elif query_tokens and all(token in combined_tokens for token in query_tokens):
        score += 10

    score += min(float(book.get("average_rating", 0) or 0), 5.0)
    return score


def _find_local_catalog_matches(query: str, books_index: dict, limit: int = 4) -> list[dict]:
    normalized_query = _normalize_text(query)
    query_tokens = _significant_tokens(query)
    scored_matches = []

    for book in _catalog_books(books_index):
        score = _score_local_match(normalized_query, query_tokens, book)
        if score <= 0:
            continue

        scored_matches.append((score, float(book.get("average_rating", 0) or 0), book))

    scored_matches.sort(
        key=lambda item: (
            item[0],
            item[1],
            str(item[2].get("title", "")).lower(),
        ),
        reverse=True,
    )

    return [book for _, _, book in scored_matches[:limit]]


def _prioritize_series_starter(query: str, books: list[dict]) -> list[dict]:
    normalized_query = _normalize_text(query)
    if "harry potter" not in normalized_query:
        return books

    specific_markers = [
        "chamber",
        "azkaban",
        "goblet",
        "phoenix",
        "half blood",
        "deathly",
        "book 2",
        "book 3",
        "book 4",
        "book 5",
        "book 6",
        "book 7",
    ]
    if any(marker in normalized_query for marker in specific_markers):
        return books

    starter_index = next(
        (
            index
            for index, book in enumerate(books)
            if "sorcerer" in _normalize_text(book.get("title", ""))
            or "(book 1)" in str(book.get("title", "")).lower()
        ),
        None,
    )
    if starter_index in (None, 0):
        return books

    starter = books[starter_index]
    return [starter] + books[:starter_index] + books[starter_index + 1 :]


def _format_book_lines(books: list[dict]) -> list[str]:
    return [f"BOOK: {book['title']} | {book['authors']}" for book in books if book.get("title")]


def _is_recommendation_query(query: str) -> bool:
    normalized = _normalize_text(query)
    tokens = set(normalized.split())
    return bool(tokens & RECOMMENDATION_WORDS) or bool(_significant_tokens(query))


def _catalog_success_response(query: str, books: list[dict]) -> dict:
    cleaned_query = clean_search_query(query)
    reply_lines = []
    if cleaned_query:
        reply_lines.append(f"I searched the catalog for: {cleaned_query}")
    reply_lines.append("Here are relevant books I found in the catalog:")
    reply_lines.extend(_format_book_lines(books[:4]))
    return {
        "reply": "\n".join(reply_lines),
        "book_cards": books[:4],
        "retrieval_query": cleaned_query,
    }


def _gemini_failure_kind(exc: Exception) -> str:
    if isinstance(exc, httpx.HTTPStatusError):
        status_code = exc.response.status_code
        if status_code == 429:
            return "rate_limit"
        if status_code in {408, 502, 503, 504}:
            return "connection"
        if status_code in {401, 403}:
            return "auth"
        return "http_error"

    if isinstance(exc, (httpx.ConnectError, httpx.ConnectTimeout, httpx.ReadTimeout, httpx.WriteError)):
        return "connection"

    if isinstance(exc, ValueError):
        return "invalid_json"

    return "unknown"


def _log_gemini_failure(exc: Exception, model: str, response_text: str | None = None):
    failure_kind = _gemini_failure_kind(exc)
    if isinstance(exc, httpx.HTTPStatusError):
        logger.error(
            "[Chatbot] Gemini request failed. kind=%s model=%s status=%s body=%s",
            failure_kind,
            model,
            exc.response.status_code,
            response_text or exc.response.text[:1200],
        )
        return

    logger.exception(
        "[Chatbot] Gemini request failed. kind=%s model=%s response_body=%s",
        failure_kind,
        model,
        response_text or "",
    )


def _grounded_fallback_response(
    query: str,
    books_index: dict,
    retrieved_books: list[dict] | None = None,
    failure_kind: str = "unknown",
) -> dict:
    matches = _rank_catalog_books(query, books_index, retrieved_books=retrieved_books)
    matches = _prioritize_series_starter(query, matches)

    if not matches:
        return {
            "reply": (
                "I couldn't generate a full AI answer just now, but I can still search the "
                "catalog. Try asking for a genre, mood, author, or title."
            ),
            "book_cards": [],
            "fallback": True,
            "fallback_reason": failure_kind,
        }

    normalized_query = _normalize_text(query)
    cleaned_query = clean_search_query(query)
    if cleaned_query and cleaned_query != _normalize_text(query):
        reply_lines = [f"I searched the catalog for: {cleaned_query}"]
    else:
        reply_lines = ["Here are relevant books I found in the catalog:"]

    if "harry potter" in normalized_query:
        reply_lines.append("If you want to start Harry Potter, begin with:")
        first_book = matches[0]
        reply_lines.append(
            f"BOOK: {first_book['title']} | {first_book['authors']}"
        )

        remaining = matches[1:4]
        if remaining:
            reply_lines.append("You could continue with:")
            reply_lines.extend(_format_book_lines(remaining))
    else:
        if reply_lines[0] != "Here are relevant books I found in the catalog:":
            reply_lines.append("Here are relevant books I found in the catalog:")
        reply_lines.extend(_format_book_lines(matches[:4]))

    return {
        "reply": "\n".join(reply_lines),
        "book_cards": matches[:4],
        "fallback": True,
        "fallback_reason": failure_kind,
    }


def _build_gemini_contents(messages: list[dict], catalog_context: str) -> list[dict]:
    grounding_message = {
        "role": "user",
        "parts": [
            {
                "text": (
                    "Catalog grounding for this conversation.\n"
                    "Use only the following retrieved catalog entries when answering.\n\n"
                    f"RETRIEVED CATALOG:\n{catalog_context}"
                )
            }
        ],
    }
    contents = [grounding_message]

    for message in messages:
        content = str(message.get("content", "")).strip()
        if not content:
            continue

        contents.append(
            {
                "role": _normalize_role(message.get("role", "user")),
                "parts": [{"text": content}],
            }
        )

    return contents


async def chat(messages: list[dict], books_index: dict = None) -> dict:
    if not messages:
        return {"reply": "Ask me about a mood, genre, or book.", "book_cards": []}

    latest_user_message = next(
        (message["content"] for message in reversed(messages) if message["role"] == "user"),
        "",
    )

    gemini_api_key, gemini_model = _get_gemini_config()
    if not gemini_api_key:
        logger.error("[Chatbot] Missing GEMINI_API_KEY. Falling back to grounded catalog response.")
        return _grounded_fallback_response(
            latest_user_message,
            books_index or {},
            failure_kind="auth",
        )

    try:
        retrieved_books = (
            search_books_by_query(latest_user_message, top_n=8)
            if latest_user_message
            else []
        )
    except Exception:
        logger.exception("[Chatbot] Vector search failed for query=%r", latest_user_message)
        retrieved_books = []

    catalog_cards = _rank_catalog_books(
        latest_user_message,
        books_index or {},
        retrieved_books=retrieved_books,
    )
    catalog_cards = _prioritize_series_starter(latest_user_message, catalog_cards)

    if _is_recommendation_query(latest_user_message) and catalog_cards:
        return _catalog_success_response(latest_user_message, catalog_cards)

    catalog_context = _build_catalog_context(catalog_cards or retrieved_books, books_index or {})
    contents = _build_gemini_contents(messages, catalog_context)
    url = GEMINI_API_URL.format(model=gemini_model)

    try:
        async with httpx.AsyncClient(timeout=GEMINI_TIMEOUT) as client:
            response = await client.post(
                url,
                headers={
                    "Accept": "application/json",
                    "Content-Type": "application/json",
                },
                params={"key": gemini_api_key},
                json={
                    "systemInstruction": {
                        "parts": [{"text": SYSTEM_PROMPT}],
                    },
                    "contents": contents,
                    "generationConfig": {
                        "temperature": 0.4,
                        "topP": 0.9,
                        "maxOutputTokens": 600,
                    },
                },
            )
            response_text = response.text
            response.raise_for_status()
            try:
                data = response.json()
            except ValueError as exc:
                _log_gemini_failure(exc, gemini_model, response_text=response_text[:1200])
                return _grounded_fallback_response(
                    latest_user_message,
                    books_index or {},
                    retrieved_books=retrieved_books,
                    failure_kind="invalid_json",
                )
    except httpx.HTTPError as exc:
        _log_gemini_failure(exc, gemini_model)
        return _grounded_fallback_response(
            latest_user_message,
            books_index or {},
            retrieved_books=retrieved_books,
            failure_kind=_gemini_failure_kind(exc),
        )

    reply = _extract_reply_text(data)
    if not reply:
        return _grounded_fallback_response(
            latest_user_message,
            books_index or {},
            retrieved_books=retrieved_books,
            failure_kind="empty_response",
        )

    book_cards = [
        book
        for book in _extract_book_cards(reply, books_index or {})
        if _is_relevant_to_query(latest_user_message, book)
    ]
    if not book_cards:
        book_cards = catalog_cards

    return {"reply": reply, "book_cards": book_cards}
