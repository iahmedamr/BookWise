import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { getGenres, loadBooks } from "@/services/bookService";
import { Book } from "@/types/book";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import GenreTag from "@/components/GenreTag";
import RatingStars from "@/components/RatingStars";
import { Progress } from "@/components/ui/progress";
import {
  BookOpen,
  ChevronRight,
  ChevronLeft,
  Check,
  Search,
} from "lucide-react";

export default function OnboardingPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [allGenres, setAllGenres] = useState<string[]>([]);
  const [genreSearch, setGenreSearch] = useState("");
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [allBooks, setAllBooks] = useState<Book[]>([]);
  const [bookRatings, setBookRatings] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getGenres().then(setAllGenres);
    loadBooks().then(setAllBooks);
  }, []);

  const filteredGenres = useMemo(() => {
    if (!genreSearch.trim()) return allGenres;
    return allGenres.filter((g) =>
      g.toLowerCase().includes(genreSearch.toLowerCase()),
    );
  }, [allGenres, genreSearch]);

  // Books filtered by selected genres for step 2
  const genreBooks = useMemo(() => {
    if (selectedGenres.length === 0)
      return allBooks
        .sort((a, b) => b.ratings_count - a.ratings_count)
        .slice(0, 12);
    return allBooks
      .filter((b) =>
        selectedGenres.some((g) =>
          b.categories.toLowerCase().includes(g.toLowerCase()),
        ),
      )
      .sort((a, b) => b.ratings_count - a.ratings_count)
      .slice(0, 12);
  }, [allBooks, selectedGenres]);

  const toggleGenre = (genre: string) => {
    setSelectedGenres((prev) =>
      prev.includes(genre) ? prev.filter((g) => g !== genre) : [...prev, genre],
    );
  };

  const handleComplete = async () => {
    if (!user) return;
    setLoading(true);
    try {
      for (const genre of selectedGenres) {
        await supabase
          .from("user_preferences")
          .upsert({ user_id: user.id, genre });
      }
      for (const [isbn, rating] of Object.entries(bookRatings)) {
        await supabase
          .from("ratings")
          .upsert({ user_id: user.id, book_isbn13: isbn, rating });
      }
      await supabase
        .from("profiles")
        .update({ onboarding_completed: true })
        .eq("user_id", user.id);
      navigate("/");
    } catch (error) {
      console.error("Onboarding error:", error);
    } finally {
      setLoading(false);
    }
  };

  const progress = step === 1 ? 33 : step === 2 ? 66 : 100;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="p-4 border-b bg-card">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <BookOpen className="h-6 w-6 text-primary" />
          <span className="font-bold text-lg font-serif">BookWise</span>
          <div className="flex-1 ml-4">
            <Progress value={progress} className="h-2" />
          </div>
          <span className="text-sm text-muted-foreground">Step {step}/3</span>
        </div>
      </div>

      <div className="flex-1 max-w-2xl mx-auto w-full p-6">
        {step === 1 && (
          <div className="space-y-4">
            <div>
              <h1 className="text-2xl font-bold">What genres do you enjoy?</h1>
              <p className="text-muted-foreground mt-1">
                Select at least 3 genres to personalize your recommendations.
              </p>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search genres..."
                className="pl-10"
                value={genreSearch}
                onChange={(e) => setGenreSearch(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap gap-2 max-h-80 overflow-auto">
              {filteredGenres.map((genre) => (
                <GenreTag
                  key={genre}
                  genre={genre}
                  active={selectedGenres.includes(genre)}
                  size="md"
                  onClick={() => toggleGenre(genre)}
                />
              ))}
            </div>
            {selectedGenres.length > 0 && (
              <p className="text-sm text-muted-foreground">
                {selectedGenres.length} genre(s) selected
              </p>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold">Rate some books</h1>
              <p className="text-muted-foreground mt-1">
                Books based on your selected genres. Rate as many as you'd like.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {genreBooks.map((book) => (
                <Card key={book.isbn13} className="flex overflow-hidden">
                  <img
                    src={book.thumbnail || "/placeholder.svg"}
                    alt={book.title}
                    className="w-16 h-24 object-cover shrink-0"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = "/placeholder.svg";
                    }}
                  />
                  <CardContent className="p-3 flex flex-col justify-between flex-1 min-w-0">
                    <div>
                      <p className="text-sm font-medium line-clamp-1">
                        {book.title}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {book.authors}
                      </p>
                    </div>
                    <RatingStars
                      rating={bookRatings[book.isbn13] || 0}
                      interactive
                      size="md"
                      onRate={(r) =>
                        setBookRatings((prev) => ({
                          ...prev,
                          [book.isbn13]: r,
                        }))
                      }
                    />
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6 text-center py-12">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <Check className="h-8 w-8 text-primary" />
            </div>
            <h1 className="text-2xl font-bold">You're all set!</h1>
            <p className="text-muted-foreground max-w-md mx-auto">
              We've personalized your experience based on your preferences. You
              selected {selectedGenres.length} genres and rated{" "}
              {Object.keys(bookRatings).length} books.
            </p>
          </div>
        )}
      </div>

      <div className="p-4 border-t bg-card">
        <div className="max-w-2xl mx-auto flex justify-between">
          <Button
            variant="outline"
            onClick={() => setStep((s) => s - 1)}
            disabled={step === 1}
          >
            <ChevronLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          {step < 3 ? (
            <Button
              onClick={() => setStep((s) => s + 1)}
              disabled={step === 1 && selectedGenres.length < 3}
            >
              Next <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button onClick={handleComplete} disabled={loading}>
              {loading ? "Saving..." : "Start Exploring"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
