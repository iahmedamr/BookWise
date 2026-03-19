import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Search, UserPlus, UserCheck, Clock, Copy } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Link } from 'react-router-dom';

interface UserProfile {
  user_id: string;
  display_name: string | null;
  first_name?: string | null;
  last_name?: string | null;
  avatar_url: string | null;
  accept_friend_requests?: boolean;
  accept_notifications?: boolean;
}

export default function CommunityPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [allFriendships, setAllFriendships] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, display_name, first_name, last_name, avatar_url, accept_friend_requests, accept_notifications')
        .neq('user_id', user?.id || '')
        .order('created_at', { ascending: false })
        .limit(50);

      setUsers(profiles || []);

      if (user) {
        const { data: friendships } = await supabase
          .from('friendships')
          .select('*')
          .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);
        setAllFriendships(friendships || []);
      }
      setLoading(false);
    };
    load();
  }, [user]);

  const getFriendshipStatus = (targetUserId: string): { status: string | null; isSender: boolean } => {
    const friendship = allFriendships.find(
      (f) => (f.requester_id === targetUserId || f.addressee_id === targetUserId)
    );
    if (!friendship) return { status: null, isSender: false };
    return { status: friendship.status, isSender: friendship.requester_id === user?.id };
  };

  const sendRequest = async (addresseeId: string) => {
    if (!user) return;
    const target = users.find((u) => u.user_id === addresseeId);
    if (target?.accept_friend_requests === false) {
      toast({ title: 'This user is not accepting friend requests.' });
      return;
    }

    const { data } = await supabase.from('friendships').insert({ requester_id: user.id, addressee_id: addresseeId }).select().single();
    if (data) {
      if (target?.accept_notifications) {
        await supabase.from('notifications').insert({
          user_id: addresseeId,
          type: 'friend_request',
          title: 'New Friend Request',
          message: 'You have a new friend request.',
          related_user_id: user.id,
        });
      }
      setAllFriendships((prev) => [...prev, data]);
      toast({ title: 'Friend request sent!' });
    }
  };

  const copyId = (id: string) => {
    navigator.clipboard.writeText(id);
    toast({ title: 'User ID copied!' });
  };

  const filteredUsers = searchQuery.trim()
    ? users.filter((u) => u.display_name?.toLowerCase().includes(searchQuery.toLowerCase()))
    : users;

  if (loading) return <div className="flex items-center justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Community</h1>
        <p className="text-muted-foreground mt-1">Discover and connect with other readers</p>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search users..." className="pl-10" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filteredUsers.map((u) => {
          const { status } = getFriendshipStatus(u.user_id);
          return (
            <Card key={u.user_id}>
              <CardContent className="p-4 flex items-center gap-3">
                <Link to={`/profile/${u.user_id}`}>
                  <Avatar className="h-10 w-10 cursor-pointer">
                    <AvatarImage src={u.avatar_url || undefined} />
                    <AvatarFallback className="bg-primary text-primary-foreground text-xs">{(u.display_name || 'U')[0].toUpperCase()}</AvatarFallback>
                  </Avatar>
                </Link>
                <div className="flex-1 min-w-0">
                  <Link to={`/profile/${u.user_id}`} className="font-medium text-sm hover:underline line-clamp-1">{u.display_name || `${u.first_name || ''} ${u.last_name || ''}`.trim() || 'Unknown'}</Link>
                  <button className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground" onClick={() => copyId(u.user_id)}>
                    <Copy className="h-3 w-3" /> Copy ID
                  </button>
                </div>
                {status === 'accepted' ? (
                  <Button size="sm" variant="ghost" disabled><UserCheck className="h-3.5 w-3.5 mr-1 text-primary" /> Friends</Button>
                ) : status === 'pending' ? (
                  <Button size="sm" variant="ghost" disabled><Clock className="h-3.5 w-3.5 mr-1" /> Pending</Button>
                ) : u.accept_friend_requests === false ? (
                  <Button size="sm" variant="ghost" disabled>Not accepting</Button>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => sendRequest(u.user_id)}>
                    <UserPlus className="h-3.5 w-3.5 mr-1" /> Add
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
        {filteredUsers.length === 0 && (
          <p className="text-center text-muted-foreground py-8 col-span-full">No users found.</p>
        )}
      </div>
    </div>
  );
}
