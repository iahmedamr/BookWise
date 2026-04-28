export const POPULAR_GENRES = [
  "Fiction",
  "Juvenile Fiction",
  "Biography & Autobiography",
  "History",
  "Literary Criticism",
  "Philosophy",
  "Religion",
  "Comics & Graphic Novels",
  "Drama",
  "Juvenile Nonfiction",
  "Poetry",
  "Literary Collections",
  "Science",
  "Business & Economics",
  "Social Science",
  "Performing Arts",
  "Art",
  "Cooking",
] as const;

const POPULAR_GENRE_SET = new Set<string>(POPULAR_GENRES);

export function filterPopularGenres(genres: string[]) {
  return genres.filter((genre) => POPULAR_GENRE_SET.has(genre));
}
