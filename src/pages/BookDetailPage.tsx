import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { getBookByIsbn } from "@/services/bookService";
import { fetchSimilarBooks } from "@/services/recommendationService";
import { Book, ReadingStatus } from "@/types/book";
import RatingStars from "@/components/RatingStars";
import GenreTag from "@/components/GenreTag";
import BookGrid from "@/components/BookGrid";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import {
  BookOpen,
  Calendar,
  Hash,
  Users,
  ArrowLeft,
  X,
  Send,
  Heart,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";

interface FriendProfile {
  user_id: string;
  display_name: string | null;
  first_name?: string | null;
  last_name?: string | null;
  avatar_url: string | null;
  accept_suggestions?: boolean;
  accept_notifications?: boolean;
}

export default function BookDetailPage() {
  const { isbn } = useParams<{ isbn: string }>();
  const { user } = useAuth();
  const { toast } = useToast();
  const [book, setBook] = useState<Book | null>(null);
  const [similar, setSimilar] = useState<Book[]>([]);
  const [userRating, setUserRating] = useState(0);
  const [review, setReview] = useState("");
  const [readingStatus, setReadingStatus] = useState<ReadingStatus | "">("");
  const [isFavourite, setIsFavourite] = useState(false);
  const [loading, setLoading] = useState(true);

  const [suggestOpen, setSuggestOpen] = useState(false);
  const [friends, setFriends] = useState<FriendProfile[]>([]);
  const [selectedFriends, setSelectedFriends] = useState<string[]>([]);

  useEffect(() => {
    if (!isbn) return;
    const load = async () => {
      setLoading(true);
      const [b, sim] = await Promise.all([
        getBookByIsbn(isbn),
        fetchSimilarBooks(isbn),
      ]);
      setBook(b || null);
      setSimilar(sim);

      if (user) {
        const [ratingRes, readingRes, favRes] = await Promise.all([
          supabase
            .from("ratings")
            .select("rating, review")
            .eq("user_id", user.id)
            .eq("book_isbn13", isbn)
            .maybeSingle(),
          supabase
            .from("reading_list")
            .select("status")
            .eq("user_id", user.id)
            .eq("book_isbn13", isbn)
            .maybeSingle(),
          supabase
            .from("favourites")
            .select("id")
            .eq("user_id", user.id)
            .eq("book_isbn13", isbn)
            .maybeSingle(),
        ]);
        if (ratingRes.data) {
          setUserRating(ratingRes.data.rating);
          setReview(ratingRes.data.review || "");
        }
        if (readingRes.data)
          setReadingStatus(readingRes.data.status as ReadingStatus);
        setIsFavourite(!!favRes.data);
      }
      setLoading(false);
    };
    load();
  }, [isbn, user]);

  const loadFriends = async () => {
    if (!user) return;
    const { data: friendships } = await supabase
      .from("friendships")
      .select("requester_id, addressee_id")
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
      .eq("status", "accepted");

    if (!friendships || friendships.length === 0) return;
    const friendIds = friendships.map((f) =>
      f.requester_id === user.id ? f.addressee_id : f.requester_id,
    );
    const { data: profiles } = await supabase
      .from("profiles")
      .select(
        "user_id, display_name, first_name, last_name, avatar_url, accept_suggestions, accept_notifications",
      )
      .in("user_id", friendIds);
    setFriends(profiles || []);
  };

  const handleSuggest = async () => {
    if (!user || !isbn || !book || selectedFriends.length === 0) return;
    const { data: senderProfile } = await supabase
      .from("profiles")
      .select("display_name, first_name, last_name")
      .eq("user_id", user.id)
      .single();
    const senderName =
      senderProfile?.display_name ||
      `${senderProfile?.first_name || ""} ${senderProfile?.last_name || ""}`.trim() ||
      "Someone";

    for (const friendId of selectedFriends) {
      const friendProfile = friends.find((f) => f.user_id === friendId);
      if (!friendProfile?.accept_suggestions) continue;

      await supabase.from("book_suggestions").insert({
        sender_id: user.id,
        receiver_id: friendId,
        book_isbn13: isbn,
        message: `Check out "${book.title}"!`,
      });

      if (friendProfile.accept_notifications) {
        await supabase.from("notifications").insert({
          user_id: friendId,
          type: "book_suggestion",
          title: "Book Suggestion",
          message: `${senderName} suggested "${book.title}" to you!`,
          related_book_isbn13: isbn,
          related_user_id: user.id,
        });
      }
    }
    toast({ title: `Suggested to ${selectedFriends.length} friend(s)!` });
    setSuggestOpen(false);
    setSelectedFriends([]);
  };

  const handleRate = async (rating: number) => {
    if (!user || !isbn) return;
    setUserRating(rating);
    await supabase
      .from("ratings")
      .upsert({ user_id: user.id, book_isbn13: isbn, rating, review });
    toast({ title: "Rating saved!" });
  };

  const handleReview = async () => {
    if (!user || !isbn) return;
    await supabase.from("ratings").upsert({
      user_id: user.id,
      book_isbn13: isbn,
      rating: userRating || 3,
      review,
    });
    toast({ title: "Review saved!" });
  };

  const handleReadingStatus = async (status: string) => {
    if (!user || !isbn || !book) return;
    const s = status as ReadingStatus;
    setReadingStatus(s);
    await supabase.from("reading_list").upsert({
      user_id: user.id,
      book_isbn13: isbn,
      status: s,
      total_pages: book.num_pages,
      started_at:
        s === "currently_reading" ? new Date().toISOString() : undefined,
      finished_at: s === "finished" ? new Date().toISOString() : undefined,
    });
    toast({
      title: `Added to "${s === "wishlist" ? "Wishlist" : s.replace(/_/g, " ")}"`,
    });
  };

  const handleRemoveStatus = async () => {
    if (!user || !isbn) return;
    await supabase
      .from("reading_list")
      .delete()
      .eq("user_id", user.id)
      .eq("book_isbn13", isbn);
    setReadingStatus("");
    toast({ title: "Removed from reading list" });
  };

  const toggleFavourite = async () => {
    if (!user || !isbn) return;
    if (isFavourite) {
      await supabase
        .from("favourites")
        .delete()
        .eq("user_id", user.id)
        .eq("book_isbn13", isbn);
      setIsFavourite(false);
      toast({ title: "Removed from favourites" });
    } else {
      await supabase
        .from("favourites")
        .insert({ user_id: user.id, book_isbn13: isbn });
      setIsFavourite(true);
      toast({ title: "Added to favourites!" });
    }
  };

  const navigate = useNavigate();
  if (loading)
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  if (!book)
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground">Book not found.</p>
        <Link to="/search">
          <Button variant="outline" className="mt-4">
            Go to Search
          </Button>
        </Link>
      </div>
    );

  const genres = book.categories
    ? book.categories
        .split(";")
        .map((g) => g.trim())
        .filter(Boolean)
    : [];

  return (
    <div className="space-y-8">
      <button
        onClick={() => navigate(-1)}
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4 mr-1" /> Back
      </button>

      <div className="flex flex-col md:flex-row gap-8">
        <div className="shrink-0">
          <img
            src={book.thumbnail || "/placeholder.svg"}
            alt={book.title}
            className="w-48 h-72 object-cover rounded-lg shadow-lg"
            onError={(e) => {
              (e.target as HTMLImageElement).src = "/placeholder.svg";
            }}
          />
        </div>
        <div className="flex-1 space-y-4">
          <div>
            <h1 className="text-3xl font-bold">{book.title}</h1>
            <p className="text-lg mt-2">{book.authors}</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <RatingStars rating={book.average_rating} size="md" />
              <span className="font-semibold">
                {book.average_rating.toFixed(1)}
              </span>
              <span className="text-sm text-muted-foreground">
                ({book.ratings_count.toLocaleString()} ratings)
              </span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {genres.map((g) => (
              <Link key={g} to={`/genres?genre=${encodeURIComponent(g)}`}>
                <GenreTag genre={g} size="md" />
              </Link>
            ))}
          </div>
          <div className="flex items-center gap-6 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <Calendar className="h-4 w-4" /> {book.published_year}
            </span>
            <span className="flex items-center gap-1">
              <Hash className="h-4 w-4" /> {book.num_pages} pages
            </span>
            <span className="flex items-center gap-1">
              <Users className="h-4 w-4" />{" "}
              {book.ratings_count.toLocaleString()} ratings
            </span>
          </div>
          {user && (
            <div className="flex items-center gap-3 flex-wrap">
              <Select value={readingStatus} onValueChange={handleReadingStatus}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Add to reading list" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="wishlist">Wishlist</SelectItem>
                  <SelectItem value="currently_reading">
                    Currently Reading
                  </SelectItem>
                  <SelectItem value="finished">Finished</SelectItem>
                </SelectContent>
              </Select>
              {readingStatus && (
                <>
                  <Badge variant="secondary">
                    {readingStatus === "wishlist"
                      ? "Wishlist"
                      : readingStatus.replace(/_/g, " ")}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={handleRemoveStatus}
                    title="Remove from list"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </>
              )}
              {(readingStatus === "currently_reading" ||
                readingStatus === "finished") && (
                <Button
                  variant="ghost"
                  size="icon"
                  className={`h-9 w-9 ${isFavourite ? "text-destructive" : "text-muted-foreground hover:text-destructive"}`}
                  onClick={toggleFavourite}
                  title={
                    isFavourite ? "Remove from favourites" : "Add to favourites"
                  }
                >
                  <Heart
                    className={`h-5 w-5 ${isFavourite ? "fill-current" : ""}`}
                  />
                </Button>
              )}
            </div>
          )}
          {/* Suggest to friends */}
          {user && (
            <Dialog
              open={suggestOpen}
              onOpenChange={(open) => {
                if (open) loadFriends();
                setSuggestOpen(open);
              }}
            >
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <Send className="h-3.5 w-3.5 mr-1" /> Suggest to Friends
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Suggest "{book.title}" to Friends</DialogTitle>
                </DialogHeader>
                {friends.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    No friends yet.
                  </p>
                ) : (
                  <div className="space-y-2 max-h-60 overflow-auto">
                    {friends
                      .filter((f) => f.accept_suggestions !== false)
                      .map((f) => (
                        <label
                          key={f.user_id}
                          className="flex items-center gap-3 p-2 border rounded cursor-pointer hover:bg-muted/50"
                        >
                          <Checkbox
                            checked={selectedFriends.includes(f.user_id)}
                            onCheckedChange={(checked) => {
                              setSelectedFriends((prev) =>
                                checked
                                  ? [...prev, f.user_id]
                                  : prev.filter((id) => id !== f.user_id),
                              );
                            }}
                          />
                          <span className="text-sm">
                            {f.display_name ||
                              `${f.first_name || ""} ${f.last_name || ""}`.trim() ||
                              "Unknown"}
                          </span>
                        </label>
                      ))}
                  </div>
                )}
                <Button
                  onClick={handleSuggest}
                  disabled={selectedFriends.length === 0}
                  className="w-full"
                >
                  Send Suggestion ({selectedFriends.length})
                </Button>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {book.description && (
        <Card>
          <CardContent className="pt-6">
            <h3 className="font-semibold mb-2 flex items-center gap-2">
              <BookOpen className="h-4 w-4" /> Description
            </h3>
            <p className="text-muted-foreground leading-relaxed">
              {book.description}
            </p>
          </CardContent>
        </Card>
      )}

      {user && (
        <Card>
          <CardContent className="pt-6 space-y-4">
            <h3 className="font-semibold">Your Rating & Review</h3>
            <RatingStars
              rating={userRating}
              size="lg"
              interactive
              onRate={handleRate}
            />
            <Textarea
              placeholder="Write a review (optional)..."
              value={review}
              onChange={(e) => setReview(e.target.value)}
              rows={3}
            />
            <Button onClick={handleReview} size="sm">
              Save Review
            </Button>
          </CardContent>
        </Card>
      )}

      {similar.length > 0 && <BookGrid books={similar} title="Similar Books" />}
    </div>
  );
}
