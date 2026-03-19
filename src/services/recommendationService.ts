import { Book } from "@/types/book";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

// Normalize isbn13: strip decimal suffix and ensure string
// Backend sends it as string but JSON parse may coerce large ints
function normalizeIsbn(val: unknown): string {
  return String(val ?? "")
    .split(".")[0]
    .trim();
}

function rawToBook(raw: Record<string, unknown>): Book {
  return {
    isbn13: normalizeIsbn(raw.isbn13),
    isbn10: String(raw.isbn10 ?? ""),
    title: String(raw.title ?? ""),
    authors: String(raw.authors ?? ""),
    categories: String(raw.categories ?? ""),
    thumbnail: String(raw.thumbnail ?? ""),
    description: String(raw.description ?? ""),
    published_year: Number(raw.published_year ?? 0),
    average_rating: Number(raw.average_rating ?? 0),
    num_pages: Number(raw.num_pages ?? 0),
    ratings_count: Number(raw.ratings_count ?? 0),
  };
}

export async function fetchRecommendations(
  userId: string,
  topN = 100,
): Promise<Book[]> {
  try {
    const res = await fetch(`${API_URL}/recommend`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, top_n: topN }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return (data.books as Record<string, unknown>[]).map(rawToBook);
  } catch (err) {
    console.error("[recommendationService] fetchRecommendations failed:", err);
    return [];
  }
}

export async function fetchSimilarBooks(
  isbn13: string,
  topN = 12,
): Promise<Book[]> {
  try {
    const res = await fetch(`${API_URL}/similar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isbn13, top_n: topN }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return (data.books as Record<string, unknown>[]).map(rawToBook);
  } catch (err) {
    console.error("[recommendationService] fetchSimilarBooks failed:", err);
    return [];
  }
}
