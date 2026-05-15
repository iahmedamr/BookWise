# BookWise - Hybrid Book Recommendation Platform

BookWise is a full-stack book discovery app with authentication, personal reading shelves, social features, ML-powered recommendations, and a grounded book assistant chatbot. The frontend is a React + TypeScript + Vite app. Supabase provides Auth, PostgreSQL, Row Level Security, and avatar storage. A separate Python FastAPI backend serves the hybrid recommendation engine and chatbot.

The book catalog is loaded from `public/data/cleaned_books.csv` and `backend/data/cleaned_books.csv`. The current CSV has 6,215 books with ISBNs, title, authors, categories, thumbnail, description, publication year, rating, page count, and rating count.

## Contents

- [Features and Pages](#features-and-pages)
- [Technology Stack](#technology-stack)
- [Architecture Overview](#architecture-overview)
- [Supabase Backend](#supabase-backend)
- [Database Schema](#database-schema)
- [ML and Chatbot Backend](#ml-and-chatbot-backend)
- [Setup and Run](#setup-and-run)
- [Environment Variables](#environment-variables)
- [Useful Commands](#useful-commands)
- [Project Structure](#project-structure)

## Features and Pages

### Public and Optional-Auth Pages

| Page            | Route              | Access       | What it does                                                                                                      |
| --------------- | ------------------ | ------------ | ----------------------------------------------------------------------------------------------------------------- |
| Home            | `/`                | Guest + auth | Shows top-rated and most-rated books. Authenticated users also get personalized recommendations.                  |
| Browse          | `/browse`          | Guest + auth | Catalog browsing, query results, sections such as popular/recommended/trending, filters, sorting, and pagination. |
| Genres          | `/genres`          | Guest + auth | Browse categories and show top books for selected genres.                                                         |
| Login           | `/login`           | Public       | Email/password sign in.                                                                                           |
| Register        | `/register`        | Public       | Account creation with profile metadata and optional cropped avatar upload.                                        |
| Forgot Password | `/forgot-password` | Public       | Sends a Supabase password reset email.                                                                            |
| Reset Password  | `/reset-password`  | Public       | Updates the password after the reset redirect.                                                                    |

`/search` is currently a legacy redirect to `/browse`.

### Authenticated Pages

| Page           | Route              | What it does                                                                                                                      |
| -------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| Onboarding     | `/onboarding`      | First-run personalization flow: choose genres, rate starter books, then mark onboarding complete.                                 |
| Book Detail    | `/book/:isbn`      | Book metadata, reviews, user rating/review, reading-list actions, favourite toggle, similar books, and friend suggestions.        |
| My Books       | `/my-books`        | Personal shelves for wishlist, currently reading, finished, and favourites with progress tracking.                                |
| Profile        | `/profile`         | Own profile, activity, reading shelves, favourites, friends, privacy preferences, email/password settings, and avatar management. |
| Public Profile | `/profile/:userId` | View another user's profile and public reading activity, with friend/suggestion actions where allowed.                            |
| Friends        | `/friends`         | Search users, send/accept/reject/remove friend requests, and show pending/accepted relationships.                                 |
| Community      | `/community`       | Discover users and send friend requests.                                                                                          |

### Cross-App Features

- Supabase email/password authentication with persisted sessions.
- Profile creation trigger after signup.
- Avatar upload to Supabase Storage `avatars` bucket.
- Dark/light theme switching through `next-themes`.
- Header search with debounced title/author suggestions and saved recent searches.
- In-app notifications for friend requests, accepted requests, and book suggestions.
- Floating BookWise Assistant chatbot connected to the Python backend.
- Responsive desktop header and mobile bottom navigation.

## Technology Stack

| Area                  | Technologies                                                     |
| --------------------- | ---------------------------------------------------------------- |
| Frontend              | React 18, TypeScript, Vite, SWC                                  |
| UI                    | Tailwind CSS, shadcn/ui, Radix UI primitives, Lucide icons       |
| State and routing     | TanStack React Query, React Context, React Router v6             |
| Forms and validation  | React Hook Form, Zod                                             |
| Charts and UI helpers | Recharts, Sonner, Vaul, Embla carousel                           |
| Backend-as-a-service  | Supabase Auth, PostgreSQL, Storage, RLS policies                 |
| Python API            | FastAPI, Uvicorn, Pydantic                                       |
| ML and data           | pandas, NumPy, scikit-learn, Surprise SVD, sentence-transformers |
| Vector search         | Supabase `pgvector`, MiniLM 384-dimensional embeddings           |
| Chatbot               | Gemini API via `httpx`, catalog-grounded fallback logic          |
| Tests and quality     | Vitest, Testing Library, ESLint                                  |

## Architecture Overview

BookWise is split into three cooperating parts:

1. Frontend app (`src/`)
   - Loads the CSV catalog from `public/data/cleaned_books.csv`.
   - Reads/writes user data through the Supabase JS client.
   - Calls the Python API through `VITE_API_URL` for recommendations, similar books, and chatbot responses.

2. Supabase backend (`supabase/migrations/`)
   - Stores user-owned data such as profiles, preferences, ratings, shelves, friends, notifications, and suggestions.
   - Stores avatar images in the `avatars` bucket.
   - Stores book embeddings in `book_embeddings` for chatbot vector retrieval.

3. Python backend (`backend/`)
   - Loads the same book catalog.
   - Pulls Supabase user signals for ML recommendations.
   - Builds local MiniLM embeddings and caches them in `backend/cache/`.
   - Serves FastAPI endpoints on `http://localhost:8000` by default.

## Supabase Backend

Supabase is used for:

- Auth: email/password signup, login, reset password, session persistence.
- Database: PostgreSQL tables with RLS policies.
- Storage: public `avatars` bucket with user-scoped upload/update/delete policies.
- Vector search: `book_embeddings` table using the `vector(384)` type and `match_book_embeddings` RPC.

Important implementation notes:

- `handle_new_user()` creates a `profiles` row when a Supabase auth user is inserted.
- User-created tables have Row Level Security enabled.
- Public catalog metadata lives in CSV files, not in a `books` database table.
- Books are referenced in Supabase by `book_isbn13`.
- The Python backend should use backend-only Supabase credentials. Do not expose service-role keys through `VITE_` variables.

## Database Schema

Main tables:

| Table              | Purpose                                                                                   |
| ------------------ | ----------------------------------------------------------------------------------------- |
| `profiles`         | User profile fields, avatar URL, onboarding status, and privacy/notification preferences. |
| `user_preferences` | Genre preferences selected during onboarding or profile edits.                            |
| `reading_list`     | Wishlist/currently-reading/finished shelf items with page progress and timestamps.        |
| `ratings`          | 1-5 ratings and optional text reviews per user/book.                                      |
| `search_history`   | Saved search queries for recent-search suggestions.                                       |
| `friendships`      | Pending/accepted/rejected relationships between users.                                    |
| `notifications`    | In-app notifications tied to users, other users, or books.                                |
| `book_suggestions` | Friend-to-friend book recommendations with optional messages.                             |
| `favourites`       | Favourite/bookmarked ISBNs per user.                                                      |
| `book_embeddings`  | MiniLM vectors and catalog metadata for chatbot retrieval.                                |

Key functions, triggers, and storage:

- `update_updated_at_column()` keeps `updated_at` fresh on selected tables.
- `handle_new_user()` creates profiles from auth metadata.
- `match_book_embeddings(query_embedding vector(384), match_count integer)` returns closest catalog embeddings by cosine similarity.
- `avatars` storage bucket stores uploaded profile images.

## ML and Chatbot Backend

The backend API is defined in `backend/main.py`.

### API Endpoints

| Method | Path                    | Purpose                                                             |
| ------ | ----------------------- | ------------------------------------------------------------------- |
| `GET`  | `/health`               | Health check.                                                       |
| `POST` | `/recommend`            | Returns personalized hybrid recommendations for a `user_id`.        |
| `POST` | `/similar`              | Returns content-similar books for an ISBN13.                        |
| `POST` | `/chat`                 | Returns a chatbot reply and optional book cards.                    |
| `POST` | `/retrain`              | Retrains CF and hybrid blending from current Supabase ratings.      |
| `POST` | `/sync-book-embeddings` | Syncs local MiniLM book embeddings into Supabase `book_embeddings`. |

### ML Components

- Content-based filtering (`backend/cbf.py`): embeds book text with `all-MiniLM-L6-v2`, then uses cosine similarity. User seeds come from favourite ISBNs and selected genres.
- Collaborative filtering (`backend/cf.py`): trains a Surprise SVD model from Supabase `ratings` when enough ratings exist.
- Hybrid model (`backend/hybrid.py`): normalizes CF and CBF scores, then blends them. A Ridge regression model learns per-user CF/CBF weights from signal richness; otherwise it falls back to a global prior.
- Similar books (`backend/hybrid.py` + `backend/cbf.py`): uses content embeddings to find nearest books to the selected ISBN.
- Embedding cache (`backend/embedding_store.py`): stores generated MiniLM vectors in `backend/cache/book_embeddings_minilm.npz` and invalidates them when the CSV/model signature changes.
- Vector store (`backend/vector_store.py`): syncs vectors to Supabase and queries `match_book_embeddings` for chatbot retrieval.
- Chatbot (`backend/chatbot.py`): retrieves relevant catalog books, builds a grounded prompt, calls Gemini if `GEMINI_API_KEY` exists, and falls back to local catalog search when Gemini or vector search is unavailable.
- Evaluation (`backend/evaluate.py`): computes Precision@K for CF, CBF, hybrid, and chatbot cards.

## Setup and Run

### Prerequisites

- Node.js 18+
- npm
- Python 3.10 or 3.11 recommended
- Supabase project
- Supabase CLI optional, but useful for migrations

### 1. Install Frontend Dependencies

```bash
npm install
```

### 2. Create the Frontend `.env`

Create `.env` in the project root. Use your own Supabase values. Do not commit real keys.

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-supabase-anon-public-key
VITE_SUPABASE_PROJECT_ID=your-project-ref
VITE_API_URL=http://localhost:8000
```

### 3. Apply Supabase Migrations

Using Supabase CLI:

```bash
npx supabase login
npx supabase link --project-ref your-project-ref
npx supabase db push
```

Manual option:

Run the SQL files in `supabase/migrations/` in timestamp order in the Supabase SQL editor. The combined `supabase/migrations/schema.sql` is also useful as a reference for the final schema.

### 4. Create the Backend `.env`

Create `backend/.env` for the Python service. The backend also loads root `.env`, but keeping backend-only secrets in `backend/.env` is clearer.

```env
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_KEY=your-backend-only-supabase-key
CSV_PATH=backend/data/cleaned_books.csv
GEMINI_API_KEY=your-gemini-api-key
GEMINI_MODEL=gemini-2.5-flash
```

Notes:

- `SUPABASE_KEY` should be a backend-only key with enough permissions for the Python API to read ratings/preferences and write book embeddings.
- Never put a service-role key in a `VITE_` variable. `VITE_` variables are bundled into browser code.
- `GEMINI_API_KEY` is optional. Without it, the chatbot still returns grounded catalog fallback responses.
- `CSV_PATH` is optional. If omitted, the backend checks `backend/data/cleaned_books.csv`, then `public/data/cleaned_books.csv`, then `data/cleaned_books.csv`.

### 5. Install Backend Dependencies

From the project root on Windows PowerShell:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

If PyTorch has Windows DLL/runtime issues, install a compatible CPU wheel:

```powershell
pip uninstall torch torchvision torchaudio -y
pip install torch --index-url https://download.pytorch.org/whl/cpu
```

### 6. Start the Backend API

From `backend/`:

```powershell
python run_server.py
```

Or:

```powershell
uvicorn main:app --host 127.0.0.1 --port 8000
```

First startup can take a while because the MiniLM model is loaded and book embeddings may be built. Generated local embeddings are cached under `backend/cache/`.

### 7. Sync Book Embeddings to Supabase

This is recommended for best chatbot retrieval.

From `backend/`:

```powershell
python sync_book_embeddings.py --batch-size 250
```

For a quick test:

```powershell
python sync_book_embeddings.py --limit 100 --batch-size 50
```

You can also call the API endpoint:

```powershell
curl.exe -X POST http://localhost:8000/sync-book-embeddings -H "Content-Type: application/json" -d "{\"limit\":100,\"batch_size\":50,\"force_rebuild_local\":false}"
```

### 8. Start the Frontend

From the project root:

```bash
npm run dev
```

Vite serves the app at `http://localhost:8080` because `vite.config.ts` sets port `8080`.

## Environment Variables

### Frontend Root `.env`

| Variable                        | Required | Example                                | Used by                                   |
| ------------------------------- | -------- | -------------------------------------- | ----------------------------------------- |
| `VITE_SUPABASE_URL`             | Yes      | `https://your-project-ref.supabase.co` | Supabase JS client                        |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Yes      | `your-supabase-anon-public-key`        | Supabase JS client                        |
| `VITE_SUPABASE_PROJECT_ID`      | Optional | `your-project-ref`                     | Project metadata/Lovable compatibility    |
| `VITE_API_URL`                  | Optional | `http://localhost:8000`                | Recommendation service and chatbot widget |

### Backend `backend/.env`

| Variable         | Required | Example                                | Used by                 |
| ---------------- | -------- | -------------------------------------- | ----------------------- |
| `SUPABASE_URL`   | Yes      | `https://your-project-ref.supabase.co` | Python Supabase client  |
| `SUPABASE_KEY`   | Yes      | `your-backend-only-supabase-key`       | Python Supabase client  |
| `CSV_PATH`       | Optional | `backend/data/cleaned_books.csv`       | Catalog loader          |
| `GEMINI_API_KEY` | Optional | `your-gemini-api-key`                  | Chatbot Gemini calls    |
| `GEMINI_MODEL`   | Optional | `gemini-2.5-flash`                     | Chatbot model selection |

## Useful Commands

Frontend:

```bash
npm run dev
npm run build
npm run build:dev
npm run preview
npm run lint
npm run test
npm run test:watch
```

Backend:

```powershell
cd backend
python run_server.py
python sync_book_embeddings.py --batch-size 250
python evaluate.py --user-id <supabase-user-uuid> --k 10
python evaluate.py --all-users --k 10 --components cf cbf hybrid
python evaluate.py --user-id <supabase-user-uuid> --chatbot-query "dark philosophical fiction" --k 5
```

## Project Structure

```text
.
|-- backend/
|   |-- main.py                    # FastAPI app and API endpoints
|   |-- run_server.py              # Starts Uvicorn on 127.0.0.1:8000
|   |-- run.bat                    # Windows helper for run_server.py
|   |-- requirements.txt           # Python dependencies
|   |-- data_loader.py             # CSV loading and Supabase user signals
|   |-- cf.py                      # Surprise SVD collaborative filtering
|   |-- cbf.py                     # MiniLM content-based filtering
|   |-- hybrid.py                  # CF/CBF blending and similar books
|   |-- embedding_store.py         # Local MiniLM embedding cache
|   |-- vector_store.py            # Supabase pgvector sync/search helpers
|   |-- chatbot.py                 # Grounded Gemini chatbot
|   |-- evaluate.py                # Precision@K evaluation CLI
|   |-- sync_book_embeddings.py    # Embedding sync CLI
|   `-- data/
|       `-- cleaned_books.csv      # Backend catalog copy
|-- public/
|   |-- data/
|   |   `-- cleaned_books.csv      # Frontend catalog copy
|   |-- favicon.ico
|   |-- placeholder.svg
|   `-- robots.txt
|-- src/
|   |-- App.tsx                    # React providers and routes
|   |-- main.tsx                   # React entry point
|   |-- index.css                  # Global styles and design tokens
|   |-- components/
|   |   |-- AppLayout.tsx           # Header, nav, search, footer, chatbot
|   |   |-- BookCard.tsx
|   |   |-- BookGrid.tsx
|   |   |-- ChatbotWidget.tsx
|   |   |-- NotificationBell.tsx
|   |   |-- ProtectedRoute.tsx
|   |   `-- ui/                    # shadcn/ui components
|   |-- contexts/
|   |   `-- AuthContext.tsx        # Supabase auth state and methods
|   |-- hooks/
|   |-- integrations/
|   |   `-- supabase/
|   |       |-- client.ts           # Supabase browser client
|   |       `-- types.ts            # Database TypeScript types
|   |-- lib/
|   |   |-- popularGenres.ts
|   |   `-- utils.ts
|   |-- pages/
|   |   |-- HomePage.tsx
|   |   |-- BrowsePage.tsx
|   |   |-- GenresPage.tsx
|   |   |-- BookDetailPage.tsx
|   |   |-- MyBooksPage.tsx
|   |   |-- ProfilePage.tsx
|   |   |-- FriendsPage.tsx
|   |   |-- CommunityPage.tsx
|   |   |-- OnboardingPage.tsx
|   |   |-- LoginPage.tsx
|   |   |-- RegisterPage.tsx
|   |   |-- ForgotPasswordPage.tsx
|   |   |-- ResetPasswordPage.tsx
|   |   |-- SearchPage.tsx           # Legacy page, route redirects to /browse
|   |   `-- NotFound.tsx
|   |-- services/
|   |   |-- bookService.ts          # CSV catalog load/search/fallback recs
|   |   `-- recommendationService.ts # Calls Python API
|   |-- test/
|   `-- types/
|       `-- book.ts
|-- supabase/
|   `-- migrations/                # SQL migrations and combined schema reference
|-- package.json
|-- vite.config.ts
|-- tailwind.config.ts
|-- vitest.config.ts
`-- README.md
```

## Notes for Contributors

- Keep real `.env` files out of git. The repo already ignores root and backend env files.
- The frontend catalog parser is intentionally simple and reads from `public/data/cleaned_books.csv`.
- The Python backend can run without Gemini, but personalized recommendations need Supabase connectivity and user signals.
- The best chatbot experience needs both a Gemini key and synced `book_embeddings` rows in Supabase.

## License

This project is for educational and personal use.
