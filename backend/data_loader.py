import os
import pandas as pd
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()

_supabase = None
_books_df = None


def get_supabase():
    global _supabase
    if _supabase is None:
        url = os.getenv("SUPABASE_URL")
        key = os.getenv("SUPABASE_KEY")
        _supabase = create_client(url, key)
    return _supabase


def get_books_df() -> pd.DataFrame:
    """Load and cache books CSV."""
    global _books_df
    if _books_df is not None:
        return _books_df

    csv_path = os.getenv("CSV_PATH", "data/cleaned_books.csv")
    df = pd.read_csv(csv_path, dtype={"isbn13": str, "isbn10": str})

    # Normalize column names
    df.columns = [c.strip().lower() for c in df.columns]

    # Fill nulls for text fields used in embeddings
    for col in ["title", "authors", "categories", "description"]:
        if col in df.columns:
            df[col] = df[col].fillna("")

    # Ensure isbn13 is string with no decimals (e.g. "9780..." not "9780...0")
    df["isbn13"] = df["isbn13"].astype(str).str.strip().str.split(".").str[0]

    _books_df = df
    return _books_df


def get_all_ratings() -> pd.DataFrame:
    """
    Fetch all ratings from Supabase.
    Returns DataFrame with columns: user_id, isbn13, rating
    """
    client = get_supabase()
    rows = []
    page = 0
    page_size = 1000

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

    if not rows:
        return pd.DataFrame(columns=["user_id", "isbn13", "rating"])

    df = pd.DataFrame(rows)
    df.rename(columns={"book_isbn13": "isbn13"}, inplace=True)
    return df


def get_user_signals(user_id: str) -> dict:
    """
    Fetch all preference signals for a user:
    - preferred genres from user_preferences
    - favourite book isbns from favourites
    - reading list isbns to exclude (all statuses)
    - rated book isbns
    """
    client = get_supabase()

    genres_res = (
        client.table("user_preferences")
        .select("genre")
        .eq("user_id", user_id)
        .execute()
    )
    genres = [r["genre"] for r in (genres_res.data or [])]

    favs_res = (
        client.table("favourites")
        .select("book_isbn13")
        .eq("user_id", user_id)
        .execute()
    )
    favourite_isbns = [r["book_isbn13"] for r in (favs_res.data or [])]

    reading_res = (
        client.table("reading_list")
        .select("book_isbn13")
        .eq("user_id", user_id)
        .execute()
    )
    reading_list_isbns = [r["book_isbn13"] for r in (reading_res.data or [])]

    rated_res = (
        client.table("ratings")
        .select("book_isbn13, rating")
        .eq("user_id", user_id)
        .execute()
    )
    rated = {r["book_isbn13"]: r["rating"] for r in (rated_res.data or [])}

    return {
        "genres": genres,
        "favourite_isbns": favourite_isbns,
        "reading_list_isbns": reading_list_isbns,
        "rated": rated,
    }