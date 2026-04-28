import { useState, useEffect, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { getBookByIsbn, searchBooks, getPopularGenres, loadBooks } from '@/services/bookService';
import { Book } from '@/types/book';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import GenreTag from '@/components/GenreTag';
import { PasswordInput } from '@/components/PasswordInput';
import {
  BookOpen, Star, Calendar, Edit2, Save, Upload, Send, Search, Copy, UserMinus, X,
  User, Activity, BookMarked, Settings, Mail, Lock, Heart, Trash2, Minus, Plus,
  CheckCircle2, ChevronLeft, ChevronRight, Users
} from 'lucide-react';
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

interface FriendProfile {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
}

interface FriendshipWithProfile {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: string;
  friend?: FriendProfile;
}

export default function ProfilePage() {
  const { userId } = useParams<{ userId?: string }>();
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const isOwnProfile = !userId || userId === user?.id;
  const targetUserId = userId || user?.id;

  const [profile, setProfile] = useState<any>(null);
  const [activeSection, setActiveSection] = useState('overview');
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState({ bio: '', first_name: '', last_name: '', date_of_birth: '', gender: '' });
  const [avatarFile, setAvatarFile] = useState<File | null>(null);

  // Activity
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [activityPage, setActivityPage] = useState(1);
  const activityPerPage = 6;

  // Reading list
  const [readingList, setReadingList] = useState<ReadingItem[]>([]);
  const [favourites, setFavourites] = useState<string[]>([]);
  const [confirmFinish, setConfirmFinish] = useState<ReadingItem | null>(null);

  // Friends (own profile only)
  const [friends, setFriends] = useState<FriendshipWithProfile[]>([]);
  const [friendSearch, setFriendSearch] = useState('');
  const [isFriend, setIsFriend] = useState(false);
  const [friendshipStatus, setFriendshipStatus] = useState<'none' | 'pending_sent' | 'pending_received' | 'accepted'>('none');
  const [pendingRequestCount, setPendingRequestCount] = useState(0);
  const [confirmRemoveFriend, setConfirmRemoveFriend] = useState<FriendshipWithProfile | null>(null);

  // Book suggestion (other profile, friend only)
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [suggestQuery, setSuggestQuery] = useState('');
  const [suggestResults, setSuggestResults] = useState<Book[]>([]);
  const [selectedSuggestBooks, setSelectedSuggestBooks] = useState<Book[]>([]);
  const suggestDebounceRef = useRef<NodeJS.Timeout>();

  // Preferences (own profile)
  const [preferences, setPreferences] = useState({
    is_books_public: true,
    accept_friend_requests: true,
    accept_suggestions: true,
    accept_notifications: true,
  });
  const [savedPreferences, setSavedPreferences] = useState({
    is_books_public: true,
    accept_friend_requests: true,
    accept_suggestions: true,
    accept_notifications: true,
  });
  const [userGenres, setUserGenres] = useState<string[]>([]);
  const [savedGenres, setSavedGenres] = useState<string[]>([]);
  const [allGenres, setAllGenres] = useState<string[]>([]);
  const [genreSearch, setGenreSearch] = useState('');

  // Account (own profile)
  const [newEmail, setNewEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  useEffect(() => {
    if (!targetUserId) return;
    const load = async () => {
      const [profileRes, ratingsRes, readingRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('user_id', targetUserId).single(),
        supabase.from('ratings').select('*').eq('user_id', targetUserId).order('created_at', { ascending: false }),
        supabase.from('reading_list').select('*').eq('user_id', targetUserId).order('updated_at', { ascending: false }),
      ]);

      if (profileRes.data) {
        setProfile(profileRes.data);
        setEditData({
          bio: profileRes.data.bio || '',
          first_name: profileRes.data.first_name || '',
          last_name: profileRes.data.last_name || '',
          date_of_birth: profileRes.data.date_of_birth || '',
          gender: profileRes.data.gender || '',
        });
        const nextPrefs = {
          is_books_public: profileRes.data.is_books_public ?? true,
          accept_friend_requests: profileRes.data.accept_friend_requests ?? true,
          accept_suggestions: profileRes.data.accept_suggestions ?? true,
          accept_notifications: profileRes.data.accept_notifications ?? true,
        };
        setPreferences(nextPrefs);
        setSavedPreferences(nextPrefs);
      }

      // Recent activity
      const ratings = ratingsRes.data || [];
      const activities = await Promise.all(
        ratings.slice(0, 30).map(async (r: any) => {
          const book = await getBookByIsbn(r.book_isbn13);
          return { isbn: r.book_isbn13, bookTitle: book?.title || r.book_isbn13, thumbnail: book?.thumbnail, rating: r.rating, date: r.created_at };
        })
      );
      setRecentActivity(activities);

      // Reading list with book details
      const rlData = readingRes.data || [];
      const withBooks = await Promise.all(
        rlData.map(async (item: any) => {
          const book = await getBookByIsbn(item.book_isbn13);
          return { ...item, book };
        })
      );
      setReadingList(withBooks);

      // Favourites
      if (isOwnProfile && user) {
        const { data: favData } = await supabase.from('favourites').select('book_isbn13').eq('user_id', user.id);
        setFavourites((favData || []).map((f) => f.book_isbn13));
      }

      // Friends (own profile)
      if (isOwnProfile && user) {
        await loadFriends();
        const genres = await getPopularGenres();
        setAllGenres(genres);
        const { data: prefs } = await supabase.from('user_preferences').select('genre').eq('user_id', user.id);
        const prefGenres = (prefs || []).map((p) => p.genre);
        setUserGenres(prefGenres);
        setSavedGenres(prefGenres);
      }

      // Check friendship (other profile)
      if (user && !isOwnProfile) {
        const { data: relation } = await supabase
          .from('friendships')
          .select('requester_id, addressee_id, status')
          .or(`and(requester_id.eq.${user.id},addressee_id.eq.${targetUserId}),and(requester_id.eq.${targetUserId},addressee_id.eq.${user.id})`)
          .maybeSingle();

        if (!relation) {
          setIsFriend(false);
          setFriendshipStatus('none');
        } else if (relation.status === 'accepted') {
          setIsFriend(true);
          setFriendshipStatus('accepted');
        } else if (relation.requester_id === user.id) {
          setIsFriend(false);
          setFriendshipStatus('pending_sent');
        } else {
          setIsFriend(false);
          setFriendshipStatus('pending_received');
        }
      }
    };
    load();
  }, [targetUserId, user, isOwnProfile]);

  const loadFriends = async () => {
    if (!user) return;
    const { data: friendships } = await supabase
      .from('friendships')
      .select('*')
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);

    if (!friendships) return;
    const accepted = friendships.filter((f) => f.status === 'accepted');
    setPendingRequestCount(friendships.filter((f) => f.status === 'pending' && f.addressee_id === user.id).length);

    const friendIds = accepted.map((f) => f.requester_id === user.id ? f.addressee_id : f.requester_id);
    if (friendIds.length === 0) { setFriends([]); return; }
    const { data: profiles } = await supabase.from('profiles').select('user_id, display_name, first_name, last_name, avatar_url').in('user_id', friendIds);
    const profileMap = new Map((profiles || []).map((p: any) => [p.user_id, p]));
    setFriends(accepted.map((f) => ({
      ...f,
      friend: profileMap.get(f.requester_id === user.id ? f.addressee_id : f.requester_id),
    })));
  };

  const handleSave = async () => {
    if (!user) return;
    const fullName = `${editData.first_name} ${editData.last_name}`.trim();
    const updates: any = {
      display_name: fullName || null,
      bio: editData.bio,
      first_name: editData.first_name,
      last_name: editData.last_name,
      date_of_birth: editData.date_of_birth || null,
      gender: editData.gender || null,
      avatar_url: profile?.avatar_url || null,
    };

    if (avatarFile) {
      const fileExt = avatarFile.name.split('.').pop() || 'jpg';
      const filePath = `${user.id}/avatar.${fileExt}`;
      const { error: uploadError } = await supabase.storage.from('avatars').upload(filePath, avatarFile, { upsert: true });
      if (uploadError) {
        toast({ title: 'Avatar upload failed', description: uploadError.message, variant: 'destructive' });
        return;
      }
      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(filePath);
      updates.avatar_url = `${urlData.publicUrl}?v=${Date.now()}`;
    }

    const { error } = await supabase.from('profiles').update(updates).eq('user_id', user.id);
    if (error) {
      toast({ title: 'Profile update failed', description: error.message, variant: 'destructive' });
      return;
    }

    setProfile((p: any) => ({ ...p, ...updates }));
    setEditing(false);
    setAvatarFile(null);
    toast({ title: 'Profile updated!' });
  };

  const handleRemoveAvatar = async () => {
    if (!user) return;
    const { error } = await supabase.from('profiles').update({ avatar_url: null }).eq('user_id', user.id);
    if (error) {
      toast({ title: 'Failed to remove avatar', description: error.message, variant: 'destructive' });
      return;
    }
    setProfile((p: any) => ({ ...p, avatar_url: null }));
    setAvatarFile(null);
    toast({ title: 'Avatar removed' });
  };

  const handleSavePreferences = async () => {
    if (!user) return;

    const { error: prefError } = await supabase.from('profiles').update(preferences).eq('user_id', user.id);
    if (prefError) {
      toast({ title: 'Failed to save preferences', description: prefError.message, variant: 'destructive' });
      return;
    }

    const { error: deleteError } = await supabase.from('user_preferences').delete().eq('user_id', user.id);
    if (deleteError) {
      toast({ title: 'Failed to save preferred genres', description: deleteError.message, variant: 'destructive' });
      return;
    }

    if (userGenres.length > 0) {
      const { error: insertError } = await supabase
        .from('user_preferences')
        .insert(userGenres.map((genre) => ({ user_id: user.id, genre })));
      if (insertError) {
        toast({ title: 'Failed to save preferred genres', description: insertError.message, variant: 'destructive' });
        return;
      }
    }

    setSavedPreferences(preferences);
    setSavedGenres(userGenres);
    toast({ title: 'Preferences saved!' });
  };

  const toggleGenrePref = (genre: string) => {
    setUserGenres((prev) =>
      prev.includes(genre) ? prev.filter((g) => g !== genre) : [...prev, genre]
    );
  };

  const handleEmailChange = async () => {
    if (!newEmail.trim() || !user?.email) return;
    if (newEmail.trim().toLowerCase() === user.email.toLowerCase()) {
      toast({ title: 'Email is unchanged', description: 'Please enter a different email address.', variant: 'destructive' });
      return;
    }
    const { error } = await supabase.auth.updateUser({ email: newEmail.trim() });
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else toast({ title: 'Verification email sent to new address' });
    setNewEmail('');
  };

  const handlePasswordChange = async () => {
    if (!user?.email || !currentPassword || !newPassword || !confirmPassword) return;
    if (newPassword.length < 6) {
      toast({ title: 'Password too short', description: 'Use at least 6 characters.', variant: 'destructive' });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: 'Passwords do not match', variant: 'destructive' });
      return;
    }

    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    });

    if (verifyError) {
      toast({ title: 'Current password is incorrect', description: verifyError.message, variant: 'destructive' });
      return;
    }

    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }

    toast({ title: 'Password updated!' });
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
  };

  const copyId = () => {
    if (targetUserId) {
      navigator.clipboard.writeText(targetUserId);
      toast({ title: 'User ID copied!' });
    }
  };

  const hasPreferenceChanges =
    JSON.stringify(preferences) !== JSON.stringify(savedPreferences) ||
    JSON.stringify([...userGenres].sort()) !== JSON.stringify([...savedGenres].sort());

  const sendFriendRequest = async () => {
    if (!user || !targetUserId || profile?.accept_friend_requests === false) return;
    const { error } = await supabase.from('friendships').insert({ requester_id: user.id, addressee_id: targetUserId });
    if (error) {
      toast({ title: 'Could not send request', description: error.message, variant: 'destructive' });
      return;
    }

    if (profile?.accept_notifications) {
      await supabase.from('notifications').insert({
        user_id: targetUserId,
        type: 'friend_request',
        title: 'New Friend Request',
        message: 'You have a new friend request.',
        related_user_id: user.id,
      });
    }

    setFriendshipStatus('pending_sent');
    toast({ title: 'Friend request sent!' });
  };

  const removeFriend = async (friendship: FriendshipWithProfile) => {
    await supabase.from('friendships').delete().eq('id', friendship.id);
    setFriends((prev) => prev.filter((f) => f.id !== friendship.id));
    toast({ title: 'Friend removed' });
    setConfirmRemoveFriend(null);
  };

  // Book suggestions for friend profiles
  const handleSuggestQueryChange = (value: string) => {
    setSuggestQuery(value);
    if (suggestDebounceRef.current) clearTimeout(suggestDebounceRef.current);
    if (value.trim().length >= 2) {
      suggestDebounceRef.current = setTimeout(async () => {
        const allBooks = await loadBooks();
        const q = value.toLowerCase();
        // Filter out books already in target user's reading/finished list
        const targetBookIsbns = new Set(readingList.filter(i => i.status === 'currently_reading' || i.status === 'finished').map(i => i.book_isbn13));
        const matches = allBooks
          .filter((b) => (b.title.toLowerCase().includes(q) || b.authors.toLowerCase().includes(q)) && !targetBookIsbns.has(b.isbn13))
          .slice(0, 10);
        setSuggestResults(matches);
      }, 300);
    } else {
      setSuggestResults([]);
    }
  };

  const handleSuggestBooks = async () => {
    if (!user || !targetUserId || selectedSuggestBooks.length === 0) return;
    if (profile?.accept_suggestions === false) {
      toast({ title: 'This user is not accepting book suggestions.' });
      return;
    }

    const { data: senderProfile } = await supabase
      .from('profiles')
      .select('display_name, first_name, last_name')
      .eq('user_id', user.id)
      .single();
    const senderName = senderProfile?.display_name || `${senderProfile?.first_name || ''} ${senderProfile?.last_name || ''}`.trim() || 'Someone';

    for (const book of selectedSuggestBooks) {
      await supabase.from('book_suggestions').insert({
        sender_id: user.id,
        receiver_id: targetUserId,
        book_isbn13: book.isbn13,
        message: `Check out "${book.title}"!`,
      });

      if (profile?.accept_notifications) {
        await supabase.from('notifications').insert({
          user_id: targetUserId,
          type: 'book_suggestion',
          title: 'Book Suggestion',
          message: `${senderName} suggested "${book.title}" to you!`,
          related_book_isbn13: book.isbn13,
          related_user_id: user.id,
        });
      }
    }
    toast({ title: `Suggested ${selectedSuggestBooks.length} book(s)!` });
    setSuggestOpen(false);
    setSuggestQuery('');
    setSuggestResults([]);
    setSelectedSuggestBooks([]);
  };

  // Reading list controls (own profile)
  const updateProgress = async (id: string, page: number) => {
    if (!user) return;
    const item = readingList.find((i) => i.id === id);
    if (!item) return;
    const newPage = Math.max(0, Math.min(page, item.total_pages || 9999));
    if (item.total_pages && newPage >= item.total_pages && item.status === 'currently_reading') {
      setConfirmFinish({ ...item, current_page: newPage });
      return;
    }
    await supabase.from('reading_list').update({ current_page: newPage }).eq('id', id);
    setReadingList((prev) => prev.map((i) => (i.id === id ? { ...i, current_page: newPage } : i)));
  };

  const handleConfirmFinish = async () => {
    if (!confirmFinish || !user) return;
    await supabase.from('reading_list').update({
      current_page: confirmFinish.total_pages,
      status: 'finished',
      finished_at: new Date().toISOString(),
    }).eq('id', confirmFinish.id);
    setReadingList((prev) => prev.map((i) =>
      i.id === confirmFinish.id
        ? { ...i, current_page: confirmFinish.total_pages, status: 'finished', finished_at: new Date().toISOString() }
        : i
    ));
    toast({ title: 'Book marked as finished!' });
    setConfirmFinish(null);
  };

  const removeReadingItem = async (id: string) => {
    if (!user) return;
    await supabase.from('reading_list').delete().eq('id', id);
    setReadingList((prev) => prev.filter((i) => i.id !== id));
    toast({ title: 'Removed from list' });
  };

  const toggleFavourite = async (isbn: string) => {
    if (!user) return;
    if (favourites.includes(isbn)) {
      await supabase.from('favourites').delete().eq('user_id', user.id).eq('book_isbn13', isbn);
      setFavourites((prev) => prev.filter((f) => f !== isbn));
    } else {
      await supabase.from('favourites').insert({ user_id: user.id, book_isbn13: isbn });
      setFavourites((prev) => [...prev, isbn]);
    }
  };

  const filterReadingList = (status: string) => readingList.filter((i) => i.status === status);
  const finishedCount = filterReadingList('finished').length;

  // Determine if books are visible
  const canViewBooks = isOwnProfile || profile?.is_books_public;

  // Sidebar options
  const sidebarItems = [
    { key: 'overview', label: 'Overview', icon: User },
    ...(isOwnProfile ? [{ key: 'friends', label: 'Friends', icon: Users }] : []),
    { key: 'activity', label: 'Recent Activity', icon: Activity },
    { key: 'books', label: 'Books', icon: BookMarked },
    ...(isOwnProfile ? [
      { key: 'preferences', label: 'Preferences', icon: Settings },
      { key: 'account', label: 'Account', icon: Lock },
    ] : []),
  ];

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (activeSection === 'preferences' && hasPreferenceChanges) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [activeSection, hasPreferenceChanges]);

  if (!profile) return <div className="flex items-center justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;

  const paginatedActivity = recentActivity.slice((activityPage - 1) * activityPerPage, activityPage * activityPerPage);
  const activityTotalPages = Math.ceil(recentActivity.length / activityPerPage);

  const filteredFriends = friendSearch.trim()
    ? friends.filter((f) => f.friend?.display_name?.toLowerCase().includes(friendSearch.toLowerCase()))
    : friends;

  const filteredAllGenres = genreSearch.trim()
    ? allGenres.filter((g) => g.toLowerCase().includes(genreSearch.toLowerCase()))
    : allGenres;

  return (
    <div className="flex flex-col md:flex-row gap-6">
      {/* Sidebar */}
      <aside className="md:w-56 shrink-0">
        <Card>
          <CardContent className="p-3 space-y-1">
            {sidebarItems.map((item) => (
              <button
                key={item.key}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer ${
                  activeSection === item.key ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
                onClick={() => {
                  if (activeSection === 'preferences' && hasPreferenceChanges && item.key !== 'preferences') {
                    const proceed = window.confirm('You have unsaved preference changes. Leave without saving?');
                    if (!proceed) return;
                  }
                  setActiveSection(item.key);
                }}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </button>
            ))}
          </CardContent>
        </Card>
      </aside>

      {/* Main content */}
      <div className="flex-1 space-y-6">
        {/* OVERVIEW */}
        {activeSection === 'overview' && (
          <Card>
            <CardContent className="pt-6 space-y-4">
              <div className="flex items-start gap-4">
                <div className="relative">
                  <Avatar className="h-16 w-16">
                    <AvatarImage src={profile.avatar_url} />
                    <AvatarFallback className="bg-primary text-primary-foreground text-xl">
                      {(profile.display_name || 'U')[0].toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  {editing && (
                    <label className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center cursor-pointer">
                      <Upload className="h-3 w-3" />
                      <input type="file" accept="image/*" className="hidden" onChange={(e) => { if (e.target.files?.[0]) setAvatarFile(e.target.files[0]); }} />
                    </label>
                  )}
                </div>
                <div className="flex-1">
                  {editing && isOwnProfile ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div><Label>First Name</Label><Input value={editData.first_name} onChange={(e) => setEditData({ ...editData, first_name: e.target.value })} /></div>
                        <div><Label>Last Name</Label><Input value={editData.last_name} onChange={(e) => setEditData({ ...editData, last_name: e.target.value })} /></div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div><Label>Date of Birth</Label><Input type="date" value={editData.date_of_birth} onChange={(e) => setEditData({ ...editData, date_of_birth: e.target.value })} /></div>
                        <div>
                          <Label>Gender</Label>
                          <Select value={editData.gender} onValueChange={(v) => setEditData({ ...editData, gender: v })}>
                            <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="male">Male</SelectItem>
                              <SelectItem value="female">Female</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div><Label>Bio</Label><Textarea value={editData.bio} onChange={(e) => setEditData({ ...editData, bio: e.target.value })} rows={2} /></div>
                      <div className="flex gap-2 flex-wrap">
                        <Button size="sm" onClick={handleSave}><Save className="h-3 w-3 mr-1" /> Save</Button>
                        <Button size="sm" variant="outline" onClick={() => { setEditing(false); setAvatarFile(null); }}>Cancel</Button>
                        <Button size="sm" variant="ghost" className="text-destructive" onClick={handleRemoveAvatar}>Remove Avatar</Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <h2 className="text-xl font-bold">{profile.display_name || `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'Reader'}</h2>
                        {isOwnProfile && <Button variant="ghost" size="icon" className="h-7 w-7 cursor-pointer" onClick={() => setEditing(true)}><Edit2 className="h-3.5 w-3.5" /></Button>}
                      </div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <span>ID: {targetUserId?.slice(0, 8)}...</span>
                        <button onClick={copyId} className="hover:text-foreground cursor-pointer"><Copy className="h-3 w-3" /></button>
                      </div>
                      {isOwnProfile && user?.email && <p className="text-sm text-muted-foreground">{user.email}</p>}
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Calendar className="h-3 w-3" /> Joined {new Date(profile.created_at).toLocaleDateString()}
                      </p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" /> {finishedCount} books finished
                      </p>
                      {profile.bio && <p className="text-sm text-muted-foreground mt-2">{profile.bio}</p>}

                      {!isOwnProfile && user && friendshipStatus === 'none' && (
                        profile.accept_friend_requests ? (
                          <Button size="sm" variant="outline" className="mt-2 cursor-pointer" onClick={sendFriendRequest}>Add Friend</Button>
                        ) : (
                          <p className="text-xs text-muted-foreground mt-2">This user is not accepting friend requests.</p>
                        )
                      )}

                      {!isOwnProfile && friendshipStatus === 'pending_sent' && (
                        <p className="text-xs text-muted-foreground mt-2">Friend request pending.</p>
                      )}

                      {/* Suggest books for friends visiting */}
                      {!isOwnProfile && isFriend && profile.accept_suggestions && (
                        <Dialog open={suggestOpen} onOpenChange={setSuggestOpen}>
                          <DialogTrigger asChild>
                            <Button size="sm" variant="outline" className="mt-2 cursor-pointer"><Send className="h-3.5 w-3.5 mr-1" /> Suggest Books</Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader><DialogTitle>Suggest Books</DialogTitle></DialogHeader>
                            <div className="relative">
                              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                              <Input placeholder="Search books..." className="pl-10" value={suggestQuery} onChange={(e) => handleSuggestQueryChange(e.target.value)} />
                            </div>
                            {selectedSuggestBooks.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {selectedSuggestBooks.map((b) => (
                                  <span key={b.isbn13} className="bg-primary/10 text-primary text-xs px-2 py-1 rounded-full flex items-center gap-1">
                                    {b.title.slice(0, 20)}...
                                    <X className="h-3 w-3 cursor-pointer" onClick={() => setSelectedSuggestBooks((prev) => prev.filter((x) => x.isbn13 !== b.isbn13))} />
                                  </span>
                                ))}
                              </div>
                            )}
                            <div className="space-y-2 max-h-60 overflow-auto">
                              {suggestResults.map((book) => (
                                <div
                                  key={book.isbn13}
                                  className={`flex items-center gap-3 p-2 border rounded cursor-pointer hover:bg-muted/50 ${selectedSuggestBooks.some((b) => b.isbn13 === book.isbn13) ? 'bg-primary/5 border-primary/30' : ''}`}
                                  onClick={() => {
                                    setSelectedSuggestBooks((prev) =>
                                      prev.some((b) => b.isbn13 === book.isbn13)
                                        ? prev.filter((b) => b.isbn13 !== book.isbn13)
                                        : [...prev, book]
                                    );
                                  }}
                                >
                                  <img src={book.thumbnail || '/placeholder.svg'} alt={book.title} className="w-8 h-12 object-cover rounded" onError={(e) => { (e.target as HTMLImageElement).src = '/placeholder.svg'; }} />
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium line-clamp-1">{book.title}</p>
                                    <p className="text-xs text-muted-foreground">{book.authors}</p>
                                  </div>
                                </div>
                              ))}
                            </div>
                            <Button onClick={handleSuggestBooks} disabled={selectedSuggestBooks.length === 0} className="w-full cursor-pointer">
                              Send {selectedSuggestBooks.length} Suggestion(s)
                            </Button>
                          </DialogContent>
                        </Dialog>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* FRIENDS (own profile only) */}
        {activeSection === 'friends' && isOwnProfile && (
          <Card>
            <CardContent className="pt-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Friends ({friends.length}) • Requests ({pendingRequestCount})</h3>
                <Button size="sm" variant="outline" className="cursor-pointer" onClick={() => navigate('/friends')}>
                  Manage Friends
                </Button>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search friends..." className="pl-10" value={friendSearch} onChange={(e) => setFriendSearch(e.target.value)} />
              </div>
              <div className="space-y-2">
                {filteredFriends.length === 0 ? (
                  <p className="text-center text-muted-foreground py-4">No friends found.</p>
                ) : (
                  filteredFriends.map((f) => (
                    <div key={f.id} className="flex items-center gap-3 p-2 border rounded-lg">
                      <Link to={`/profile/${f.friend?.user_id}`}>
                        <Avatar className="h-9 w-9 cursor-pointer">
                          <AvatarImage src={f.friend?.avatar_url || undefined} />
                          <AvatarFallback>{(f.friend?.display_name || 'U')[0].toUpperCase()}</AvatarFallback>
                        </Avatar>
                      </Link>
                      <Link to={`/profile/${f.friend?.user_id}`} className="flex-1 text-sm font-medium hover:underline">
                        {f.friend?.display_name || 'Unknown'}
                      </Link>
                      <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-destructive cursor-pointer" onClick={() => setConfirmRemoveFriend(f)}>
                        <UserMinus className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* ACTIVITY */}
        {activeSection === 'activity' && (
          <Card>
            <CardContent className="pt-6 space-y-4">
              <h3 className="font-semibold">Recent Activity</h3>
              {recentActivity.length === 0 ? (
                <p className="text-center text-muted-foreground py-4">No recent activity.</p>
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {paginatedActivity.map((a, i) => (
                      <Card key={i}>
                        <CardContent className="p-3 flex items-center gap-3">
                          <Link to={`/book/${a.isbn}`}>
                            <img src={a.thumbnail || '/placeholder.svg'} alt={a.bookTitle} className="w-10 h-14 object-cover rounded shrink-0" onError={(e) => { (e.target as HTMLImageElement).src = '/placeholder.svg'; }} />
                          </Link>
                          <div className="flex-1 min-w-0">
                            <Link to={`/book/${a.isbn}`} className="text-sm font-medium hover:underline line-clamp-1">{a.bookTitle}</Link>
                            <div className="flex items-center gap-1 mt-1">
                              <Star className="h-3 w-3 text-accent" />
                              <span className="text-xs font-semibold">{a.rating}/5</span>
                            </div>
                            <p className="text-xs text-muted-foreground">{new Date(a.date).toLocaleDateString()}</p>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                  {activityTotalPages > 1 && (
                    <div className="flex items-center justify-center gap-2">
                      <Button variant="outline" size="sm" disabled={activityPage === 1} onClick={() => setActivityPage((p) => p - 1)}>
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <span className="text-sm text-muted-foreground">Page {activityPage} of {activityTotalPages}</span>
                      <Button variant="outline" size="sm" disabled={activityPage === activityTotalPages} onClick={() => setActivityPage((p) => p + 1)}>
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        )}

        {/* BOOKS */}
        {activeSection === 'books' && (
          <Card>
            <CardContent className="pt-6 space-y-4">
              <h3 className="font-semibold">{isOwnProfile ? 'My' : `${profile.display_name}'s`} Books</h3>
              {!canViewBooks ? (
                <p className="text-center text-muted-foreground py-8">This user's books are private.</p>
              ) : (
                <Tabs defaultValue="wishlist">
                  <TabsList>
                    <TabsTrigger value="wishlist">Wishlist ({filterReadingList('wishlist').length})</TabsTrigger>
                    <TabsTrigger value="currently_reading">Reading ({filterReadingList('currently_reading').length})</TabsTrigger>
                    <TabsTrigger value="finished">Finished ({filterReadingList('finished').length})</TabsTrigger>
                    {isOwnProfile && <TabsTrigger value="favourites">Favourites ({favourites.length})</TabsTrigger>}
                  </TabsList>
                  {['wishlist', 'currently_reading', 'finished'].map((status) => (
                    <TabsContent key={status} value={status}>
                      {filterReadingList(status).length === 0 ? (
                        <p className="text-center text-muted-foreground py-4">No books here.</p>
                      ) : (
                        <div className="space-y-2">
                          {filterReadingList(status).map((item) => (
                            <div key={item.book_isbn13} className="flex items-center gap-3 p-2 border rounded">
                              <Link to={`/book/${item.book_isbn13}`}>
                                <img src={item.book?.thumbnail || '/placeholder.svg'} alt={item.book?.title} className="w-8 h-12 object-cover rounded" onError={(e) => { (e.target as HTMLImageElement).src = '/placeholder.svg'; }} />
                              </Link>
                              <div className="flex-1 min-w-0">
                                <Link to={`/book/${item.book_isbn13}`} className="text-sm font-medium hover:underline line-clamp-1">{item.book?.title || item.book_isbn13}</Link>
                                <p className="text-xs text-muted-foreground">{item.book?.authors}</p>
                                {isOwnProfile && (
                                  <Select
                                    value={item.status}
                                    onValueChange={async (value) => {
                                      const updates: any = { status: value };
                                      if (value === 'currently_reading' && !item.started_at) updates.started_at = new Date().toISOString();
                                      if (value === 'finished') updates.finished_at = new Date().toISOString();
                                      if (value === 'wishlist') updates.finished_at = null;
                                      await supabase.from('reading_list').update(updates).eq('id', item.id);
                                      setReadingList((prev) => prev.map((i) => i.id === item.id ? { ...i, ...updates } : i));
                                    }}
                                  >
                                    <SelectTrigger className="h-7 w-40 text-xs mt-1"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="wishlist">Wishlist</SelectItem>
                                      <SelectItem value="currently_reading">Currently Reading</SelectItem>
                                      <SelectItem value="finished">Finished</SelectItem>
                                    </SelectContent>
                                  </Select>
                                )}
                                {item.started_at && <p className="text-xs text-muted-foreground">Started: {new Date(item.started_at).toLocaleDateString()}</p>}
                                {item.finished_at && <p className="text-xs text-muted-foreground">Finished: {new Date(item.finished_at).toLocaleDateString()}</p>}
                                {!item.started_at && status === 'finished' && <p className="text-xs text-muted-foreground">Started: N/A</p>}
                                {isOwnProfile && status === 'currently_reading' && item.total_pages && (
                                  <div className="mt-1 flex items-center gap-2">
                                    <Button variant="outline" size="icon" className="h-6 w-6" onClick={() => updateProgress(item.id, (item.current_page || 0) - 10)}><Minus className="h-3 w-3" /></Button>
                                    <Input
                                      type="number"
                                      defaultValue={item.current_page || 0}
                                      key={`${item.id}-${item.current_page}`}
                                      onBlur={(e) => updateProgress(item.id, parseInt(e.target.value) || 0)}
                                      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                                      className="w-20 h-8 text-center text-sm"
                                      min={0}
                                      max={item.total_pages}
                                    />
                                    <span className="text-xs text-muted-foreground">/ {item.total_pages}</span>
                                    <Button variant="outline" size="icon" className="h-6 w-6" onClick={() => updateProgress(item.id, (item.current_page || 0) + 10)}><Plus className="h-3 w-3" /></Button>
                                  </div>
                                )}
                              </div>
                              {isOwnProfile && (
                                <div className="flex items-center gap-1">
                                  {(item.status === 'currently_reading' || item.status === 'finished') && (
                                    <Button variant="ghost" size="icon" className={`h-7 w-7 cursor-pointer ${favourites.includes(item.book_isbn13) ? 'text-destructive' : 'text-muted-foreground'}`} onClick={() => toggleFavourite(item.book_isbn13)}>
                                      <Heart className={`h-3.5 w-3.5 ${favourites.includes(item.book_isbn13) ? 'fill-current' : ''}`} />
                                    </Button>
                                  )}
                                  <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive cursor-pointer" onClick={() => removeReadingItem(item.id)}>
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </TabsContent>
                  ))}
                  {isOwnProfile && (
                    <TabsContent value="favourites">
                      {readingList.filter((i) => favourites.includes(i.book_isbn13)).length === 0 ? (
                        <p className="text-center text-muted-foreground py-4">No favourites yet.</p>
                      ) : (
                        <div className="space-y-2">
                          {readingList.filter((i) => favourites.includes(i.book_isbn13)).map((item) => (
                            <div key={item.book_isbn13} className="flex items-center gap-3 p-2 border rounded">
                              <Link to={`/book/${item.book_isbn13}`}>
                                <img src={item.book?.thumbnail || '/placeholder.svg'} alt={item.book?.title} className="w-8 h-12 object-cover rounded" onError={(e) => { (e.target as HTMLImageElement).src = '/placeholder.svg'; }} />
                              </Link>
                              <div className="flex-1 min-w-0">
                                <Link to={`/book/${item.book_isbn13}`} className="text-sm font-medium hover:underline line-clamp-1">{item.book?.title}</Link>
                                <p className="text-xs text-muted-foreground">{item.book?.authors}</p>
                              </div>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive cursor-pointer" onClick={() => toggleFavourite(item.book_isbn13)}>
                                <Heart className="h-3.5 w-3.5 fill-current" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </TabsContent>
                  )}
                </Tabs>
              )}
            </CardContent>
          </Card>
        )}

        {/* PREFERENCES */}
        {activeSection === 'preferences' && isOwnProfile && (
          <Card>
            <CardContent className="pt-6 space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Preferences</h3>
                {hasPreferenceChanges && <span className="text-xs text-destructive">Unsaved changes</span>}
              </div>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div><p className="text-sm font-medium">Public book lists</p><p className="text-xs text-muted-foreground">Allow others to view your books</p></div>
                  <Switch checked={preferences.is_books_public} onCheckedChange={(v) => setPreferences((p) => ({ ...p, is_books_public: v }))} />
                </div>
                <div className="flex items-center justify-between">
                  <div><p className="text-sm font-medium">Accept friend requests</p><p className="text-xs text-muted-foreground">Allow others to send friend requests</p></div>
                  <Switch checked={preferences.accept_friend_requests} onCheckedChange={(v) => setPreferences((p) => ({ ...p, accept_friend_requests: v }))} />
                </div>
                <div className="flex items-center justify-between">
                  <div><p className="text-sm font-medium">Accept book suggestions</p><p className="text-xs text-muted-foreground">Allow friends to suggest books</p></div>
                  <Switch checked={preferences.accept_suggestions} onCheckedChange={(v) => setPreferences((p) => ({ ...p, accept_suggestions: v }))} />
                </div>
                <div className="flex items-center justify-between">
                  <div><p className="text-sm font-medium">Notifications</p><p className="text-xs text-muted-foreground">Receive notifications</p></div>
                  <Switch checked={preferences.accept_notifications} onCheckedChange={(v) => setPreferences((p) => ({ ...p, accept_notifications: v }))} />
                </div>
                <Button size="sm" onClick={handleSavePreferences} disabled={!hasPreferenceChanges} className="cursor-pointer">Save Preferences</Button>
              </div>

              <div className="border-t pt-4">
                <h4 className="font-semibold text-sm mb-1">Preferred Genres</h4>
                <p className="text-xs text-muted-foreground mb-2">{userGenres.length} selected • {allGenres.length} available</p>
                <div className="relative mb-2">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                  <Input placeholder="Search genres..." className="pl-8 h-8 text-xs" value={genreSearch} onChange={(e) => setGenreSearch(e.target.value)} />
                </div>
                <div className="flex flex-wrap gap-1.5 max-h-40 overflow-auto">
                  {filteredAllGenres.map((g) => (
                    <GenreTag key={g} genre={g} active={userGenres.includes(g)} size="sm" onClick={() => toggleGenrePref(g)} />
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ACCOUNT */}
        {activeSection === 'account' && isOwnProfile && (
          <Card>
            <CardContent className="pt-6 space-y-6">
              <h3 className="font-semibold">Account Settings</h3>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="flex items-center gap-1"><Mail className="h-3.5 w-3.5" /> Change Email</Label>
                  <div className="flex gap-2">
                    <Input type="email" placeholder="New email address" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
                    <Button size="sm" onClick={handleEmailChange} disabled={!newEmail.trim()} className="cursor-pointer">Update</Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-1"><Lock className="h-3.5 w-3.5" /> Change Password</Label>
                  <PasswordInput placeholder="Current password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
                  <PasswordInput placeholder="New password (min 6 chars)" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
                  <PasswordInput placeholder="Confirm new password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
                  <div className="flex items-center justify-between">
                    <Link to="/forgot-password" className="text-xs text-primary hover:underline">Forgot password?</Link>
                    <Button
                      size="sm"
                      onClick={handlePasswordChange}
                      disabled={!currentPassword || !newPassword || !confirmPassword || newPassword.length < 6}
                      className="cursor-pointer"
                    >
                      Update
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Confirm finish dialog */}
      <AlertDialog open={!!confirmFinish} onOpenChange={(open) => { if (!open) setConfirmFinish(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark as Finished?</AlertDialogTitle>
            <AlertDialogDescription>Mark "{confirmFinish?.book?.title}" as finished?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Reading</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmFinish}>Mark as Finished</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirm remove friend dialog */}
      <AlertDialog open={!!confirmRemoveFriend} onOpenChange={(open) => { if (!open) setConfirmRemoveFriend(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Friend?</AlertDialogTitle>
            <AlertDialogDescription>Remove {confirmRemoveFriend?.friend?.display_name || 'this user'} from your friends?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmRemoveFriend && removeFriend(confirmRemoveFriend)}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
