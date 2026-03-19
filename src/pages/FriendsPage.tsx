import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Search, UserPlus, UserCheck, Clock, Users, UserMinus, X, Undo2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Link } from 'react-router-dom';

interface FriendProfile {
  user_id: string;
  display_name: string | null;
  first_name?: string | null;
  last_name?: string | null;
  avatar_url: string | null;
  accept_friend_requests?: boolean;
  accept_notifications?: boolean;
}

interface FriendshipWithProfile {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: string;
  friend?: FriendProfile;
}

export default function FriendsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<FriendProfile[]>([]);
  const [friends, setFriends] = useState<FriendshipWithProfile[]>([]);
  const [pendingReceived, setPendingReceived] = useState<FriendshipWithProfile[]>([]);
  const [pendingSent, setPendingSent] = useState<FriendshipWithProfile[]>([]);
  const [allFriendships, setAllFriendships] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmAction, setConfirmAction] = useState<{ type: 'reject' | 'remove'; friendship: FriendshipWithProfile } | null>(null);

  const loadFriendships = async () => {
    if (!user) return;
    const { data: friendships } = await supabase
      .from('friendships')
      .select('*')
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);

    if (!friendships) { setLoading(false); return; }
    setAllFriendships(friendships);

    const friendIds = friendships.map((f) => (f.requester_id === user.id ? f.addressee_id : f.requester_id));
    const { data: profiles } = await supabase
      .from('profiles')
      .select('user_id, display_name, first_name, last_name, avatar_url, accept_friend_requests, accept_notifications')
      .in('user_id', friendIds.length > 0 ? friendIds : ['none']);

    const profileMap = new Map((profiles || []).map((p) => [p.user_id, p]));
    const withProfiles = friendships.map((f) => ({
      ...f,
      friend: profileMap.get(f.requester_id === user.id ? f.addressee_id : f.requester_id),
    }));

    setFriends(withProfiles.filter((f) => f.status === 'accepted'));
    setPendingReceived(withProfiles.filter((f) => f.status === 'pending' && f.addressee_id === user.id));
    setPendingSent(withProfiles.filter((f) => f.status === 'pending' && f.requester_id === user.id));
    setLoading(false);
  };

  useEffect(() => { loadFriendships(); }, [user]);

  const getFriendshipStatus = (targetUserId: string): string | null => {
    const friendship = allFriendships.find((f) => f.requester_id === targetUserId || f.addressee_id === targetUserId);
    if (!friendship) return null;
    return friendship.status;
  };

  const handleSearch = async () => {
    if (!searchQuery.trim() || !user) return;
    const { data } = await supabase
      .from('profiles')
      .select('user_id, display_name, first_name, last_name, avatar_url, accept_friend_requests, accept_notifications')
      .ilike('display_name', `%${searchQuery}%`)
      .neq('user_id', user.id)
      .limit(10);
    setSearchResults(data || []);
  };

  const sendRequest = async (addresseeId: string) => {
    if (!user) return;
    const target = searchResults.find((p) => p.user_id === addresseeId);
    if (target?.accept_friend_requests === false) {
      toast({ title: 'This user is not accepting friend requests.' });
      return;
    }

    await supabase.from('friendships').insert({ requester_id: user.id, addressee_id: addresseeId });
    if (target?.accept_notifications) {
      await supabase.from('notifications').insert({
        user_id: addresseeId,
        type: 'friend_request',
        title: 'New Friend Request',
        message: 'You have a new friend request.',
        related_user_id: user.id,
      });
    }
    toast({ title: 'Friend request sent!' });
    loadFriendships();
  };

  const cancelRequest = async (friendship: FriendshipWithProfile) => {
    if (!user) return;
    // Delete the notification sent to the addressee
    await supabase.from('notifications').delete()
      .eq('user_id', friendship.addressee_id)
      .eq('type', 'friend_request')
      .eq('related_user_id', user.id);
    await supabase.from('friendships').delete().eq('id', friendship.id);
    toast({ title: 'Friend request cancelled' });
    loadFriendships();
  };

  const acceptRequest = async (friendship: FriendshipWithProfile) => {
    if (!user) return;
    await supabase.from('friendships').update({ status: 'accepted' }).eq('id', friendship.id);
    await supabase.from('notifications').insert({
      user_id: friendship.requester_id,
      type: 'friend_accepted',
      title: 'Friend Request Accepted',
      message: 'Your friend request has been accepted!',
      related_user_id: user.id,
    });
    toast({ title: 'Friend request accepted!' });
    loadFriendships();
  };

  const executeReject = async (friendship: FriendshipWithProfile) => {
    await supabase.from('friendships').delete().eq('id', friendship.id);
    toast({ title: 'Friend request rejected' });
    loadFriendships();
  };

  const executeRemove = async (friendship: FriendshipWithProfile) => {
    await supabase.from('friendships').delete().eq('id', friendship.id);
    toast({ title: 'Friend removed' });
    loadFriendships();
  };

  const renderSearchAction = (profile: FriendProfile) => {
    const status = getFriendshipStatus(profile.user_id);
    if (status === 'accepted') {
      return <Button size="sm" variant="ghost" disabled><UserCheck className="h-3.5 w-3.5 mr-1 text-primary" /> Friends</Button>;
    }
    if (status === 'pending') {
      return <Button size="sm" variant="ghost" disabled><Clock className="h-3.5 w-3.5 mr-1" /> Pending</Button>;
    }
    if (profile.accept_friend_requests === false) {
      return <Button size="sm" variant="ghost" disabled>Not accepting</Button>;
    }
    return (
      <Button size="sm" variant="outline" onClick={() => sendRequest(profile.user_id)}>
        <UserPlus className="h-3.5 w-3.5 mr-1" /> Add
      </Button>
    );
  };

  const renderProfile = (profile: FriendProfile | undefined, action?: React.ReactNode) => (
    <div className="flex items-center gap-3 p-3 border rounded-lg">
      <Link to={`/profile/${profile?.user_id}`}>
        <Avatar className="h-10 w-10 cursor-pointer">
          <AvatarImage src={profile?.avatar_url || undefined} />
          <AvatarFallback>{(profile?.display_name || 'U')[0].toUpperCase()}</AvatarFallback>
        </Avatar>
      </Link>
      <div className="flex-1">
        <Link to={`/profile/${profile?.user_id}`} className="font-medium text-sm hover:underline">
          {profile?.display_name || `${profile?.first_name || ''} ${profile?.last_name || ''}`.trim() || 'Unknown'}
        </Link>
      </div>
      {action}
    </div>
  );

  if (loading) return <div className="flex items-center justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Friends</h1>

      <Card>
        <CardHeader><CardTitle className="text-base">Find Friends</CardTitle></CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search by name..." className="pl-10" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSearch()} />
            </div>
            <Button onClick={handleSearch}>Search</Button>
          </div>
          {searchResults.length > 0 && (
            <div className="mt-4 space-y-2">
              {searchResults.map((p) => renderProfile(p, renderSearchAction(p)))}
            </div>
          )}
        </CardContent>
      </Card>

      <Tabs defaultValue="friends">
        <TabsList>
          <TabsTrigger value="friends"><Users className="h-3.5 w-3.5 mr-1" /> Friends ({friends.length})</TabsTrigger>
          <TabsTrigger value="pending"><Clock className="h-3.5 w-3.5 mr-1" /> Received ({pendingReceived.length})</TabsTrigger>
          <TabsTrigger value="sent"><Undo2 className="h-3.5 w-3.5 mr-1" /> Sent ({pendingSent.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="friends">
          <div className="space-y-2">
            {friends.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No friends yet. Search for people above!</p>
            ) : (
              friends.map((f) =>
                renderProfile(f.friend,
                  <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-destructive cursor-pointer" onClick={() => setConfirmAction({ type: 'remove', friendship: f })} title="Remove friend">
                    <UserMinus className="h-3.5 w-3.5" />
                  </Button>
                )
              )
            )}
          </div>
        </TabsContent>
        <TabsContent value="pending">
          <div className="space-y-2">
            {pendingReceived.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No pending requests.</p>
            ) : (
              pendingReceived.map((f) =>
                renderProfile(f.friend,
                  <div className="flex gap-1">
                    <Button size="sm" onClick={() => acceptRequest(f)}>Accept</Button>
                    <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-destructive cursor-pointer" onClick={() => setConfirmAction({ type: 'reject', friendship: f })} title="Reject">
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )
              )
            )}
          </div>
        </TabsContent>
        <TabsContent value="sent">
          <div className="space-y-2">
            {pendingSent.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No sent requests.</p>
            ) : (
              pendingSent.map((f) =>
                renderProfile(f.friend,
                  <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-destructive cursor-pointer" onClick={() => cancelRequest(f)} title="Cancel request">
                    <Undo2 className="h-3.5 w-3.5 mr-1" /> Cancel
                  </Button>
                )
              )
            )}
          </div>
        </TabsContent>
      </Tabs>

      <AlertDialog open={!!confirmAction} onOpenChange={(open) => { if (!open) setConfirmAction(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction?.type === 'reject' ? 'Reject Friend Request?' : 'Remove Friend?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction?.type === 'reject'
                ? `Are you sure you want to reject the friend request from ${confirmAction?.friendship.friend?.display_name || 'this user'}?`
                : `Are you sure you want to remove ${confirmAction?.friendship.friend?.display_name || 'this user'} from your friends?`
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              if (confirmAction?.type === 'reject') executeReject(confirmAction.friendship);
              else if (confirmAction?.type === 'remove') executeRemove(confirmAction!.friendship);
              setConfirmAction(null);
            }}>
              {confirmAction?.type === 'reject' ? 'Reject' : 'Remove'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
