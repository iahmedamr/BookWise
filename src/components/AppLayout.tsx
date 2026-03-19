import { useState, useEffect } from "react";
import { useLocation, Outlet, Link, useNavigate } from "react-router-dom";
import NotificationBell from "@/components/NotificationBell";
import ChatbotWidget from "@/components/ChatbotWidget";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  Home,
  Search,
  Tags,
  BookOpen,
  ChevronDown,
  User,
  LogOut,
  Globe,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const mainNavItems = [
  { icon: Home, url: "/", label: "Home" },
  { icon: Search, url: "/search", label: "Search" },
  { icon: Tags, url: "/genres", label: "Genres" },
  { icon: Users, url: "/friends", label: "Friends" },
  { icon: Globe, url: "/community", label: "Community" },
];

export default function AppLayout() {
  const { user, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<{
    display_name: string | null;
    first_name: string | null;
    last_name: string | null;
    avatar_url: string | null;
  } | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("display_name, first_name, last_name, avatar_url")
      .eq("user_id", user.id)
      .single()
      .then(({ data }) => {
        if (data) setProfile(data);
      });
  }, [user]);

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="h-14 border-b bg-card flex items-center justify-between px-4 sticky top-0 z-20">
        <div className="flex items-center gap-2">
          <Link to="/" className="flex items-center gap-2 mr-4">
            <BookOpen className="h-6 w-6 text-primary" />
            <span className="font-bold text-lg font-serif text-foreground">
              BookWise
            </span>
          </Link>
        </div>

        <nav className="hidden md:flex items-center gap-1 absolute left-1/2 -translate-x-1/2">
          {mainNavItems.map((item) => {
            const isActive =
              item.url === "/"
                ? location.pathname === "/"
                : location.pathname.startsWith(item.url);
            const needsAuth =
              item.url === "/search" ||
              item.url === "/community" ||
              item.url === "/friends";
            if (needsAuth && !user) return null;
            return (
              <Link
                key={item.url}
                to={item.url}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted",
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          {user && <NotificationBell />}
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger className="flex items-center gap-2 outline-none cursor-pointer">
                <Avatar className="h-8 w-8">
                  <AvatarImage src={profile?.avatar_url || undefined} />
                  <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                    {(profile?.display_name ||
                      `${profile?.first_name || ""} ${profile?.last_name || ""}`.trim() ||
                      "U")[0].toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="hidden sm:inline text-sm font-medium max-w-28 truncate">
                  {profile?.display_name ||
                    `${profile?.first_name || ""} ${profile?.last_name || ""}`.trim() ||
                    "User"}
                </span>
                <ChevronDown className="h-3 w-3 text-muted-foreground" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  className="cursor-pointer"
                  onClick={() => navigate("/profile")}
                >
                  <User className="h-4 w-4 mr-2" /> Profile
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="cursor-pointer"
                  onClick={handleSignOut}
                >
                  <LogOut className="h-4 w-4 mr-2" /> Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" asChild>
                <Link to="/login">Sign In</Link>
              </Button>
              <Button size="sm" asChild>
                <Link to="/register">Sign Up</Link>
              </Button>
            </div>
          )}
        </div>
      </header>

      <main className="flex-1 p-4 md:p-6 overflow-auto pb-20 md:pb-6">
        <Outlet />
      </main>

      <Footer />

      {/* Mobile bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-20 bg-card border-t flex items-center justify-around h-14 md:hidden">
        {mainNavItems.map((item) => {
          const isActive =
            item.url === "/"
              ? location.pathname === "/"
              : location.pathname.startsWith(item.url);
          const needsAuth =
            item.url === "/search" ||
            item.url === "/community" ||
            item.url === "/friends";
          if (needsAuth && !user) return null;
          return (
            <Link
              key={item.url}
              to={item.url}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 px-2 py-1 transition-colors",
                isActive
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <item.icon className="h-5 w-5" />
              <span className="text-[10px] font-medium">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Chatbot — always visible, above mobile nav */}
      <ChatbotWidget />
    </div>
  );
}

function Footer() {
  return (
    <footer className="border-t bg-card px-4 py-6 text-center text-sm text-muted-foreground mb-14 md:mb-0">
      <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-primary" />
          <span className="font-serif font-bold text-foreground">BookWise</span>
        </div>
        <p>© {new Date().getFullYear()} BookWise. All rights reserved.</p>
        <div className="flex gap-4">
          <Link to="/" className="hover:text-foreground transition-colors">
            Home
          </Link>
          <Link
            to="/genres"
            className="hover:text-foreground transition-colors"
          >
            Genres
          </Link>
        </div>
      </div>
    </footer>
  );
}
