import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { getBookByIsbn } from '@/services/bookService';
import { Book } from '@/types/book';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { BookOpen, BookMarked, CheckCircle2, Minus, Plus, Trash2, Calendar, Heart } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';

interface ReadingItem {
  id: string;
  book_isbn13: string;
  status: string;
  current_page: number | null;
  total_pages: number | null;
  started_at: string | null;
  finished_at: string | null;
  book?: Book;
}

export default function MyBooksPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [items, setItems] = useState<ReadingItem[]>([]);
  const [favourites, setFavourites] = useState<string[]>([]);
  const [favouriteBooks, setFavouriteBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmFinish, setConfirmFinish] = useState<ReadingItem | null>(null);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const [{ data }, { data: favData }] = await Promise.all([
        supabase.from('reading_list').select('*').eq('user_id', user.id).order('updated_at', { ascending: false }),
        supabase.from('favourites').select('book_isbn13').eq('user_id', user.id),
      ]);

      if (data) {
        const withBooks = await Promise.all(
          data.map(async (item) => {
            const book = await getBookByIsbn(item.book_isbn13);
            return { ...item, book };
          })
        );
        setItems(withBooks);
      }

      const favIsbns = (favData || []).map((f) => f.book_isbn13);
      setFavourites(favIsbns);
      const favBooks = await Promise.all(favIsbns.map((isbn) => getBookByIsbn(isbn)));
      setFavouriteBooks(favBooks.filter(Boolean) as Book[]);
      setLoading(false);
    };
    load();
  }, [user]);

  const updateProgress = async (id: string, page: number) => {
    if (!user) return;
    const item = items.find((i) => i.id === id);
    if (!item) return;
    const newPage = Math.max(0, Math.min(page, item.total_pages || 9999));

    if (item.total_pages && newPage >= item.total_pages && item.status === 'currently_reading') {
      setConfirmFinish({ ...item, current_page: newPage });
      return;
    }

    await supabase.from('reading_list').update({ current_page: newPage }).eq('id', id);
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, current_page: newPage } : i)));
    toast({ title: 'Progress updated!' });
  };

  const handleConfirmFinish = async () => {
    if (!confirmFinish || !user) return;
    await supabase.from('reading_list').update({
      current_page: confirmFinish.total_pages,
      status: 'finished',
      finished_at: new Date().toISOString(),
    }).eq('id', confirmFinish.id);

    setItems((prev) => prev.map((i) =>
      i.id === confirmFinish.id
        ? { ...i, current_page: confirmFinish.total_pages, status: 'finished', finished_at: new Date().toISOString() }
        : i
    ));
    toast({ title: 'Book marked as finished!' });
    setConfirmFinish(null);
  };

  const handleCancelFinish = async () => {
    if (!confirmFinish) return;
    await supabase.from('reading_list').update({ current_page: confirmFinish.current_page }).eq('id', confirmFinish.id);
    setItems((prev) => prev.map((i) => (i.id === confirmFinish.id ? { ...i, current_page: confirmFinish.current_page } : i)));
    setConfirmFinish(null);
  };

  const removeItem = async (id: string) => {
    if (!user) return;
    await supabase.from('reading_list').delete().eq('id', id);
    setItems((prev) => prev.filter((i) => i.id !== id));
    toast({ title: 'Removed from list' });
  };

  const toggleFavourite = async (isbn: string) => {
    if (!user) return;
    if (favourites.includes(isbn)) {
      await supabase.from('favourites').delete().eq('user_id', user.id).eq('book_isbn13', isbn);
      setFavourites((prev) => prev.filter((f) => f !== isbn));
      setFavouriteBooks((prev) => prev.filter((b) => b.isbn13 !== isbn));
      toast({ title: 'Removed from favourites' });
    } else {
      await supabase.from('favourites').insert({ user_id: user.id, book_isbn13: isbn });
      setFavourites((prev) => [...prev, isbn]);
      const book = await getBookByIsbn(isbn);
      if (book) setFavouriteBooks((prev) => (prev.some((b) => b.isbn13 === isbn) ? prev : [...prev, book]));
      toast({ title: 'Added to favourites!' });
    }
  };

  const filterByStatus = (status: string) => items.filter((i) => i.status === status);
  const favouriteItems = favouriteBooks.map((book) => {
    const existing = items.find((i) => i.book_isbn13 === book.isbn13);
    return existing || {
      id: `fav-${book.isbn13}`,
      book_isbn13: book.isbn13,
      status: 'wishlist',
      current_page: null,
      total_pages: book.num_pages || null,
      started_at: null,
      finished_at: null,
      book,
    };
  });

  if (loading) return <div className="flex items-center justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;

  const renderBookList = (books: ReadingItem[], showProgress = false) => (
    <div className="space-y-3">
      {books.length === 0 ? (
        <p className="text-center text-muted-foreground py-8">No books here yet.</p>
      ) : (
        books.map((item) => (
          <Card key={item.id}>
            <CardContent className="p-4 flex items-center gap-4">
              <Link to={`/book/${item.book_isbn13}`}>
                <img src={item.book?.thumbnail || '/placeholder.svg'} alt={item.book?.title || 'Book'} className="w-12 h-18 object-cover rounded shrink-0" onError={(e) => { (e.target as HTMLImageElement).src = '/placeholder.svg'; }} />
              </Link>
              <div className="flex-1 min-w-0">
                <Link to={`/book/${item.book_isbn13}`} className="font-medium text-sm hover:underline line-clamp-1">{item.book?.title || item.book_isbn13}</Link>
                <p className="text-xs text-muted-foreground">{item.book?.authors}</p>
                {item.started_at && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                    <Calendar className="h-3 w-3" /> Started: {new Date(item.started_at).toLocaleDateString()}
                  </p>
                )}
                {item.finished_at && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" /> Finished: {new Date(item.finished_at).toLocaleDateString()}
                  </p>
                )}
                {!item.started_at && item.status === 'finished' && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                    <Calendar className="h-3 w-3" /> Started: N/A
                  </p>
                )}
                {showProgress && item.total_pages && (
                  <div className="mt-2 space-y-1">
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="icon" className="h-6 w-6" onClick={() => updateProgress(item.id, (item.current_page || 0) - 10)}>
                        <Minus className="h-3 w-3" />
                      </Button>
                      <Input
                        type="number"
                        value={item.current_page || 0}
                        onChange={(e) => updateProgress(item.id, parseInt(e.target.value) || 0)}
                        className="w-16 h-7 text-center text-xs"
                      />
                      <span className="text-xs text-muted-foreground">/ {item.total_pages}</span>
                      <Button variant="outline" size="icon" className="h-6 w-6" onClick={() => updateProgress(item.id, (item.current_page || 0) + 10)}>
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                    <Progress value={((item.current_page || 0) / item.total_pages) * 100} className="h-1.5" />
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className={`h-8 w-8 ${favourites.includes(item.book_isbn13) ? 'text-destructive' : 'text-muted-foreground hover:text-destructive'}`}
                  onClick={() => toggleFavourite(item.book_isbn13)}
                  title="Favourite"
                >
                  <Heart className={`h-4 w-4 ${favourites.includes(item.book_isbn13) ? 'fill-current' : ''}`} />
                </Button>
                {item.id.startsWith('fav-') ? null : (
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => removeItem(item.id)} title="Remove from list">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">My Books</h1>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Wishlist</CardTitle></CardHeader><CardContent><div className="flex items-center gap-2"><BookMarked className="h-5 w-5 text-primary" /><span className="text-2xl font-bold">{filterByStatus('wishlist').length}</span></div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Reading</CardTitle></CardHeader><CardContent><div className="flex items-center gap-2"><BookOpen className="h-5 w-5 text-accent" /><span className="text-2xl font-bold">{filterByStatus('currently_reading').length}</span></div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Finished</CardTitle></CardHeader><CardContent><div className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-primary" /><span className="text-2xl font-bold">{filterByStatus('finished').length}</span></div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Favourites</CardTitle></CardHeader><CardContent><div className="flex items-center gap-2"><Heart className="h-5 w-5 text-destructive" /><span className="text-2xl font-bold">{favouriteItems.length}</span></div></CardContent></Card>
      </div>

      <Tabs defaultValue="currently_reading">
        <TabsList>
          <TabsTrigger value="wishlist">Wishlist</TabsTrigger>
          <TabsTrigger value="currently_reading">Reading</TabsTrigger>
          <TabsTrigger value="finished">Finished</TabsTrigger>
          <TabsTrigger value="favourites">Favourites ({favouriteItems.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="wishlist">{renderBookList(filterByStatus('wishlist'))}</TabsContent>
        <TabsContent value="currently_reading">{renderBookList(filterByStatus('currently_reading'), true)}</TabsContent>
        <TabsContent value="finished">{renderBookList(filterByStatus('finished'))}</TabsContent>
        <TabsContent value="favourites">{renderBookList(favouriteItems)}</TabsContent>
      </Tabs>

      <AlertDialog open={!!confirmFinish} onOpenChange={(open) => { if (!open) handleCancelFinish(); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark as Finished?</AlertDialogTitle>
            <AlertDialogDescription>
              You've reached the end of "{confirmFinish?.book?.title}". Would you like to mark this book as finished?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancelFinish}>Keep Reading</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmFinish}>Mark as Finished</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
