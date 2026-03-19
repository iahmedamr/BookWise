import { Book, BookFilters } from "@/types/book";

let booksCache: Book[] | null = null;

export async function loadBooks(): Promise<Book[]> {
  if (booksCache) return booksCache;

  const response = await fetch("/data/cleaned_books.csv");
  const text = await response.text();
  const lines = text.split("\n");

  const books: Book[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let j = 0; j < line.length; j++) {
      const char = line[j];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === "," && !inQuotes) {
        values.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    values.push(current.trim());

    if (values.length >= 11) {
      // Normalize isbn13: strip decimals e.g. "9780123.0" → "9780123"
      const isbn13 = values[1].split(".")[0].trim();
      books.push({
        isbn13,
        isbn10: values[0],
        title: values[2],
        authors: values[3],
        categories: values[4],
        thumbnail: values[5],
        description: values[6],
        published_year: parseInt(values[7]) || 0,
        average_rating: parseFloat(values[8]) || 0,
        num_pages: parseInt(values[9]) || 0,
        ratings_count: parseInt(values[10]) || 0,
      });
    }
  }

  booksCache = books;
  return books;
}

export async function searchBooks(
  query: string,
  filters?: BookFilters,
): Promise<Book[]> {
  const books = await loadBooks();
  let results = books;

  if (query) {
    const q = query.toLowerCase();
    results = results.filter(
      (b) =>
        b.title.toLowerCase().includes(q) ||
        b.authors.toLowerCase().includes(q) ||
        b.categories.toLowerCase().includes(q),
    );
  }

  if (filters) {
    if (filters.genre) {
      results = results.filter((b) =>
        b.categories.toLowerCase().includes(filters.genre!.toLowerCase()),
      );
    }
    if (filters.minRating)
      results = results.filter((b) => b.average_rating >= filters.minRating!);
    if (filters.maxRating)
      results = results.filter((b) => b.average_rating <= filters.maxRating!);
    if (filters.minYear)
      results = results.filter((b) => b.published_year >= filters.minYear!);
    if (filters.maxYear)
      results = results.filter((b) => b.published_year <= filters.maxYear!);
    if (filters.minPages)
      results = results.filter((b) => b.num_pages >= filters.minPages!);
    if (filters.maxPages)
      results = results.filter((b) => b.num_pages <= filters.maxPages!);

    const sortBy = filters.sortBy || "popularity";
    const order = filters.sortOrder === "asc" ? 1 : -1;
    results.sort((a, b) => {
      switch (sortBy) {
        case "title":
          return a.title.localeCompare(b.title) * order;
        case "rating":
          return (a.average_rating - b.average_rating) * order;
        case "year":
          return (a.published_year - b.published_year) * order;
        case "pages":
          return (a.num_pages - b.num_pages) * order;
        case "popularity":
          return (a.ratings_count - b.ratings_count) * order;
        default:
          return 0;
      }
    });
  }

  return results;
}

export async function getBookByIsbn(isbn13: string): Promise<Book | undefined> {
  const books = await loadBooks();
  const normalized = isbn13.split(".")[0].trim();
  return books.find((b) => b.isbn13 === normalized);
}

export async function getGenres(): Promise<string[]> {
  const books = await loadBooks();
  const genres = new Set<string>();
  books.forEach((b) => {
    if (b.categories) {
      b.categories.split(";").forEach((g) => {
        const trimmed = g.trim();
        if (trimmed) genres.add(trimmed);
      });
    }
  });
  return Array.from(genres).sort();
}

export async function getTopRatedBooks(
  minRating = 4,
  limit = 20,
): Promise<Book[]> {
  const books = await loadBooks();
  return books
    .filter((b) => b.average_rating >= minRating)
    .sort((a, b) => b.average_rating - a.average_rating)
    .slice(0, limit);
}

export async function getMostRatedBooks(limit = 20): Promise<Book[]> {
  const books = await loadBooks();
  return books
    .sort((a, b) => b.ratings_count - a.ratings_count)
    .slice(0, limit);
}

// Keep old getRecommendations for BrowsePage fallback (genre-based, no ML)
export async function getRecommendations(
  genrePrefs: string[],
): Promise<Book[]> {
  const books = await loadBooks();
  let results = books;
  if (genrePrefs.length > 0) {
    results = books.filter((b) =>
      genrePrefs.some((g) =>
        b.categories.toLowerCase().includes(g.toLowerCase()),
      ),
    );
  }
  return results
    .sort((a, b) => b.average_rating - a.average_rating)
    .slice(0, 50);
}

export async function getSimilarBooks(isbn13: string): Promise<Book[]> {
  const book = await getBookByIsbn(isbn13);
  if (!book) return [];
  const books = await loadBooks();
  return books
    .filter((b) => b.isbn13 !== isbn13 && b.categories === book.categories)
    .sort((a, b) => b.average_rating - a.average_rating)
    .slice(0, 10);
}

export const getTrendingBooks = () => getMostRatedBooks(20);
export const getPopularBooks = (limit = 12) => getMostRatedBooks(limit);
