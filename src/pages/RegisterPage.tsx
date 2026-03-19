import { useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { BookOpen, Upload } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { PasswordInput } from '@/components/PasswordInput';
import RequiredLabel from '@/components/RequiredLabel';
import AvatarEditor from 'react-avatar-editor';

export default function RegisterPage() {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [gender, setGender] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarScale, setAvatarScale] = useState(1.2);
  const [loading, setLoading] = useState(false);
  const editorRef = useRef<AvatarEditor>(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  const getDefaultAvatar = (g: string) => {
    if (g === 'male') return 'https://api.dicebear.com/9.x/avataaars/svg?seed=male&accessories=blank&top=shortHairShortFlat';
    if (g === 'female') return 'https://api.dicebear.com/9.x/avataaars/svg?seed=female&accessories=blank&top=longHairStraight';
    return 'https://api.dicebear.com/9.x/avataaars/svg?seed=neutral&accessories=blank';
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setAvatarFile(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const displayName = `${firstName} ${lastName}`.trim();
      let avatarUrl = getDefaultAvatar(gender);

      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            display_name: displayName,
            first_name: firstName,
            last_name: lastName,
            date_of_birth: dateOfBirth,
            gender,
            avatar_url: avatarUrl,
          },
          emailRedirectTo: window.location.origin,
        },
      });
      if (authError) throw authError;

      if (avatarFile && authData.user && editorRef.current) {
        const canvas = editorRef.current.getImageScaledToCanvas();
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
        if (blob) {
          const filePath = `${authData.user.id}/avatar.jpg`;
          const { error: uploadError } = await supabase.storage.from('avatars').upload(filePath, blob, { upsert: true, contentType: 'image/jpeg' });
          if (!uploadError) {
            const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(filePath);
            avatarUrl = urlData.publicUrl;
            await supabase.from('profiles').update({ avatar_url: avatarUrl }).eq('user_id', authData.user.id);
          }
        }
      }

      toast({ title: 'Account created!', description: 'Please check your email to verify your account.' });
      navigate('/login');
    } catch (error: any) {
      toast({ title: 'Registration failed', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary">
            <BookOpen className="h-6 w-6 text-primary-foreground" />
          </div>
          <CardTitle className="text-2xl">Create Account</CardTitle>
          <CardDescription>Join BookWise and discover your next read</CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {/* Avatar upload with crop/zoom */}
            <div className="flex flex-col items-center gap-2">
              {avatarFile ? (
                <div className="flex flex-col items-center gap-2">
                  <AvatarEditor
                    ref={editorRef}
                    image={avatarFile}
                    width={120}
                    height={120}
                    border={20}
                    borderRadius={60}
                    scale={avatarScale}
                    className="rounded-lg"
                  />
                  <div className="w-48 flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Zoom</span>
                    <Slider value={[avatarScale]} onValueChange={([v]) => setAvatarScale(v)} min={1} max={3} step={0.1} className="flex-1" />
                  </div>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setAvatarFile(null)} className="text-xs">Remove</Button>
                </div>
              ) : (
                <>
                  <Avatar className="h-20 w-20">
                    <AvatarImage src={getDefaultAvatar(gender)} />
                    <AvatarFallback>{firstName?.[0]?.toUpperCase() || 'U'}</AvatarFallback>
                  </Avatar>
                  <label htmlFor="avatar" className="cursor-pointer text-sm text-primary hover:underline flex items-center gap-1">
                    <Upload className="h-3.5 w-3.5" /> Upload Photo (optional)
                  </label>
                  <Input id="avatar" type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
                </>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <RequiredLabel htmlFor="firstName">First Name</RequiredLabel>
                <Input id="firstName" placeholder="John" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <RequiredLabel htmlFor="lastName">Last Name</RequiredLabel>
                <Input id="lastName" placeholder="Doe" value={lastName} onChange={(e) => setLastName(e.target.value)} required />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <RequiredLabel htmlFor="dob">Date of Birth</RequiredLabel>
                <Input id="dob" type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <RequiredLabel htmlFor="gender">Gender</RequiredLabel>
                <Select value={gender} onValueChange={setGender} required>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <RequiredLabel htmlFor="email">Email</RequiredLabel>
              <Input id="email" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <RequiredLabel htmlFor="password">Password</RequiredLabel>
              <PasswordInput id="password" placeholder="Min 6 characters" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} autoComplete="new-password" />
            </div>
          </CardContent>
          <CardFooter className="flex-col gap-4">
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Creating account...' : 'Create Account'}
            </Button>
            <p className="text-sm text-muted-foreground">
              Already have an account?{' '}
              <Link to="/login" className="text-primary hover:underline">Sign in</Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
