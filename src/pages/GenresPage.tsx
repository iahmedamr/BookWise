import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getGenres, searchBooks } from '@/services/bookService';
import { Book } from '@/types/book';
import BookGrid from '@/components/BookGrid';
import GenreTag from '@/components/GenreTag';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';

export default function GenresPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedGenres, setSelectedGenres] = useState<string[]>(() => {
    const g = searchParams.get('genre');
    return g ? g.split(',').filter(Boolean) : [];
  });
  const [genres, setGenres] = useState<string[]>([]);
  const [genreSearch, setGenreSearch] = useState('');
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getGenres().then(setGenres);
  }, []);

  const toggleGenre = useCallback((genre: string) => {
    setSelectedGenres((prev) => {
      const next = prev.includes(genre) ? prev.filter((g) => g !== genre) : [...prev, genre];
      setSearchParams(next.length > 0 ? { genre: next.join(',') } : {});
      return next;
    });
  }, [setSearchParams]);

  useEffect(() => {
    if (selectedGenres.length > 0) {
      setLoading(true);
      // Search books matching ANY of the selected genres
      searchBooks('', { sortBy: 'rating', sortOrder: 'desc' })
        .then((allBooks) => {
          const filtered = allBooks.filter((b) =>
            selectedGenres.some((g) => b.categories.toLowerCase().includes(g.toLowerCase()))
          );
          setBooks(filtered.slice(0, 30));
          setLoading(false);
        });
    } else {
      setBooks([]);
    }
  }, [selectedGenres]);

  const filteredGenres = useMemo(() => {
    if (!genreSearch.trim()) return genres;
    return genres.filter((g) => g.toLowerCase().includes(genreSearch.toLowerCase()));
  }, [genres, genreSearch]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Browse by Genre</h1>
        <p className="text-muted-foreground mt-1">
          Explore books by category • {selectedGenres.length > 0 ? `${selectedGenres.length} selected • ` : ''}{genres.length} genres available
        </p>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search genres..."
          className="pl-10"
          value={genreSearch}
          onChange={(e) => setGenreSearch(e.target.value)}
        />
      </div>

      <ScrollArea className="h-48 border rounded-md p-3">
        <div className="flex flex-wrap gap-2">
          {filteredGenres.map((genre) => (
            <GenreTag
              key={genre}
              genre={genre}
              size="md"
              active={selectedGenres.includes(genre)}
              onClick={() => toggleGenre(genre)}
            />
          ))}
        </div>
      </ScrollArea>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : selectedGenres.length > 0 ? (
        books.length > 0 ? (
          <BookGrid books={books} title={`Top books in ${selectedGenres.join(', ')}`} />
        ) : (
          <p className="text-center text-muted-foreground py-8">No books found in selected genres.</p>
        )
      ) : (
        <p className="text-center text-muted-foreground py-8">Select one or more genres to see books.</p>
      )}
    </div>
  );
}
