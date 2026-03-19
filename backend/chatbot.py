import httpx
from data_loader import get_books_df

OLLAMA_URL = "http://localhost:11434/api/chat"
MODEL = "phi3:mini"

SYSTEM_PROMPT = """You are BookWise Assistant, a friendly and knowledgeable book recommendation chatbot.

You help users by:
- Recommending books based on their mood, interests, or descriptions
- Answering questions about specific books (plot, author, genre, themes)
- Helping users find books by vibe (e.g. "something cozy", "dark and thrilling", "like Harry Potter but for adults")

Rules:
- Only recommend books that exist in the catalog provided below
- When recommending books, always format each one exactly like this on its own line:
  📚 BOOK: <exact title> | <exact author>
- Keep responses friendly, concise, and enthusiastic about books
- If asked about something unrelated to books, politely redirect
- If a user describes a mood or feeling, map it to suitable genres and recommend accordingly
- You can recommend 1-5 books per response depending on context
"""


def _build_catalog_context(max_books: int = 400) -> str:
    df = get_books_df()
    sample = (
        df[df["average_rating"] >= 3.5]
        .sort_values("ratings_count", ascending=False)
        .head(max_books)
    )
    lines = []
    for _, row in sample.iterrows():
        lines.append(
            f"{row['title']} by {row['authors']} "
            f"[{row.get('categories', '')}] "
            f"rating:{row.get('average_rating', '')} "
            f"isbn:{row['isbn13']}"
        )
    return "\n".join(lines)


async def chat(messages: list[dict], books_index: dict = None) -> dict:
    """
    Send conversation to Ollama and return structured response.
    books_index: dict of {title.lower(): book_dict} for inline card matching
    Returns: {reply: str, book_cards: list[dict]}
    """
    catalog = _build_catalog_context()
    system_with_catalog = SYSTEM_PROMPT + f"\n\nCATALOG:\n{catalog}"

    ollama_messages = [{"role": "system", "content": system_with_catalog}] + messages

    async with httpx.AsyncClient(timeout=120.0) as client:
        response = await client.post(
            OLLAMA_URL,
            json={
                "model": MODEL,
                "messages": ollama_messages,
                "stream": False,
            },
        )
        response.raise_for_status()
        data = response.json()

    reply = data["message"]["content"]

    # Extract book cards from reply by parsing "📚 BOOK: title | author" lines
    book_cards = []
    if books_index:
        for line in reply.split("\n"):
            if "BOOK:" in line:
                try:
                    part = line.split("BOOK:")[1].strip()
                    title_part = part.split("|")[0].strip().lower()
                    # Find closest match in index
                    for key, book in books_index.items():
                        if title_part in key or key in title_part:
                            book_cards.append(book)
                            break
                except Exception:
                    pass

    return {"reply": reply, "book_cards": book_cards}