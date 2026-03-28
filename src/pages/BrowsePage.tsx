import { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import {
  getTrendingBooks,
  getPopularBooks,
  getGenres,
  loadBooks,
  searchBooks,
} from "@/services/bookService";
import { fetchRecommendations } from "@/services/recommendationService";
import { Book } from "@/types/book";
import BookCard from "@/components/BookCard";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, SlidersHorizontal, Search, X } from "lucide-react";
import { Link } from "react-router-dom";

const ITEMS_PER_PAGE = 24;
const CURRENT_YEAR = new Date().getFullYear();

export default function BrowsePage() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const section = searchParams.get("section") || "popular";
  const searchQuery = searchParams.get("q") || "";

  const [allBooks, setAllBooks] = useState<Book[]>([]);
  const [genres, setGenres] = useState<string[]>([]);
  const [authors, setAuthors] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  const [sortBy, setSortBy] = useState("popularity");
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [selectedAuthors, setSelectedAuthors] = useState<string[]>([]);
  const [ratingRange, setRatingRange] = useState<[number, number]>([0, 5]);
  const [yearRange, setYearRange] = useState<[number, number]>([
    1900,
    CURRENT_YEAR,
  ]);
  const [genreSearch, setGenreSearch] = useState("");
  const [authorSearch, setAuthorSearch] = useState("");

  const title = searchQuery
    ? `Results for "${searchQuery}"`
    : section === "recommended"
      ? "Recommended for You"
      : section === "trending"
        ? "Trending Now"
        : "Popular Books";

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      let books: Book[] = [];

      if (searchQuery) {
        books = await searchBooks(searchQuery, {
          sortBy: "popularity",
          sortOrder: "desc",
        });
      } else if (section === "recommended" && user) {
        books = await fetchRecommendations(user.id, 100);
        if (books.length === 0) books = await getPopularBooks(200);
      } else if (section === "trending") {
        books = await getTrendingBooks();
      } else {
        books = await getPopularBooks(200);
      }

      setAllBooks(books);

      const genreSet = new Set<string>();
      const authorSet = new Set<string>();
      books.forEach((b) => {
        if (b.categories)
          b.categories.split(";").forEach((g) => {
            const t = g.trim();
            if (t) genreSet.add(t);
          });
        if (b.authors) authorSet.add(b.authors);
      });
      setGenres(Array.from(genreSet).sort());
      setAuthors(Array.from(authorSet).sort().slice(0, 100));
      setLoading(false);
    };
    load();
  }, [section, user, searchQuery]);

  const filteredBooks = useMemo(() => {
    let result = [...allBooks];

    if (selectedGenres.length > 0) {
      result = result.filter((b) =>
        selectedGenres.some((g) =>
          b.categories.toLowerCase().includes(g.toLowerCase()),
        ),
      );
    }
    if (selectedAuthors.length > 0) {
      result = result.filter((b) =>
        selectedAuthors.some((a) =>
          b.authors.toLowerCase().includes(a.toLowerCase()),
        ),
      );
    }
    result = result.filter(
      (b) =>
        b.average_rating >= ratingRange[0] &&
        b.average_rating <= ratingRange[1],
    );
    result = result.filter(
      (b) =>
        b.published_year >= yearRange[0] && b.published_year <= yearRange[1],
    );

    if (
      sortBy !== "popularity" ||
      (section !== "recommended" && !searchQuery)
    ) {
      result.sort((a, b) => {
        switch (sortBy) {
          case "title_asc":
            return a.title.localeCompare(b.title);
          case "title_desc":
            return b.title.localeCompare(a.title);
          case "rating_high":
            return b.average_rating - a.average_rating;
          case "rating_low":
            return a.average_rating - b.average_rating;
          case "year_new":
            return b.published_year - a.published_year;
          case "year_old":
            return a.published_year - b.published_year;
          case "popularity":
          default:
            return b.ratings_count - a.ratings_count;
        }
      });
    }

    return result;
  }, [
    allBooks,
    selectedGenres,
    selectedAuthors,
    ratingRange,
    yearRange,
    sortBy,
    section,
    searchQuery,
  ]);

  const totalPages = Math.ceil(filteredBooks.length / ITEMS_PER_PAGE);
  const paginatedBooks = filteredBooks.slice(
    (page - 1) * ITEMS_PER_PAGE,
    page * ITEMS_PER_PAGE,
  );

  useEffect(() => {
    setPage(1);
  }, [selectedGenres, selectedAuthors, ratingRange, yearRange, sortBy]);

  const toggleGenre = (genre: string) =>
    setSelectedGenres((prev) =>
      prev.includes(genre) ? prev.filter((g) => g !== genre) : [...prev, genre],
    );

  const toggleAuthor = (author: string) =>
    setSelectedAuthors((prev) =>
      prev.includes(author)
        ? prev.filter((a) => a !== author)
        : [...prev, author],
    );

  const hasActiveFilters =
    selectedGenres.length > 0 ||
    selectedAuthors.length > 0 ||
    ratingRange[0] > 0 ||
    ratingRange[1] < 5 ||
    yearRange[0] > 1900 ||
    yearRange[1] < CURRENT_YEAR;

  const clearAllFilters = () => {
    setSelectedGenres([]);
    setSelectedAuthors([]);
    setRatingRange([0, 5]);
    setYearRange([1900, CURRENT_YEAR]);
  };

  const filteredGenresList = genres.filter((g) =>
    g.toLowerCase().includes(genreSearch.toLowerCase()),
  );
  const filteredAuthorsList = authors.filter((a) =>
    a.toLowerCase().includes(authorSearch.toLowerCase()),
  );

  const FilterSidebar = () => (
    <div className="space-y-6">
      {/* Rating Range */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-semibold">Rating</h4>
          <span className="text-xs font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full">
            {ratingRange[0]} – {ratingRange[1]} ★
          </span>
        </div>
        <Slider
          value={ratingRange}
          onValueChange={(v) => setRatingRange(v as [number, number])}
          min={0}
          max={5}
          step={0.5}
          className="mb-1"
        />
        <div className="flex justify-between text-xs text-muted-foreground mt-1">
          <span>0 ★</span>
          <span>5 ★</span>
        </div>
      </div>

      {/* Published Year Range */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-semibold">Published Year</h4>
          <span className="text-xs font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full">
            {yearRange[0]} – {yearRange[1]}
          </span>
        </div>
        <Slider
          value={yearRange}
          onValueChange={(v) => setYearRange(v as [number, number])}
          min={1900}
          max={CURRENT_YEAR}
          step={1}
          className="mb-1"
        />
        <div className="flex justify-between text-xs text-muted-foreground mt-1">
          <span>1900</span>
          <span>{CURRENT_YEAR}</span>
        </div>
      </div>

      {/* Genres */}
      <div>
        <h4 className="text-sm font-semibold mb-2">Genres</h4>
        <div className="relative mb-2">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
          <Input
            placeholder="Search genres..."
            className="h-8 text-xs pl-7"
            value={genreSearch}
            onChange={(e) => setGenreSearch(e.target.value)}
          />
        </div>
        <ScrollArea className="h-40">
          <div className="space-y-1">
            {filteredGenresList.map((g) => (
              <label
                key={g}
                className="flex items-center gap-2 text-xs cursor-pointer hover:bg-muted/50 px-1 py-0.5 rounded"
              >
                <Checkbox
                  checked={selectedGenres.includes(g)}
                  onCheckedChange={() => toggleGenre(g)}
                  className="h-3.5 w-3.5"
                />
                <span className="line-clamp-1">{g}</span>
              </label>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Authors */}
      <div>
        <h4 className="text-sm font-semibold mb-2">Authors</h4>
        <div className="relative mb-2">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
          <Input
            placeholder="Search authors..."
            className="h-8 text-xs pl-7"
            value={authorSearch}
            onChange={(e) => setAuthorSearch(e.target.value)}
          />
        </div>
        <ScrollArea className="h-40">
          <div className="space-y-1">
            {filteredAuthorsList.map((a) => (
              <label
                key={a}
                className="flex items-center gap-2 text-xs cursor-pointer hover:bg-muted/50 px-1 py-0.5 rounded"
              >
                <Checkbox
                  checked={selectedAuthors.includes(a)}
                  onCheckedChange={() => toggleAuthor(a)}
                  className="h-3.5 w-3.5"
                />
                <span className="line-clamp-1">{a}</span>
              </label>
            ))}
          </div>
        </ScrollArea>
      </div>

      {hasActiveFilters && (
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={clearAllFilters}
        >
          <X className="h-3 w-3 mr-1" /> Clear All Filters
        </Button>
      )}
    </div>
  );

  if (loading)
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Link to="/">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold">{title}</h1>
          {searchQuery && (
            <p className="text-sm text-muted-foreground mt-0.5">
              {filteredBooks.length} books found
            </p>
          )}
        </div>
      </div>

      {/* Active filter badges */}
      {hasActiveFilters && (
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs text-muted-foreground">Active filters:</span>
          {(ratingRange[0] > 0 || ratingRange[1] < 5) && (
            <Badge
              variant="secondary"
              className="text-xs gap-1 cursor-pointer"
              onClick={() => setRatingRange([0, 5])}
            >
              ★ {ratingRange[0]}–{ratingRange[1]} <X className="h-3 w-3" />
            </Badge>
          )}
          {(yearRange[0] > 1900 || yearRange[1] < CURRENT_YEAR) && (
            <Badge
              variant="secondary"
              className="text-xs gap-1 cursor-pointer"
              onClick={() => setYearRange([1900, CURRENT_YEAR])}
            >
              {yearRange[0]}–{yearRange[1]} <X className="h-3 w-3" />
            </Badge>
          )}
          {selectedGenres.map((g) => (
            <Badge
              key={g}
              variant="secondary"
              className="text-xs gap-1 cursor-pointer"
              onClick={() => toggleGenre(g)}
            >
              {g} <X className="h-3 w-3" />
            </Badge>
          ))}
          {selectedAuthors.map((a) => (
            <Badge
              key={a}
              variant="secondary"
              className="text-xs gap-1 cursor-pointer"
              onClick={() => toggleAuthor(a)}
            >
              {a.split(" ").slice(-1)[0]} <X className="h-3 w-3" />
            </Badge>
          ))}
        </div>
      )}

      <div className="flex gap-6">
        <aside className="hidden lg:block w-60 shrink-0">
          <div className="sticky top-20 border rounded-lg p-4">
            <h3 className="font-semibold mb-4">Filters</h3>
            <FilterSidebar />
          </div>
        </aside>

        <div className="flex-1 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {filteredBooks.length} books found
            </p>
            <div className="flex items-center gap-2">
              <Sheet>
                <SheetTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="lg:hidden relative"
                  >
                    <SlidersHorizontal className="h-4 w-4 mr-1" /> Filters
                    {hasActiveFilters && (
                      <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground rounded-full w-4 h-4 text-[10px] flex items-center justify-center">
                        {selectedGenres.length +
                          selectedAuthors.length +
                          (ratingRange[0] > 0 || ratingRange[1] < 5 ? 1 : 0) +
                          (yearRange[0] > 1900 || yearRange[1] < CURRENT_YEAR
                            ? 1
                            : 0)}
                      </span>
                    )}
                  </Button>
                </SheetTrigger>
                <SheetContent side="left">
                  <SheetHeader>
                    <SheetTitle>Filters</SheetTitle>
                  </SheetHeader>
                  <div className="mt-4">
                    <FilterSidebar />
                  </div>
                </SheetContent>
              </Sheet>

              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="popularity">Most Popular</SelectItem>
                  <SelectItem value="rating_high">Highest Rated</SelectItem>
                  <SelectItem value="rating_low">Lowest Rated</SelectItem>
                  <SelectItem value="title_asc">Title A–Z</SelectItem>
                  <SelectItem value="title_desc">Title Z–A</SelectItem>
                  <SelectItem value="year_new">Newest First</SelectItem>
                  <SelectItem value="year_old">Oldest First</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {filteredBooks.length === 0 ? (
            <div className="text-center py-20 text-muted-foreground">
              <p className="text-lg font-medium mb-2">No books found</p>
              <p className="text-sm">Try adjusting your filters.</p>
              {hasActiveFilters && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4"
                  onClick={clearAllFilters}
                >
                  Clear Filters
                </Button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-4">
              {paginatedBooks.map((book) => (
                <BookCard key={book.isbn13} book={book} />
              ))}
            </div>
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 py-4">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 1}
                onClick={() => {
                  setPage(page - 1);
                  window.scrollTo(0, 0);
                }}
              >
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page === totalPages}
                onClick={() => {
                  setPage(page + 1);
                  window.scrollTo(0, 0);
                }}
              >
                Next
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
