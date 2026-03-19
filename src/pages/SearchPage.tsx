import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { searchBooks, getGenres, loadBooks } from "@/services/bookService";
import { Book, BookFilters } from "@/types/book";
import BookGrid from "@/components/BookGrid";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, X, Clock, SlidersHorizontal } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Link } from "react-router-dom";

export default function SearchPage() {
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Book[]>([]);
  const [genres, setGenres] = useState<string[]>([]);
  const [history, setHistory] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState<BookFilters>({});
  const [searched, setSearched] = useState(false);

  // Autocomplete
  const [suggestions, setSuggestions] = useState<Book[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    getGenres().then((g) => setGenres(g.slice(0, 50)));
    if (user) {
      supabase
        .from("search_history")
        .select("query")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(3)
        .then(({ data }) => {
          if (data)
            setHistory([...new Set(data.map((d) => d.query))].slice(0, 3));
        });
    }
  }, [user]);

  // Close suggestions on click outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(e.target as Node) &&
        inputRef.current !== e.target
      ) {
        setShowSuggestions(false);
        setShowHistory(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const handleQueryChange = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (value.trim().length >= 2) {
      debounceRef.current = setTimeout(async () => {
        const books = await loadBooks();
        const q = value.toLowerCase();
        const matches = books
          .filter(
            (b) =>
              b.title.toLowerCase().includes(q) ||
              b.authors.toLowerCase().includes(q),
          )
          .slice(0, 6);
        setSuggestions(matches);
        setShowSuggestions(true);
        setShowHistory(false);
      }, 300);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  };

  const handleSearch = useCallback(
    async (q: string) => {
      if (!q.trim()) return;
      setLoading(true);
      setSearched(true);
      setShowSuggestions(false);
      setShowHistory(false);
      const res = await searchBooks(q, filters);
      setResults(res.slice(0, 60));
      setLoading(false);

      if (user) {
        supabase
          .from("search_history")
          .insert({ user_id: user.id, query: q.trim() });
        setHistory((prev) =>
          [q.trim(), ...prev.filter((h) => h !== q.trim())].slice(0, 3),
        );
      }
    },
    [filters, user],
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSearch(query);
  };

  const handleFocus = () => {
    if (query.trim().length < 2 && history.length > 0) {
      setShowHistory(true);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Search Books</h1>
        <p className="text-muted-foreground mt-1">
          Find your next read from over 6,200 books
        </p>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground z-10" />
          <Input
            ref={inputRef}
            placeholder="Search by title, author, or genre..."
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={handleFocus}
            className="pl-10"
          />
          {query && (
            <X
              className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground cursor-pointer z-10"
              onClick={() => {
                setQuery("");
                setResults([]);
                setSearched(false);
                setSuggestions([]);
              }}
            />
          )}

          {/* Suggestions dropdown */}
          {showSuggestions && suggestions.length > 0 && (
            <div
              ref={suggestionsRef}
              className="absolute top-full left-0 right-0 mt-1 bg-popover border rounded-md shadow-lg z-30 max-h-64 overflow-auto"
            >
              {suggestions.map((book) => (
                <Link
                  key={book.isbn13}
                  to={`/book/${book.isbn13}`}
                  className="flex items-center gap-3 p-2 hover:bg-muted/50 transition-colors"
                  onClick={() => {
                    setShowSuggestions(false);
                  }}
                >
                  <img
                    src={book.thumbnail || "/placeholder.svg"}
                    alt={book.title}
                    className="w-8 h-10 object-cover rounded"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = "/placeholder.svg";
                    }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium line-clamp-1">
                      {book.title}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {book.authors}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}

          {/* History dropdown */}
          {showHistory && history.length > 0 && !showSuggestions && (
            <div
              ref={suggestionsRef}
              className="absolute top-full left-0 right-0 mt-1 bg-popover border rounded-md shadow-lg z-30"
            >
              <p className="text-xs text-muted-foreground px-3 pt-2 pb-1 flex items-center gap-1">
                <Clock className="h-3 w-3" /> Recent Searches
              </p>
              {history.map((h) => (
                <div
                  key={h}
                  className="px-3 py-2 text-sm hover:bg-muted/50 cursor-pointer transition-colors"
                  onClick={() => {
                    setQuery(h);
                    handleSearch(h);
                    setShowHistory(false);
                  }}
                >
                  {h}
                </div>
              ))}
            </div>
          )}
        </div>
        <Button onClick={() => handleSearch(query)}>Search</Button>
        <Button
          variant="outline"
          size="icon"
          onClick={() => setShowFilters(!showFilters)}
        >
          <SlidersHorizontal className="h-4 w-4" />
        </Button>
      </div>

      {showFilters && (
        <Card>
          <CardContent className="pt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                Genre
              </label>
              <Select
                value={filters.genre || ""}
                onValueChange={(v) =>
                  setFilters({ ...filters, genre: v || undefined })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="All genres" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All genres</SelectItem>
                  {genres.map((g) => (
                    <SelectItem key={g} value={g}>
                      {g}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                Sort by
              </label>
              <Select
                value={filters.sortBy || "popularity"}
                onValueChange={(v: any) =>
                  setFilters({ ...filters, sortBy: v })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="popularity">Popularity</SelectItem>
                  <SelectItem value="rating">Rating</SelectItem>
                  <SelectItem value="title">Title</SelectItem>
                  <SelectItem value="year">Year</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                Min Rating
              </label>
              <Select
                value={String(filters.minRating || "")}
                onValueChange={(v) =>
                  setFilters({
                    ...filters,
                    minRating: v ? Number(v) : undefined,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Any" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any</SelectItem>
                  {[3, 3.5, 4, 4.5].map((r) => (
                    <SelectItem key={r} value={String(r)}>
                      ≥ {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                Order
              </label>
              <Select
                value={filters.sortOrder || "desc"}
                onValueChange={(v: any) =>
                  setFilters({ ...filters, sortOrder: v })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="desc">Descending</SelectItem>
                  <SelectItem value="asc">Ascending</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : searched ? (
        results.length > 0 ? (
          <div>
            <p className="text-sm text-muted-foreground mb-4">
              {results.length} results found
            </p>
            <BookGrid books={results} />
          </div>
        ) : (
          <p className="text-center text-muted-foreground py-12">
            No books found. Try different keywords.
          </p>
        )
      ) : null}
    </div>
  );
}
