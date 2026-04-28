import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { getBookByIsbn } from "@/services/bookService";
import { fetchSimilarBooks } from "@/services/recommendationService";
import { Book, ReadingStatus } from "@/types/book";
import BookGrid from "@/components/BookGrid";
import GenreTag from "@/components/GenreTag";
import RatingStars from "@/components/RatingStars";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  BookOpen,
  Calendar,
  Hash,
  Heart,
  MessageSquare,
  Send,
  Sparkles,
  Trash2,
  Users,
  X,
} from "lucide-react";

interface FriendProfile {
  user_id: string;
  display_name: string | null;
  first_name?: string | null;
  last_name?: string | null;
  avatar_url: string | null;
  accept_suggestions?: boolean;
  accept_notifications?: boolean;
}

interface ReviewEntry {
  id: string;
  user_id: string;
  rating: number;
  review: string | null;
  created_at: string;
  updated_at: string;
  reviewerName: string;
  avatarUrl: string | null;
}

function formatReviewerName(profile?: {
  display_name: string | null;
  first_name?: string | null;
  last_name?: string | null;
}) {
  if (!profile) {
    return "Reader";
  }

  return (
    profile.display_name ||
    `${profile.first_name || ""} ${profile.last_name || ""}`.trim() ||
    "Reader"
  );
}

function ReviewCard({
  review,
  isCurrentUser,
}: {
  review: ReviewEntry;
  isCurrentUser: boolean;
}) {
  const initials = review.reviewerName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "R";

  return (
    <div className="rounded-2xl border border-border/70 bg-background/85 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <Avatar className="h-11 w-11 border border-border/70">
            <AvatarImage src={review.avatarUrl || undefined} />
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>

          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium">{review.reviewerName}</p>
              {isCurrentUser && (
                <Badge variant="secondary" className="rounded-full">
                  You
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {new Date(review.updated_at).toLocaleDateString()}
            </p>
          </div>
        </div>

        <div className="shrink-0">
          <RatingStars rating={review.rating} size="sm" />
        </div>
      </div>

      <div className="mt-3 text-sm leading-6 text-muted-foreground">
        {review.review?.trim() ? (
          <p>{review.review}</p>
        ) : (
          <p className="italic">Rated this book without a written review.</p>
        )}
      </div>
    </div>
  );
}

export default function BookDetailPage() {
  const { isbn } = useParams<{ isbn: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();

  const [book, setBook] = useState<Book | null>(null);
  const [similar, setSimilar] = useState<Book[]>([]);
  const [reviews, setReviews] = useState<ReviewEntry[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(true);
  const [userRating, setUserRating] = useState(0);
  const [review, setReview] = useState("");
  const [readingStatus, setReadingStatus] = useState<ReadingStatus | "">("");
  const [isFavourite, setIsFavourite] = useState(false);
  const [loading, setLoading] = useState(true);
  const [savingReview, setSavingReview] = useState(false);
  const [deletingReview, setDeletingReview] = useState(false);

  const [suggestOpen, setSuggestOpen] = useState(false);
  const [friends, setFriends] = useState<FriendProfile[]>([]);
  const [selectedFriends, setSelectedFriends] = useState<string[]>([]);

  const communityReviews = useMemo(
    () => reviews.filter((entry) => entry.user_id !== user?.id),
    [reviews, user?.id],
  );

  const loadReviews = async (targetIsbn: string) => {
    setReviewsLoading(true);

    const { data: ratingRows, error: ratingsError } = await supabase
      .from("ratings")
      .select("id, user_id, rating, review, created_at, updated_at")
      .eq("book_isbn13", targetIsbn)
      .order("updated_at", { ascending: false });

    if (ratingsError) {
      console.error("Failed to load reviews:", ratingsError);
      setReviews([]);
      setReviewsLoading(false);
      return;
    }

    const userIds = Array.from(
      new Set((ratingRows || []).map((entry) => entry.user_id)),
    );

    let profileMap = new Map<string, FriendProfile>();

    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, display_name, first_name, last_name, avatar_url")
        .in("user_id", userIds);

      profileMap = new Map(
        (profiles || []).map((profile) => [profile.user_id, profile]),
      );
    }

    setReviews(
      (ratingRows || []).map((entry) => {
        const profile = profileMap.get(entry.user_id);

        return {
          ...entry,
          reviewerName: formatReviewerName(profile),
          avatarUrl: profile?.avatar_url || null,
        };
      }),
    );
    setReviewsLoading(false);
  };

  useEffect(() => {
    if (!isbn) {
      return;
    }

    const load = async () => {
      setLoading(true);

      const [loadedBook, similarBooks] = await Promise.all([
        getBookByIsbn(isbn),
        fetchSimilarBooks(isbn),
      ]);

      setBook(loadedBook || null);
      setSimilar(similarBooks);
      await loadReviews(isbn);

      if (user) {
        const [ratingRes, readingRes, favouriteRes] = await Promise.all([
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
        } else {
          setUserRating(0);
          setReview("");
        }

        if (readingRes.data) {
          setReadingStatus(readingRes.data.status as ReadingStatus);
        } else {
          setReadingStatus("");
        }

        setIsFavourite(Boolean(favouriteRes.data));
      }

      setLoading(false);
    };

    load();
  }, [isbn, user]);

  const loadFriends = async () => {
    if (!user) {
      return;
    }

    const { data: friendships } = await supabase
      .from("friendships")
      .select("requester_id, addressee_id")
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
      .eq("status", "accepted");

    if (!friendships || friendships.length === 0) {
      setFriends([]);
      return;
    }

    const friendIds = friendships.map((friendship) =>
      friendship.requester_id === user.id
        ? friendship.addressee_id
        : friendship.requester_id,
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
    if (!user || !isbn || !book || selectedFriends.length === 0) {
      return;
    }

    const { data: senderProfile } = await supabase
      .from("profiles")
      .select("display_name, first_name, last_name")
      .eq("user_id", user.id)
      .single();

    const senderName = formatReviewerName(senderProfile);

    for (const friendId of selectedFriends) {
      const friendProfile = friends.find((entry) => entry.user_id === friendId);
      if (!friendProfile?.accept_suggestions) {
        continue;
      }

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

  const handleRate = async (nextRating: number) => {
    if (!user || !isbn) {
      return;
    }

    setUserRating(nextRating);

    const { error } = await supabase.from("ratings").upsert({
      user_id: user.id,
      book_isbn13: isbn,
      rating: nextRating,
      review,
    });

    if (error) {
      toast({
        title: "Could not save rating",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    await loadReviews(isbn);
    toast({ title: "Rating saved!" });
  };

  const handleReviewSave = async () => {
    if (!user || !isbn) {
      return;
    }

    setSavingReview(true);

    const { error } = await supabase.from("ratings").upsert({
      user_id: user.id,
      book_isbn13: isbn,
      rating: userRating || 3,
      review,
    });

    setSavingReview(false);

    if (error) {
      toast({
        title: "Could not save review",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    if (!userRating) {
      setUserRating(3);
    }

    await loadReviews(isbn);
    toast({ title: "Review saved!" });
  };

  const handleDeleteReview = async () => {
    if (!user || !isbn) {
      return;
    }

    setDeletingReview(true);

    const { error } = await supabase
      .from("ratings")
      .delete()
      .eq("user_id", user.id)
      .eq("book_isbn13", isbn);

    setDeletingReview(false);

    if (error) {
      toast({
        title: "Could not delete review",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    setUserRating(0);
    setReview("");
    await loadReviews(isbn);
    toast({ title: "Your rating and review were removed." });
  };

  const handleReadingStatus = async (status: string) => {
    if (!user || !isbn || !book) {
      return;
    }

    const nextStatus = status as ReadingStatus;
    setReadingStatus(nextStatus);

    await supabase.from("reading_list").upsert({
      user_id: user.id,
      book_isbn13: isbn,
      status: nextStatus,
      total_pages: book.num_pages,
      started_at:
        nextStatus === "currently_reading" ? new Date().toISOString() : undefined,
      finished_at:
        nextStatus === "finished" ? new Date().toISOString() : undefined,
    });

    toast({
      title: `Added to "${nextStatus === "wishlist" ? "Wishlist" : nextStatus.replace(/_/g, " ")}"`,
    });
  };

  const handleRemoveStatus = async () => {
    if (!user || !isbn) {
      return;
    }

    await supabase
      .from("reading_list")
      .delete()
      .eq("user_id", user.id)
      .eq("book_isbn13", isbn);

    setReadingStatus("");
    toast({ title: "Removed from reading list" });
  };

  const toggleFavourite = async () => {
    if (!user || !isbn) {
      return;
    }

    if (isFavourite) {
      await supabase
        .from("favourites")
        .delete()
        .eq("user_id", user.id)
        .eq("book_isbn13", isbn);
      setIsFavourite(false);
      toast({ title: "Removed from favourites" });
      return;
    }

    await supabase
      .from("favourites")
      .insert({ user_id: user.id, book_isbn13: isbn });
    setIsFavourite(true);
    toast({ title: "Added to favourites!" });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
      </div>
    );
  }

  if (!book) {
    return (
      <div className="py-20 text-center">
        <p className="text-muted-foreground">Book not found.</p>
        <Link to="/search">
          <Button variant="outline" className="mt-4">
            Go to Search
          </Button>
        </Link>
      </div>
    );
  }

  const genres = book.categories
    ? book.categories
        .split(";")
        .map((genre) => genre.trim())
        .filter(Boolean)
    : [];

  return (
    <div className="space-y-8">
      <button
        onClick={() => navigate(-1)}
        className="inline-flex items-center text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="mr-1 h-4 w-4" />
        Back
      </button>

      <section className="overflow-hidden rounded-[28px] border border-border/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.96),rgba(255,246,231,0.92)_42%,rgba(236,242,255,0.92)_100%)] shadow-sm">
        <div className="flex flex-col gap-8 px-5 py-6 md:flex-row md:items-start md:px-7">
          <div className="shrink-0">
            <img
              src={book.thumbnail || "/placeholder.svg"}
              alt={book.title}
              className="h-72 w-48 rounded-2xl object-cover shadow-xl ring-1 ring-black/5"
              onError={(event) => {
                (event.target as HTMLImageElement).src = "/placeholder.svg";
              }}
            />
          </div>

          <div className="flex-1 space-y-5">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-background/70 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                <Sparkles className="h-3.5 w-3.5" />
                Book Details
              </div>
              <div>
                <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
                  {book.title}
                </h1>
                <p className="mt-2 text-lg text-foreground/85">{book.authors}</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2 rounded-full bg-background/80 px-3 py-2 shadow-sm">
                <RatingStars rating={book.average_rating} size="md" />
                <span className="font-semibold">
                  {book.average_rating.toFixed(1)}
                </span>
                <span className="text-sm text-muted-foreground">
                  ({book.ratings_count.toLocaleString()} ratings)
                </span>
              </div>

              <div className="flex flex-wrap gap-2">
                {genres.map((genre) => (
                  <Link key={genre} to={`/genres?genre=${encodeURIComponent(genre)}`}>
                    <GenreTag genre={genre} size="md" />
                  </Link>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              <span className="flex items-center gap-1 rounded-full bg-background/70 px-3 py-1.5">
                <Calendar className="h-4 w-4" />
                {book.published_year}
              </span>
              <span className="flex items-center gap-1 rounded-full bg-background/70 px-3 py-1.5">
                <Hash className="h-4 w-4" />
                {book.num_pages} pages
              </span>
              <span className="flex items-center gap-1 rounded-full bg-background/70 px-3 py-1.5">
                <Users className="h-4 w-4" />
                {reviews.length} reader reviews
              </span>
            </div>

            {user && (
              <div className="flex flex-wrap items-center gap-3">
                <Select value={readingStatus} onValueChange={handleReadingStatus}>
                  <SelectTrigger className="w-52 rounded-xl bg-background/80">
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
                    <Badge variant="secondary" className="rounded-full px-3 py-1.5">
                      {readingStatus === "wishlist"
                        ? "Wishlist"
                        : readingStatus.replace(/_/g, " ")}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-full"
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
                    className={`h-10 w-10 rounded-full ${
                      isFavourite
                        ? "text-destructive"
                        : "text-muted-foreground hover:text-destructive"
                    }`}
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

                <Dialog
                  open={suggestOpen}
                  onOpenChange={(open) => {
                    if (open) {
                      loadFriends();
                    }
                    setSuggestOpen(open);
                  }}
                >
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm" className="rounded-xl">
                      <Send className="mr-1.5 h-3.5 w-3.5" />
                      Suggest to Friends
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Suggest "{book.title}" to Friends</DialogTitle>
                    </DialogHeader>

                    {friends.length === 0 ? (
                      <p className="py-4 text-center text-sm text-muted-foreground">
                        No friends yet.
                      </p>
                    ) : (
                      <div className="max-h-60 space-y-2 overflow-auto">
                        {friends
                          .filter((entry) => entry.accept_suggestions !== false)
                          .map((entry) => (
                            <label
                              key={entry.user_id}
                              className="flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-colors hover:bg-muted/40"
                            >
                              <Checkbox
                                checked={selectedFriends.includes(entry.user_id)}
                                onCheckedChange={(checked) => {
                                  setSelectedFriends((current) =>
                                    checked
                                      ? [...current, entry.user_id]
                                      : current.filter((id) => id !== entry.user_id),
                                  );
                                }}
                              />
                              <span className="text-sm">
                                {formatReviewerName(entry)}
                              </span>
                            </label>
                          ))}
                      </div>
                    )}

                    <Button
                      onClick={handleSuggest}
                      disabled={selectedFriends.length === 0}
                      className="w-full rounded-xl"
                    >
                      Send Suggestion ({selectedFriends.length})
                    </Button>
                  </DialogContent>
                </Dialog>
              </div>
            )}
          </div>
        </div>
      </section>

      {book.description && (
        <Card className="overflow-hidden rounded-[24px] border-border/70 shadow-sm">
          <CardContent className="pt-6">
            <h3 className="mb-3 flex items-center gap-2 font-semibold">
              <BookOpen className="h-4 w-4" />
              Description
            </h3>
            <p className="leading-7 text-muted-foreground">{book.description}</p>
          </CardContent>
        </Card>
      )}

      {user && (
        <Card className="overflow-hidden rounded-[24px] border-border/70 shadow-sm">
          <CardContent className="space-y-4 pt-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold">Your Rating & Review</h3>
                <p className="text-sm text-muted-foreground">
                  Update your score anytime or remove your feedback completely.
                </p>
              </div>
              {userRating > 0 && (
                <Badge variant="secondary" className="rounded-full px-3 py-1.5">
                  {userRating} / 5
                </Badge>
              )}
            </div>

            <RatingStars
              rating={userRating}
              size="lg"
              interactive
              onRate={handleRate}
            />

            <Textarea
              placeholder="Write a review (optional)..."
              value={review}
              onChange={(event) => setReview(event.target.value)}
              rows={4}
              className="bg-background/80"
            />

            <div className="flex flex-wrap items-center gap-3">
              <Button
                onClick={handleReviewSave}
                size="sm"
                className="rounded-xl"
                disabled={savingReview}
              >
                {savingReview ? "Saving..." : "Save Review"}
              </Button>

              {(userRating > 0 || review.trim()) && (
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-xl text-destructive hover:text-destructive"
                  onClick={handleDeleteReview}
                  disabled={deletingReview}
                >
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                  {deletingReview ? "Deleting..." : "Delete Rating & Review"}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="overflow-hidden rounded-[24px] border-border/70 shadow-sm">
        <CardContent className="space-y-4 pt-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="flex items-center gap-2 font-semibold">
                <MessageSquare className="h-4 w-4" />
                Reader Reviews
              </h3>
              <p className="text-sm text-muted-foreground">
                Reviews from other readers for this book.
              </p>
            </div>
            <Badge variant="secondary" className="rounded-full px-3 py-1.5">
              {communityReviews.length}
            </Badge>
          </div>

          {reviewsLoading ? (
            <div className="flex items-center justify-center py-10">
              <div className="h-7 w-7 animate-spin rounded-full border-b-2 border-primary" />
            </div>
          ) : communityReviews.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-muted/25 px-5 py-10 text-center">
              <p className="font-medium">No reader reviews yet</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Be the first one to leave a rating or a short review.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {communityReviews.map((entry) => (
                <ReviewCard
                  key={entry.id}
                  review={entry}
                  isCurrentUser={entry.user_id === user?.id}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {similar.length > 0 && <BookGrid books={similar} title="Similar Books" />}
    </div>
  );
}
