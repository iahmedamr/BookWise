import { useState, useRef, useEffect } from "react";
import {
  MessageCircle,
  X,
  Send,
  Bot,
  User,
  BookOpen,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

interface BookCard {
  isbn13: string;
  title: string;
  authors: string;
  categories: string;
  thumbnail: string;
  average_rating: number;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  book_cards?: BookCard[];
}

const WELCOME: Message = {
  role: "assistant",
  content:
    "Hi! I'm your BookWise assistant 📚 Tell me what kind of book you're in the mood for, ask me about a specific title, or describe a vibe — I'll find the perfect read for you!",
};

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((s) => (
        <span
          key={s}
          className={cn(
            "text-xs",
            s <= Math.round(rating)
              ? "text-amber-400"
              : "text-muted-foreground/30",
          )}
        >
          ★
        </span>
      ))}
      <span className="text-xs text-muted-foreground ml-1">
        {rating.toFixed(1)}
      </span>
    </div>
  );
}

function InlineBookCard({ book }: { book: BookCard }) {
  return (
    <Link to={`/book/${book.isbn13}`} className="block">
      <div className="flex gap-2.5 p-2 rounded-lg border bg-card hover:bg-muted/50 transition-colors cursor-pointer mt-2">
        <div className="w-10 h-14 shrink-0 rounded overflow-hidden bg-muted">
          {book.thumbnail ? (
            <img
              src={book.thumbnail}
              alt={book.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <BookOpen className="h-4 w-4 text-muted-foreground" />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold line-clamp-2 leading-tight">
            {book.title}
          </p>
          <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
            {book.authors}
          </p>
          <StarRating rating={book.average_rating} />
          {book.categories && (
            <span className="text-[10px] text-primary bg-primary/10 rounded px-1.5 py-0.5 mt-1 inline-block line-clamp-1">
              {book.categories.split(";")[0].trim()}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";
  const cleanContent = message.content
    .split("\n")
    .filter((line) => !line.includes("BOOK:"))
    .join("\n")
    .trim();

  return (
    <div className={cn("flex gap-2 items-start", isUser && "flex-row-reverse")}>
      <div
        className={cn(
          "w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5",
          isUser ? "bg-primary text-primary-foreground" : "bg-muted border",
        )}
      >
        {isUser ? <User className="h-3 w-3" /> : <Bot className="h-3 w-3" />}
      </div>
      <div
        className={cn("flex flex-col gap-1 max-w-[82%]", isUser && "items-end")}
      >
        <div
          className={cn(
            "rounded-2xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap",
            isUser
              ? "bg-primary text-primary-foreground rounded-tr-sm"
              : "bg-muted rounded-tl-sm",
          )}
        >
          {cleanContent}
        </div>
        {message.book_cards && message.book_cards.length > 0 && (
          <div className="w-full space-y-1">
            {message.book_cards.map((book) => (
              <InlineBookCard key={book.isbn13} book={book} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ChatbotWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([WELCOME]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100);
  }, [open]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: Message = { role: "user", content: text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    try {
      const history = newMessages
        .slice(1)
        .map((m) => ({ role: m.role, content: m.content }));
      const res = await fetch(`${API_URL}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setMessages([
        ...newMessages,
        {
          role: "assistant",
          content: data.reply,
          book_cards: data.book_cards || [],
        },
      ]);
    } catch {
      setMessages([
        ...newMessages,
        {
          role: "assistant",
          content:
            "Sorry, I'm having trouble connecting right now. Make sure the backend server is running.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <>
      {/* Chat panel */}
      <div
        className={cn(
          "fixed bottom-20 right-4 z-50 w-80 sm:w-96 flex flex-col rounded-2xl border bg-background shadow-2xl transition-all duration-300 origin-bottom-right md:bottom-6",
          open
            ? "scale-100 opacity-100 pointer-events-auto"
            : "scale-90 opacity-0 pointer-events-none",
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-primary text-primary-foreground rounded-t-2xl">
          <div className="flex items-center gap-2">
            <Bot className="h-4 w-4" />
            <span className="font-semibold text-sm">BookWise Assistant</span>
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          </div>
          <button
            onClick={() => setOpen(false)}
            className="hover:opacity-70 transition-opacity"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-3 space-y-3 max-h-[420px] min-h-[200px]">
          {messages.map((msg, i) => (
            <MessageBubble key={i} message={msg} />
          ))}
          {loading && (
            <div className="flex gap-2 items-center">
              <div className="w-6 h-6 rounded-full bg-muted border flex items-center justify-center">
                <Bot className="h-3 w-3" />
              </div>
              <div className="bg-muted rounded-2xl rounded-tl-sm px-3 py-2">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="p-3 border-t flex gap-2">
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask me for a book recommendation..."
            className="flex-1 text-sm bg-muted rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-primary/50 placeholder:text-muted-foreground"
          />
          <Button
            size="icon"
            className="rounded-xl shrink-0"
            onClick={sendMessage}
            disabled={!input.trim() || loading}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Floating toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-20 right-4 z-40 w-12 h-12 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center transition-all duration-300 hover:scale-110 md:bottom-6"
        aria-label="Toggle book assistant"
      >
        {open ? (
          <X className="h-5 w-5" />
        ) : (
          <MessageCircle className="h-5 w-5" />
        )}
      </button>
    </>
  );
}
