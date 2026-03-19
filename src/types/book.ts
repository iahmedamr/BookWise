export interface Book {
  isbn13: string;
  isbn10: string;
  title: string;
  authors: string;
  categories: string;
  thumbnail: string;
  description: string;
  published_year: number;
  average_rating: number;
  num_pages: number;
  ratings_count: number;
}

export interface BookFilters {
  genre?: string;
  minRating?: number;
  maxRating?: number;
  minYear?: number;
  maxYear?: number;
  minPages?: number;
  maxPages?: number;
  sortBy?: "title" | "rating" | "year" | "pages" | "popularity";
  sortOrder?: "asc" | "desc";
}

export type ReadingStatus = "wishlist" | "currently_reading" | "finished";
