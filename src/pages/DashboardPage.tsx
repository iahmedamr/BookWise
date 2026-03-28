import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { getTopRatedBooks, getMostRatedBooks } from "@/services/bookService";
import { fetchRecommendations } from "@/services/recommendationService";
import { Book } from "@/types/book";
import BookCard from "@/components/BookCard";
import { Button } from "@/components/ui/button";
import { useNavigate, Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";

export default function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [recommended, setRecommended] = useState<Book[]>([]);
  const [topRated, setTopRated] = useState<Book[]>([]);
  const [mostRated, setMostRated] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [recLoading, setRecLoading] = useState(false);

  // Track whether we've already fetched for the current user to avoid
  // re-fetching on tab visibility changes or unrelated re-renders.
  const fetchedForUser = useRef<string | null>(null);
  const staticDataLoaded = useRef(false);

  useEffect(() => {
    // Only re-run when the user identity actually changes (login/logout).
    const userId = user?.id ?? null;
    if (fetchedForUser.current === userId && staticDataLoaded.current) return;

    fetchedForUser.current = userId;

    const load = async () => {
      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("onboarding_completed")
          .eq("user_id", user.id)
          .single();

        if (profile && !profile.onboarding_completed) {
          navigate("/onboarding");
          return;
        }

        if (recommended.length === 0) {
          setRecLoading(true);
          fetchRecommendations(user.id, 100).then((rec) => {
            setRecommended(rec);
            setRecLoading(false);
          });
        }
      }

      if (!staticDataLoaded.current) {
        const [top, most] = await Promise.all([
          getTopRatedBooks(4, 20),
          getMostRatedBooks(20),
        ]);
        setTopRated(top);
        setMostRated(most);
        staticDataLoaded.current = true;
      }

      setLoading(false);
    };

    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">
          {user ? "Welcome back!" : "Discover Books"}
        </h1>
        <p className="text-muted-foreground mt-1">
          {user
            ? "Here are your personalized book recommendations."
            : "Explore trending and popular books. Sign in for personalized recommendations."}
        </p>
      </div>

      {user && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold">Recommended for You</h2>
            {recommended.length > 12 && (
              <Link to="/browse?section=recommended">
                <Button variant="ghost" size="sm" className="text-primary">
                  Show More <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </Link>
            )}
          </div>
          {recLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm py-4">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary" />
              Loading personalized recommendations...
            </div>
          ) : recommended.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {recommended.slice(0, 12).map((book) => (
                <BookCard key={book.isbn13} book={book} />
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm py-4">
              Rate or favourite some books to get personalized recommendations.
            </p>
          )}
        </section>
      )}

      <BookSection title="Top-Rated Books" books={topRated} type="top-rated" />
      <BookSection
        title="Most-Rated Books"
        books={mostRated}
        type="most-rated"
      />
    </div>
  );
}

function BookSection({
  title,
  books,
  type,
}: {
  title: string;
  books: Book[];
  type: string;
}) {
  const previewBooks = books.slice(0, 6);
  const hasMore = books.length > 6;

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold">{title}</h2>
        {hasMore && (
          <Link to={`/browse?section=${type}`}>
            <Button variant="ghost" size="sm" className="text-primary">
              Show More <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </Link>
        )}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
        {previewBooks.map((book) => (
          <BookCard key={book.isbn13} book={book} />
        ))}
      </div>
    </section>
  );
}
