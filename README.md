# 📚 BookRec — Hybrid Book Recommendation System

A full-stack book recommendation web application featuring personalized recommendations, social features, and a rich browsing experience. Built with React + TypeScript on the frontend and Supabase (PostgreSQL, Auth, Storage) on the backend.

---

## 📑 Table of Contents

- [Overview](#overview)
- [Pages & Features](#pages--features)
- [Technology Stack](#technology-stack)
- [Architecture Tracks](#architecture-tracks)
- [AI Integration Options](#ai-integration-options)
- [Database Schema](#database-schema)
- [Local Setup & Installation](#local-setup--installation)
- [Environment Variables](#environment-variables)
- [Project Structure](#project-structure)

---

## Overview

BookRec is a hybrid book recommender system that combines collaborative filtering and content-based filtering concepts. It uses a dataset of ~6,800 books (CSV) for browsing, searching, and generating recommendations. Users can track reading progress, rate books, manage friends, and receive personalized suggestions.

---

## Pages & Features

### Authentication

| Page            | Route              | Access | Description                        |
| --------------- | ------------------ | ------ | ---------------------------------- |
| Login           | `/login`           | Public | Email/password sign-in             |
| Register        | `/register`        | Public | Sign up with name, email, password |
| Forgot Password | `/forgot-password` | Public | Request password reset email       |
| Reset Password  | `/reset-password`  | Public | Set new password via email link    |

### Core Pages

| Page            | Route              | Access             | Description                                                                 |
| --------------- | ------------------ | ------------------ | --------------------------------------------------------------------------- |
| Dashboard       | `/`                | Guest + Auth       | Personalized recommendations, trending & popular books                      |
| Onboarding      | `/onboarding`      | Auth (first login) | Multi-step: select genres, rate popular books (cold-start handling)         |
| Search          | `/search`          | Auth               | Full-text search with filters (genre, rating, year, pages) and sort options |
| Book Detail     | `/book/:isbn`      | Auth               | Full book info, rating, reading list actions, similar books                 |
| Browse          | `/browse`          | Guest + Auth       | Browse book sections (trending, popular, recommended)                       |
| Genres          | `/genres`          | Guest + Auth       | Browse books organized by genre/category                                    |
| My Books        | `/my-books`        | Auth               | Reading list: Wishlist, Currently Reading, Finished with progress tracking  |
| Profile         | `/profile`         | Auth               | View/edit profile, avatar, bio, reading stats                               |
| Profile (other) | `/profile/:userId` | Auth               | View another user's public profile                                          |
| Friends         | `/friends`         | Auth               | Search users, send/accept friend requests, view friends                     |
| Community       | `/community`       | Auth               | Social feed, book suggestions between friends                               |

### Key Features

- **Cold Start Handling**: Onboarding flow collects genre preferences and initial book ratings
- **Reading Progress Tracking**: Track books as Wishlist → Currently Reading → Finished with page progress
- **Social Features**: Friend requests, book suggestions, activity feed
- **In-App Notifications**: Bell icon with friend requests, suggestions, milestones
- **Smart Search**: Autocomplete, filters (genre, rating range, year range, page count), sorting
- **Responsive Design**: Full mobile and desktop support with sidebar navigation

---

## Technology Stack

| Layer                | Technologies                                                  |
| -------------------- | ------------------------------------------------------------- |
| **Frontend**         | React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui           |
| **State Management** | TanStack React Query, React Context                           |
| **Routing**          | React Router v6                                               |
| **UI Components**    | Radix UI primitives, Lucide icons, Recharts                   |
| **Backend**          | Supabase (PostgreSQL, Auth, Storage, Edge Functions)          |
| **Forms**            | React Hook Form + Zod validation                              |
| **Styling**          | Tailwind CSS with semantic design tokens, CSS variables (HSL) |

---

## Architecture Tracks

### 🎨 Frontend Track

- **Framework**: React 18 + TypeScript + Vite (SWC)
- **Component Library**: shadcn/ui built on Radix UI primitives
- **Styling**: Tailwind CSS with custom design system (semantic tokens in `index.css` and `tailwind.config.ts`)
- **State**: React Query for server state, React Context for auth state
- **Routing**: React Router v6 with protected routes and optional-auth routes
- **Charts**: Recharts for reading statistics visualization
- **Book Data**: CSV dataset (~6,800 books) parsed client-side via `bookService.ts`

### 🔧 Backend Track

- **Platform**: Supabase (self-hosted or cloud)
- **Auth**: Supabase Auth with email/password, email verification, password reset
- **Storage**: Supabase Storage for user avatars
- **Edge Functions**: Deno-based serverless functions (TypeScript/JavaScript runtime)
- **API Client**: Auto-generated Supabase client with typed queries

### 🗄️ Database Track

- **Engine**: PostgreSQL (via Supabase)
- **ORM**: Supabase JS client with auto-generated TypeScript types
- **Migrations**: SQL migration files in `supabase/migrations/`
- **Security**: Row-Level Security (RLS) policies on all user data tables
- **Triggers**: `handle_new_user()` trigger auto-creates profile on signup

### 🤖 AI Track (Recommendation Engine)

Currently uses a **mock recommendation engine** in `bookService.ts` with genre-based filtering and popularity sorting. See [AI Integration Options](#ai-integration-options) below for upgrade paths.

---

## AI Integration Options

The current recommendation logic is intentionally simple (genre match + rating sort) and designed for easy replacement. Three upgrade paths are available:

### Option A: LLM-Powered Recommendations (No External Setup)

Use AI models via an edge function to generate context-aware recommendations.

- **How**: Collect user ratings, reading history, and preferences from the database → send to an LLM with a book catalog subset → receive ranked recommendations
- **Models**: Gemini 2.5 Pro/Flash, GPT-5, GPT-5-mini (available via Lovable AI gateway)
- **Pros**: Intelligent, context-aware, no ML infrastructure needed
- **Cons**: Per-request cost, limited by model context window for large catalogs

### Option B: TypeScript Hybrid Engine (Zero Cost)

Implement traditional ML algorithms in TypeScript edge functions.

- **Content-Based**: TF-IDF on book descriptions/categories + cosine similarity
- **Collaborative Filtering**: User-item rating matrix with nearest-neighbor approach
- **Hybrid Score**: Weighted combination of both signals
- **Pros**: Free, deterministic, runs entirely on edge functions
- **Cons**: Less sophisticated than dedicated ML libraries

### Option C: External Python Backend

Deploy a separate Python API running dedicated ML libraries.

- **Libraries**: `surprise` (SVD for collaborative filtering), `sentence-transformers` (all-MiniLM-L6-v2 for content-based)
- **Hosting**: Railway, Render, AWS, or any Python-capable platform
- **Integration**: Edge function proxies requests to your Python API
- **Pros**: Most sophisticated, uses proven ML models
- **Cons**: Requires separate hosting and deployment outside the main app

### Integration Point

All options replace the same functions in `src/services/bookService.ts`:

- `getRecommendations(genrePrefs)` — personalized recommendations
- `getSimilarBooks(isbn13)` — content-based similar books
- `getTrendingBooks()` — can be enhanced with collaborative signals

---

## Database Schema

### Tables

| Table              | Description                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------------- |
| `profiles`         | User profiles (display name, avatar, bio, privacy settings, onboarding status)              |
| `user_preferences` | Genre preferences per user (selected during onboarding)                                     |
| `reading_list`     | Books in user's library with status (wishlist/currently_reading/finished) and page progress |
| `ratings`          | User ratings (1-5) and optional text reviews per book                                       |
| `search_history`   | Saved search queries per user                                                               |
| `friendships`      | Friend connections with status (pending/accepted/declined)                                  |
| `notifications`    | In-app notifications (friend requests, suggestions, milestones)                             |
| `book_suggestions` | Book recommendations sent between friends                                                   |
| `favourites`       | User's favorited/bookmarked books                                                           |

### Key Relationships

- All tables reference `user_id` (UUID from Supabase Auth)
- Books are referenced by `book_isbn13` (string, from CSV dataset)
- RLS policies ensure users can only access their own data
- `handle_new_user()` trigger auto-creates a profile row on signup

---

## Local Setup & Installation

### Prerequisites

- **Node.js** v18+ (recommend using [nvm](https://github.com/nvm-sh/nvm))
- **npm** or **bun** package manager
- **Supabase account** (for backend features) — [supabase.com](https://supabase.com)
- **Supabase CLI** (optional, for running migrations) — [docs](https://supabase.com/docs/guides/cli)

### Step 1: Clone the Repository

```bash
git clone <YOUR_GIT_URL>
cd <YOUR_PROJECT_NAME>
```

### Step 2: Install Dependencies

```bash
npm install
```

### Step 3: Set Up Supabase Project

1. Create a new project at [supabase.com/dashboard](https://supabase.com/dashboard)
2. Go to **Settings → API** and copy your **Project URL** and **anon/public key**

### Step 4: Configure Environment Variables

Create a `.env` file in the project root:

```env
VITE_SUPABASE_URL="https://your-project-id.supabase.co"
VITE_SUPABASE_PUBLISHABLE_KEY="your-anon-key"
VITE_SUPABASE_PROJECT_ID="your-project-id"
```

### Step 5: Run Database Migrations

Apply all migrations from `supabase/migrations/` to your Supabase project:

**Option A — Using Supabase CLI:**

```bash
npx supabase login
npx supabase link --project-ref your-project-id
npx supabase db push
```

**Option B — Manual:**
Run each `.sql` file in `supabase/migrations/` (in order) via the Supabase SQL Editor in your dashboard.

### Step 6: Start Development Server

```bash
npm run dev
```

The app will be available at `http://localhost:8080`.

### Additional Commands

```bash
npm run build        # Production build
npm run preview      # Preview production build
npm run test         # Run tests
npm run test:watch   # Run tests in watch mode
npm run lint         # Run ESLint
```

---

## Project Structure

```
├── public/
│   ├── data/cleaned_books.csv          # Book dataset (~6,200 books)
│   └── favicon.ico
├── src/
│   ├── App.tsx                 # Root component with routing
│   ├── main.tsx                # Entry point
│   ├── index.css               # Global styles & design tokens
│   ├── components/
│   │   ├── AppLayout.tsx       # Sidebar + header layout
│   │   ├── BookCard.tsx        # Book display card
│   │   ├── BookGrid.tsx        # Grid of book cards
│   │   ├── GenreTag.tsx        # Genre badge component
│   │   ├── RatingStars.tsx     # Star rating display/input
│   │   ├── NotificationBell.tsx # Notification dropdown
│   │   ├── ProtectedRoute.tsx  # Auth route guards
│   │   └── ui/                 # shadcn/ui components
│   ├── contexts/
│   │   └── AuthContext.tsx     # Authentication state & methods
│   ├── hooks/                  # Custom React hooks
│   ├── integrations/
│   │   └── supabase/
│   │       ├── client.ts       # Auto-generated Supabase client
│   │       └── types.ts        # Auto-generated database types
│   ├── pages/                  # Route page components
│   ├── services/
│   │   └── bookService.ts     # Book data loading, search, recommendations
│   ├── types/
│   │   └── book.ts            # Book & filter TypeScript interfaces
│   └── lib/
│       └── utils.ts           # Utility functions (cn, etc.)
├── supabase/
│   ├── config.toml            # Supabase project config
│   └── migrations/            # SQL migration files
├── tailwind.config.ts         # Tailwind CSS configuration
├── vite.config.ts             # Vite build configuration
└── package.json
```

---

## License

This project is for educational and personal use.
