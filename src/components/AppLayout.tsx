import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation, Outlet, Link, useNavigate } from "react-router-dom";
import NotificationBell from "@/components/NotificationBell";
import ChatbotWidget from "@/components/ChatbotWidget";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { loadBooks } from "@/services/bookService";
import { Book } from "@/types/book";
import { useTheme } from "next-themes";
import {
  Home,
  Tags,
  BookOpen,
  ChevronDown,
  User,
  LogOut,
  Globe,
  Users,
  Search,
  X,
  Sun,
  Moon,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const mainNavItems = [
  { icon: Home, url: "/", label: "Home" },
  { icon: Tags, url: "/genres", label: "Genres" },
  { icon: Users, url: "/friends", label: "Friends" },
  { icon: Globe, url: "/community", label: "Community" },
];

export default function AppLayout() {
  const { user, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { resolvedTheme, setTheme } = useTheme();
  const [profile, setProfile] = useState<{
    display_name: string | null;
    first_name: string | null;
    last_name: string | null;
    avatar_url: string | null;
  } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [bookSuggestions, setBookSuggestions] = useState<Book[]>([]);
  const [recentQueries, setRecentQueries] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

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

  // Fetch recent queries from Supabase when input is focused (empty state)
  const fetchRecentQueries = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("search_history")
      .select("query")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(10);
    if (!data) return;
    // Deduplicate, keep latest 3 unique queries
    const seen = new Set<string>();
    const unique: string[] = [];
    for (const row of data) {
      const q = row.query.trim();
      if (q && !seen.has(q.toLowerCase())) {
        seen.add(q.toLowerCase());
        unique.push(q);
        if (unique.length === 3) break;
      }
    }
    setRecentQueries(unique);
  }, [user]);

  // Debounced book suggestions as user types
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = searchQuery.trim();
    if (!q) {
      setBookSuggestions([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      const books = await loadBooks();
      const lower = q.toLowerCase();
      const matches = books
        .filter(
          (b) =>
            b.title.toLowerCase().includes(lower) ||
            b.authors.toLowerCase().includes(lower),
        )
        .sort((a, b) => b.ratings_count - a.ratings_count)
        .slice(0, 5);
      setBookSuggestions(matches);
    }, 200);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchQuery]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
  };

  const saveAndNavigate = async (q: string) => {
    if (!q.trim()) return;
    setDropdownOpen(false);
    setSearchQuery(q);
    inputRef.current?.blur();
    if (user) {
      await supabase
        .from("search_history")
        .insert({ user_id: user.id, query: q.trim() });
      // Refresh recent after save
      fetchRecentQueries();
    }
    navigate(`/browse?q=${encodeURIComponent(q.trim())}`);
  };

  const handleSearch = async (e?: React.FormEvent) => {
    e?.preventDefault();
    await saveAndNavigate(searchQuery);
  };

  const showDropdown =
    dropdownOpen && (bookSuggestions.length > 0 || recentQueries.length > 0);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="h-14 border-b bg-card flex items-center justify-between px-4 sticky top-0 z-20 gap-3">
        <Link to="/" className="flex items-center gap-2 shrink-0">
          <BookOpen className="h-6 w-6 text-primary" />
          <span className="font-bold text-lg font-serif text-foreground hidden sm:inline">
            BookWise
          </span>
        </Link>

        <nav className="hidden md:flex items-center gap-1">
          {mainNavItems.map((item) => {
            const isActive =
              item.url === "/"
                ? location.pathname === "/"
                : location.pathname.startsWith(item.url);
            const needsAuth =
              item.url === "/community" || item.url === "/friends";
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

        {/* Search bar with dropdown */}
        <div className="flex-1 max-w-sm relative">
          <form onSubmit={handleSearch}>
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none z-10" />
            <Input
              ref={inputRef}
              placeholder="Search books, authors..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-8 h-9 text-sm"
              onFocus={() => {
                setDropdownOpen(true);
                if (!searchQuery.trim()) fetchRecentQueries();
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setDropdownOpen(false);
                  inputRef.current?.blur();
                }
              }}
              autoComplete="off"
            />
            {searchQuery && (
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground z-10"
                onMouseDown={(e) => {
                  e.preventDefault();
                  setSearchQuery("");
                  setBookSuggestions([]);
                }}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </form>

          {/* Dropdown */}
          {showDropdown && (
            <div
              ref={dropdownRef}
              className="absolute top-full left-0 right-0 mt-1 bg-popover border rounded-lg shadow-lg z-50 overflow-hidden"
            >
              {/* Recent queries — shown when no text typed */}
              {!searchQuery.trim() && recentQueries.length > 0 && (
                <div>
                  <p className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Recent searches
                  </p>
                  {recentQueries.map((q) => (
                    <button
                      key={q}
                      type="button"
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-muted/60 transition-colors"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        saveAndNavigate(q);
                      }}
                    >
                      <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="truncate">{q}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Book suggestions — shown while typing */}
              {searchQuery.trim() && bookSuggestions.length > 0 && (
                <div>
                  <p className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Books
                  </p>
                  {bookSuggestions.map((book) => (
                    <button
                      key={book.isbn13}
                      type="button"
                      className="w-full flex items-center gap-3 px-3 py-2 hover:bg-muted/60 transition-colors text-left"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setDropdownOpen(false);
                        inputRef.current?.blur();
                        navigate(`/book/${book.isbn13}`);
                      }}
                    >
                      <img
                        src={book.thumbnail || "/placeholder.svg"}
                        alt={book.title}
                        className="w-7 h-10 object-cover rounded shrink-0"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src =
                            "/placeholder.svg";
                        }}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium line-clamp-1">
                          {book.title}
                        </p>
                        <p className="text-xs text-muted-foreground line-clamp-1">
                          {book.authors}
                        </p>
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0">
                        ★ {book.average_rating.toFixed(1)}
                      </span>
                    </button>
                  ))}
                  {/* "Search all" footer */}
                  <button
                    type="button"
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-primary hover:bg-primary/5 transition-colors border-t"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      saveAndNavigate(searchQuery);
                    }}
                  >
                    <Search className="h-3.5 w-3.5" />
                    Search all results for "
                    <span className="font-medium">{searchQuery}</span>"
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {user && <NotificationBell />}
          <Button
            variant="ghost"
            size="icon"
            onClick={() =>
              setTheme(resolvedTheme === "dark" ? "light" : "dark")
            }
            title="Toggle theme"
          >
            {resolvedTheme === "dark" ? (
              <Sun className="h-5 w-5" />
            ) : (
              <Moon className="h-5 w-5" />
            )}
          </Button>
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

      <nav className="fixed bottom-0 left-0 right-0 z-20 bg-card border-t flex items-center justify-around h-14 md:hidden">
        {mainNavItems.map((item) => {
          const isActive =
            item.url === "/"
              ? location.pathname === "/"
              : location.pathname.startsWith(item.url);
          const needsAuth =
            item.url === "/community" || item.url === "/friends";
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
