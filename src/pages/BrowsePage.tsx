import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { getPopularBooks, getTrendingBooks, searchBooks } from "@/services/bookService";
import { fetchRecommendations } from "@/services/recommendationService";
import { Book } from "@/types/book";
import BookCard from "@/components/BookCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Slider } from "@/components/ui/slider";
import {
  ArrowLeft,
  Search,
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide-react";

const ITEMS_PER_PAGE = 24;
const CURRENT_YEAR = new Date().getFullYear();

type RangeValue = [number, number];

interface RangeFilterProps {
  label: string;
  value: RangeValue;
  min: number;
  max: number;
  step: number;
  onChange: (value: RangeValue) => void;
  formatValue?: (value: number) => string;
}

interface FilterListProps {
  title: string;
  placeholder: string;
  searchValue: string;
  onSearchChange: (value: string) => void;
  items: string[];
  selectedItems: string[];
  onToggle: (value: string) => void;
}

interface BrowseFiltersPanelProps {
  ratingRange: RangeValue;
  yearRange: RangeValue;
  onRatingChange: (value: RangeValue) => void;
  onYearChange: (value: RangeValue) => void;
  genreSearch: string;
  onGenreSearchChange: (value: string) => void;
  authorSearch: string;
  onAuthorSearchChange: (value: string) => void;
  genres: string[];
  authors: string[];
  selectedGenres: string[];
  selectedAuthors: string[];
  onToggleGenre: (value: string) => void;
  onToggleAuthor: (value: string) => void;
  hasActiveFilters: boolean;
  onClearAll: () => void;
}

function clampRangeValue(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function formatNumberInput(
  value: number,
  fallback: number,
  min: number,
  max: number,
) {
  if (Number.isNaN(value)) {
    return fallback;
  }
  return clampRangeValue(value, min, max);
}

function RangeFilter({
  label,
  value,
  min,
  max,
  step,
  onChange,
  formatValue = (next) => `${next}`,
}: RangeFilterProps) {
  const updateMin = (nextMin: number) => {
    onChange([Math.min(nextMin, value[1]), value[1]]);
  };

  const updateMax = (nextMax: number) => {
    onChange([value[0], Math.max(nextMax, value[0])]);
  };

  return (
    <div className="space-y-3 rounded-2xl border border-border/70 bg-background/75 p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-sm font-semibold">{label}</h4>
        <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
          {formatValue(value[0])} - {formatValue(value[1])}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1.5">
          <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Minimum
          </span>
          <Input
            type="number"
            inputMode="decimal"
            value={value[0]}
            min={min}
            max={value[1]}
            step={step}
            onChange={(event) => {
              const next = formatNumberInput(
                Number(event.target.value),
                value[0],
                min,
                value[1],
              );
              updateMin(next);
            }}
            className="h-9 bg-background/80"
          />
        </label>
        <label className="space-y-1.5">
          <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Maximum
          </span>
          <Input
            type="number"
            inputMode="decimal"
            value={value[1]}
            min={value[0]}
            max={max}
            step={step}
            onChange={(event) => {
              const next = formatNumberInput(
                Number(event.target.value),
                value[1],
                value[0],
                max,
              );
              updateMax(next);
            }}
            className="h-9 bg-background/80"
          />
        </label>
      </div>

      <div className="space-y-3 rounded-xl bg-muted/55 px-3 py-3">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Minimum</span>
            <span>{formatValue(value[0])}</span>
          </div>
          <Slider
            value={[value[0]]}
            onValueChange={([next]) => updateMin(next)}
            min={min}
            max={value[1]}
            step={step}
          />
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Maximum</span>
            <span>{formatValue(value[1])}</span>
          </div>
          <Slider
            value={[value[1]]}
            onValueChange={([next]) => updateMax(next)}
            min={value[0]}
            max={max}
            step={step}
          />
        </div>
        <div className="flex justify-between text-[11px] text-muted-foreground">
          <span>{formatValue(min)}</span>
          <span>{formatValue(max)}</span>
        </div>
      </div>
    </div>
  );
}

function FilterList({
  title,
  placeholder,
  searchValue,
  onSearchChange,
  items,
  selectedItems,
  onToggle,
}: FilterListProps) {
  return (
    <div className="space-y-3 rounded-2xl border border-border/70 bg-background/75 p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-sm font-semibold">{title}</h4>
        <span className="text-xs text-muted-foreground">
          {selectedItems.length} selected
        </span>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder={placeholder}
          className="h-9 bg-background/80 pl-9"
          value={searchValue}
          onChange={(event) => onSearchChange(event.target.value)}
        />
      </div>

      <ScrollArea className="h-48 rounded-xl border border-border/60 bg-muted/35">
        <div className="space-y-1 p-2">
          {items.length === 0 ? (
            <p className="px-2 py-6 text-center text-xs text-muted-foreground">
              No matches found.
            </p>
          ) : (
            items.map((item) => {
              const selected = selectedItems.includes(item);

              return (
                <button
                  key={item}
                  type="button"
                  onClick={() => onToggle(item)}
                  className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs transition-colors ${
                    selected
                      ? "bg-primary/10 text-foreground"
                      : "hover:bg-background/90"
                  }`}
                >
                  <Checkbox checked={selected} className="pointer-events-none" />
                  <span className="line-clamp-1 flex-1">{item}</span>
                </button>
              );
            })
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function BrowseFiltersPanel({
  ratingRange,
  yearRange,
  onRatingChange,
  onYearChange,
  genreSearch,
  onGenreSearchChange,
  authorSearch,
  onAuthorSearchChange,
  genres,
  authors,
  selectedGenres,
  selectedAuthors,
  onToggleGenre,
  onToggleAuthor,
  hasActiveFilters,
  onClearAll,
}: BrowseFiltersPanelProps) {
  return (
    <div className="space-y-4">
      <RangeFilter
        label="Rating"
        value={ratingRange}
        min={0}
        max={5}
        step={0.5}
        onChange={onRatingChange}
        formatValue={(next) => `${next.toFixed(1)} stars`}
      />

      <RangeFilter
        label="Published Year"
        value={yearRange}
        min={1900}
        max={CURRENT_YEAR}
        step={1}
        onChange={onYearChange}
      />

      <FilterList
        title="Genres"
        placeholder="Search genres..."
        searchValue={genreSearch}
        onSearchChange={onGenreSearchChange}
        items={genres}
        selectedItems={selectedGenres}
        onToggle={onToggleGenre}
      />

      <FilterList
        title="Authors"
        placeholder="Search authors..."
        searchValue={authorSearch}
        onSearchChange={onAuthorSearchChange}
        items={authors}
        selectedItems={selectedAuthors}
        onToggle={onToggleAuthor}
      />

      {hasActiveFilters && (
        <Button
          variant="outline"
          size="sm"
          className="w-full rounded-xl"
          onClick={onClearAll}
        >
          <X className="mr-1.5 h-3.5 w-3.5" />
          Clear All Filters
        </Button>
      )}
    </div>
  );
}

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
  const [ratingRange, setRatingRange] = useState<RangeValue>([0, 5]);
  const [yearRange, setYearRange] = useState<RangeValue>([1900, CURRENT_YEAR]);
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
        if (books.length === 0) {
          books = await getPopularBooks(200);
        }
      } else if (section === "trending") {
        books = await getTrendingBooks();
      } else {
        books = await getPopularBooks(200);
      }

      setAllBooks(books);
      setPage(1);

      const genreSet = new Set<string>();
      const authorSet = new Set<string>();

      books.forEach((book) => {
        if (book.categories) {
          book.categories.split(";").forEach((genre) => {
            const trimmed = genre.trim();
            if (trimmed) {
              genreSet.add(trimmed);
            }
          });
        }

        if (book.authors) {
          authorSet.add(book.authors);
        }
      });

      setGenres(Array.from(genreSet).sort());
      setAuthors(Array.from(authorSet).sort().slice(0, 120));
      setLoading(false);
    };

    load();
  }, [searchQuery, section, user]);

  const filteredBooks = useMemo(() => {
    let result = [...allBooks];

    if (selectedGenres.length > 0) {
      result = result.filter((book) =>
        selectedGenres.some((genre) =>
          book.categories.toLowerCase().includes(genre.toLowerCase()),
        ),
      );
    }

    if (selectedAuthors.length > 0) {
      result = result.filter((book) =>
        selectedAuthors.some((author) =>
          book.authors.toLowerCase().includes(author.toLowerCase()),
        ),
      );
    }

    result = result.filter(
      (book) =>
        book.average_rating >= ratingRange[0] &&
        book.average_rating <= ratingRange[1],
    );

    result = result.filter(
      (book) =>
        book.published_year >= yearRange[0] &&
        book.published_year <= yearRange[1],
    );

    if (sortBy !== "popularity" || (section !== "recommended" && !searchQuery)) {
      result.sort((left, right) => {
        switch (sortBy) {
          case "title_asc":
            return left.title.localeCompare(right.title);
          case "title_desc":
            return right.title.localeCompare(left.title);
          case "rating_high":
            return right.average_rating - left.average_rating;
          case "rating_low":
            return left.average_rating - right.average_rating;
          case "year_new":
            return right.published_year - left.published_year;
          case "year_old":
            return left.published_year - right.published_year;
          case "popularity":
          default:
            return right.ratings_count - left.ratings_count;
        }
      });
    }

    return result;
  }, [
    allBooks,
    ratingRange,
    searchQuery,
    section,
    selectedAuthors,
    selectedGenres,
    sortBy,
    yearRange,
  ]);

  const totalPages = Math.ceil(filteredBooks.length / ITEMS_PER_PAGE);
  const paginatedBooks = filteredBooks.slice(
    (page - 1) * ITEMS_PER_PAGE,
    page * ITEMS_PER_PAGE,
  );

  useEffect(() => {
    setPage(1);
  }, [ratingRange, selectedAuthors, selectedGenres, sortBy, yearRange]);

  const toggleGenre = (genre: string) => {
    setSelectedGenres((current) =>
      current.includes(genre)
        ? current.filter((item) => item !== genre)
        : [...current, genre],
    );
  };

  const toggleAuthor = (author: string) => {
    setSelectedAuthors((current) =>
      current.includes(author)
        ? current.filter((item) => item !== author)
        : [...current, author],
    );
  };

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
    setGenreSearch("");
    setAuthorSearch("");
  };

  const filteredGenresList = useMemo(
    () =>
      genres.filter((genre) =>
        genre.toLowerCase().includes(genreSearch.toLowerCase()),
      ),
    [genreSearch, genres],
  );

  const filteredAuthorsList = useMemo(
    () =>
      authors.filter((author) =>
        author.toLowerCase().includes(authorSearch.toLowerCase()),
      ),
    [authorSearch, authors],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[28px] border border-border/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.94),rgba(255,247,232,0.92)_38%,rgba(233,241,255,0.92)_100%)] shadow-sm">
        <div className="flex flex-col gap-5 px-5 py-6 sm:px-7 md:flex-row md:items-end md:justify-between">
          <div className="space-y-3">
            <Link to="/" className="inline-flex">
              <Button variant="ghost" size="icon" className="rounded-full">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>

            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-background/70 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary shadow-sm">
                <Sparkles className="h-3.5 w-3.5" />
                Discover
              </div>
              <div>
                <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
                  {title}
                </h1>
                <p className="mt-2 max-w-2xl text-sm text-muted-foreground sm:text-base">
                  {filteredBooks.length} books ready to browse with faster
                  filters, cleaner selections, and a smoother search flow.
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:w-auto">
            <div className="rounded-2xl border border-white/80 bg-background/80 px-4 py-3 shadow-sm">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                Results
              </p>
              <p className="mt-1 text-2xl font-semibold">{filteredBooks.length}</p>
            </div>
            <div className="rounded-2xl border border-white/80 bg-background/80 px-4 py-3 shadow-sm">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                Active Filters
              </p>
              <p className="mt-1 text-2xl font-semibold">
                {selectedGenres.length +
                  selectedAuthors.length +
                  (ratingRange[0] > 0 || ratingRange[1] < 5 ? 1 : 0) +
                  (yearRange[0] > 1900 || yearRange[1] < CURRENT_YEAR ? 1 : 0)}
              </p>
            </div>
          </div>
        </div>
      </section>

      {hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Active
          </span>

          {(ratingRange[0] > 0 || ratingRange[1] < 5) && (
            <Badge
              variant="secondary"
              className="cursor-pointer gap-1 rounded-full px-3 py-1"
              onClick={() => setRatingRange([0, 5])}
            >
              Rating {ratingRange[0].toFixed(1)}-{ratingRange[1].toFixed(1)}
              <X className="h-3 w-3" />
            </Badge>
          )}

          {(yearRange[0] > 1900 || yearRange[1] < CURRENT_YEAR) && (
            <Badge
              variant="secondary"
              className="cursor-pointer gap-1 rounded-full px-3 py-1"
              onClick={() => setYearRange([1900, CURRENT_YEAR])}
            >
              Year {yearRange[0]}-{yearRange[1]}
              <X className="h-3 w-3" />
            </Badge>
          )}

          {selectedGenres.map((genre) => (
            <Badge
              key={genre}
              variant="secondary"
              className="cursor-pointer gap-1 rounded-full px-3 py-1"
              onClick={() => toggleGenre(genre)}
            >
              {genre}
              <X className="h-3 w-3" />
            </Badge>
          ))}

          {selectedAuthors.map((author) => (
            <Badge
              key={author}
              variant="secondary"
              className="cursor-pointer gap-1 rounded-full px-3 py-1"
              onClick={() => toggleAuthor(author)}
            >
              {author}
              <X className="h-3 w-3" />
            </Badge>
          ))}
        </div>
      )}

      <div className="flex gap-6">
        <aside className="hidden w-72 shrink-0 lg:block">
          <div className="sticky top-20 rounded-[24px] border border-border/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.94),rgba(247,249,255,0.96))] p-4 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="font-semibold">Filters</h3>
                <p className="text-xs text-muted-foreground">
                  Adjust the list without losing your place.
                </p>
              </div>
            </div>

            <BrowseFiltersPanel
              ratingRange={ratingRange}
              yearRange={yearRange}
              onRatingChange={setRatingRange}
              onYearChange={setYearRange}
              genreSearch={genreSearch}
              onGenreSearchChange={setGenreSearch}
              authorSearch={authorSearch}
              onAuthorSearchChange={setAuthorSearch}
              genres={filteredGenresList}
              authors={filteredAuthorsList}
              selectedGenres={selectedGenres}
              selectedAuthors={selectedAuthors}
              onToggleGenre={toggleGenre}
              onToggleAuthor={toggleAuthor}
              hasActiveFilters={hasActiveFilters}
              onClearAll={clearAllFilters}
            />
          </div>
        </aside>

        <div className="flex-1 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {filteredBooks.length} books found
            </p>

            <div className="flex items-center gap-2">
              <Sheet>
                <SheetTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="relative rounded-xl lg:hidden"
                  >
                    <SlidersHorizontal className="mr-1.5 h-4 w-4" />
                    Filters
                    {hasActiveFilters && (
                      <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">
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
                <SheetContent
                  side="left"
                  className="overflow-y-auto bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(247,249,255,0.98))]"
                >
                  <SheetHeader>
                    <SheetTitle>Browse Filters</SheetTitle>
                  </SheetHeader>

                  <div className="mt-4">
                    <BrowseFiltersPanel
                      ratingRange={ratingRange}
                      yearRange={yearRange}
                      onRatingChange={setRatingRange}
                      onYearChange={setYearRange}
                      genreSearch={genreSearch}
                      onGenreSearchChange={setGenreSearch}
                      authorSearch={authorSearch}
                      onAuthorSearchChange={setAuthorSearch}
                      genres={filteredGenresList}
                      authors={filteredAuthorsList}
                      selectedGenres={selectedGenres}
                      selectedAuthors={selectedAuthors}
                      onToggleGenre={toggleGenre}
                      onToggleAuthor={toggleAuthor}
                      hasActiveFilters={hasActiveFilters}
                      onClearAll={clearAllFilters}
                    />
                  </div>
                </SheetContent>
              </Sheet>

              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-44 rounded-xl bg-background/80">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="popularity">Most Popular</SelectItem>
                  <SelectItem value="rating_high">Highest Rated</SelectItem>
                  <SelectItem value="rating_low">Lowest Rated</SelectItem>
                  <SelectItem value="title_asc">Title A-Z</SelectItem>
                  <SelectItem value="title_desc">Title Z-A</SelectItem>
                  <SelectItem value="year_new">Newest First</SelectItem>
                  <SelectItem value="year_old">Oldest First</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {filteredBooks.length === 0 ? (
            <div className="rounded-[24px] border border-dashed border-border bg-muted/25 px-6 py-20 text-center">
              <p className="text-lg font-medium">No books found</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Try widening the filters or clearing a few selections.
              </p>
              {hasActiveFilters && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4 rounded-xl"
                  onClick={clearAllFilters}
                >
                  Clear Filters
                </Button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
              {paginatedBooks.map((book) => (
                <div
                  key={book.isbn13}
                  className="transition-transform duration-200 hover:-translate-y-1"
                >
                  <BookCard book={book} />
                </div>
              ))}
            </div>
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 py-4">
              <Button
                variant="outline"
                size="sm"
                className="rounded-xl"
                disabled={page === 1}
                onClick={() => {
                  setPage(page - 1);
                  window.scrollTo({ top: 0, behavior: "smooth" });
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
                className="rounded-xl"
                disabled={page === totalPages}
                onClick={() => {
                  setPage(page + 1);
                  window.scrollTo({ top: 0, behavior: "smooth" });
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
