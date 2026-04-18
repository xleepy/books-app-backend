# Implementation Plan — Books App Backend

**Status:** DRAFT — decisions below are tentative; open questions are marked `[DECIDE]`.
**Supersedes:** `architecture-ideas.md` (research) + `review.md` (critique) once accepted.

---

## 1. Decisions (tentative)

| Area | Choice | Rationale |
| --- | --- | --- |
| **Database** | PostgreSQL (no pgvector yet) | Relational data, junction tables carry graph for 5K books, one DB to run. Add pgvector later if content-based plateaus. |
| **Framework** | `[DECIDE]` — proposing **Fastify + TypeScript** | Lightweight, fast, good TS story, pairs cleanly with Prisma. Alternatives: NestJS (heavier), Express (dated). |
| **ORM / migrations** | Prisma | Type-safe client shared with seeding scripts, first-class migrations. |
| **Auth** | `[DECIDE]` — proposing **Supabase Auth** (JWT only, not the DB) | Free tier, JWTs verifiable server-side. Alternatives: Clerk (pricier), roll-our-own (don't). |
| **Auth providers** | **Google OAuth + email/password** for v1 | Google = low-friction mobile signup, no password to remember. Email/password as fallback for users without a Google account. Both flow through Supabase → server gets a single JWT to verify regardless of provider. Apple Sign-In flagged in §8 (App Store requirement). |
| **Hosting** | `[DECIDE]` — proposing **Neon (Postgres) + Fly.io or Railway (API)** | Both have generous free tiers; Neon branches are nice for migrations. |
| **Seeding runtime** | Same repo, separate `scripts/seed/` entry, runs against production DB once | Avoids a separate service; idempotent via Open Library IDs as natural keys. |

---

## 2. Corrected Frontend Data Model

Per `review.md`, these are the **actual** frontend types the backend schema must align to:

- **Book** — `id`, `title`, `author`, `cover` (BookCoverKey), `rating`, `tags`, `description`, `reviewCount`
  (no `genres`, `pages`, `published`, `synopsis` — those were hallucinated in the research doc)
- **User** — `id`, `name`, `avatarHue` (number), `level`, `xpCurrent`, `xpRequired`, `readingGoal`
  Reading stats live in separate `ReadingStats`: `streak`, `bestStreak`, `booksFinished`
- **Review** — `id`, `reviewer`, `rating`, `text`, `date`, `avatarHue`
  (no `bookId` in the type — backend will need one; flag for frontend alignment)
- **Thread** (not `Discussion`) — `id`, `cover`, `bookContext`, `title`, `preview`, `replies`, `likes`, `timeAgo`, `spoiler?`, `liked?`
- **Challenge** — `id`, `title`, `subtitle`, `description`, `variant`, `current`, `target`, `goal`, `badgeText`
  Leaderboard is a separate `LeaderboardEntry[]`

**Backend-required additions** (require frontend type updates):

- `Book.openLibraryId`, `Book.subjects[]`, `Book.pageCount`, `Book.firstPublishYear`, `Book.coverUrl` (replaces local-asset `cover` key for seeded books)
- `Review.bookId`, `Review.userId`
- `User` gains server-owned `createdAt`, removes `xpCurrent`/`xpRequired` from client state in favor of derived values

---

## 3. Schema (first cut)

```sql
-- Core entities
books (
  id              uuid PK,
  open_library_id text UNIQUE,          -- natural key for idempotent seeding
  title           text NOT NULL,
  author          text NOT NULL,        -- denormalized for speed; authors table also exists
  description     text,
  cover_url       text,
  page_count      int,
  first_publish_year int,
  rating_avg      numeric(3,2),         -- from Open Library
  rating_count    int,
  created_at      timestamptz DEFAULT now()
)

authors (id, open_library_id UNIQUE, name)
book_authors (book_id, author_id)       -- M:N (most books have 1; some have N)

subjects (id, name UNIQUE, slug UNIQUE)
book_subjects (book_id, subject_id, weight numeric DEFAULT 1.0)
subject_edges (from_id, to_id, weight)  -- "related subjects" graph from Open Library

-- Users & signals
users (id, auth_id UNIQUE, name, avatar_hue, reading_goal, created_at)
swipes (
  id, user_id, book_id,
  direction text CHECK (direction IN ('right','left','bookmark','library','skip')),
  created_at timestamptz DEFAULT now(),
  UNIQUE (user_id, book_id)             -- last swipe wins; on conflict update
)
library_items (user_id, book_id, status text, added_at)  -- want/reading/finished
reviews (id, book_id, user_id, rating, text, created_at)

-- Precomputed per-user feed (optional, Phase 3)
recommendation_cache (user_id, book_id, score, reason jsonb, computed_at)
```

**Indexes:** `swipes (user_id, created_at DESC)`, `book_subjects (subject_id)`, `subject_edges (from_id)`, `books (open_library_id)`.

---

## 4. API Contract (v1)

RTK Query is already stubbed on the frontend with `fakeBaseQuery()`. Replace with a real `baseQuery` pointing at these endpoints:

```
GET  /v1/books/feed?cursor=<opaque>        → Book[] + nextCursor     (swipe deck)
GET  /v1/books/:id                         → BookDetail
POST /v1/swipes                            → { accepted: true }      body: { bookId, direction }
GET  /v1/library                           → LibraryItem[]
POST /v1/library                           → LibraryItem             body: { bookId, status }
DELETE /v1/library/:bookId
GET  /v1/reviews?bookId=<id>               → Review[]
POST /v1/reviews                           → Review                  body: { bookId, rating, text }
GET  /v1/me                                → User + ReadingStats
GET  /v1/threads                           → Thread[]                (later phase)
GET  /v1/challenges                        → Challenge[]             (later phase)
```

All mutating routes require `Authorization: Bearer <jwt>`. Feed endpoint is the recommendation engine's only public surface.

---

## 5. Phased Milestones

### Phase 0 — Foundation (1–2 days)

- Scaffold Fastify + TS + Prisma
- Neon DB provisioned, `.env` wiring, `/healthz`
- CI: lint + typecheck + `prisma migrate diff`
- **Exit criteria:** `curl /healthz` returns 200 from deployed env

### Phase 1 — Seeding pipeline (2–3 days)

- `scripts/seed/fetch-subjects.ts` — pulls ~50 curated subjects, stores in `subjects` + `subject_edges`
- `scripts/seed/fetch-books.ts` — for each subject, top 100 books; dedupe by `open_library_id`
- `scripts/seed/enrich.ts` — per-book `/works/{id}.json` for description + `ratings.json`
- Rate-limit wrapper (3 req/s, User-Agent set, exponential backoff on 429)
- Idempotent: re-running updates rows, never duplicates
- **Exit criteria:** ~3–5K books in DB with subjects + relationships

### Phase 2 — Read-only API + auth (2–3 days)

- Supabase Auth wired; JWT middleware verifies tokens server-side (JWKS from Supabase project)
- **Auth providers configured:**
  - **Google OAuth** — Google Cloud project + OAuth client IDs (separate IDs for iOS, Android, web); redirect URIs registered in Supabase dashboard
  - **Email/password** — enabled in Supabase, no extra config
- Mobile client: deep-link / URL scheme registered (e.g. `booksapp://auth-callback`); use `expo-auth-session` or Supabase RN SDK to drive the OAuth flow
- First successful sign-in creates a `users` row keyed by `auth_id` (Supabase UUID); pre-fill `name` from Google profile if available, default `avatar_hue`
- `GET /v1/books/:id`, `GET /v1/books/feed` (random-order first, no personalization yet)
- `GET /v1/me`, `GET /v1/reviews`, `GET /v1/library`
- Frontend swaps `mockBooks` for `useGetFeedQuery()`; library slice becomes a thin cache over `/v1/library`
- **Exit criteria:** sign in with Google on a real device, app runs end-to-end against deployed backend, zero personalization

### Phase 3 — Swipe ingestion + cold-start recs (3–4 days)

- `POST /v1/swipes`, `POST /v1/library`, `POST /v1/reviews`
- Cold-start feed: **popular-in-subject + diversity** (shuffle across top-N subjects)
- Content-based scoring: subject overlap with user's liked books, penalize seen
- Feed endpoint returns blended results once user has ≥5 right-swipes
- **Exit criteria:** feed measurably improves after swiping (manual eval)

### Phase 4 — Collaborative signal (later)

- Nightly job computes book-to-book co-liked matrix (just a materialized view for 5K books)
- Blend into feed scoring (the weighted formula from research doc §4)
- **Exit criteria:** offline precision@10 on held-out swipes beats Phase 3

### Phase 5 — Nice-to-haves

- Threads, challenges, leaderboards (data already modeled)
- Embedding pipeline **only if** content+collab plateaus

---

## 6. Cold-Start Strategy

First-time user has zero signal. The feed endpoint falls back through these tiers:

1. **Profile-based** — if onboarding collected preferred subjects, seed feed from those
2. **Global popular** — top-rated books across curated subjects, diversity-sampled
3. **Exploration** — 20% of feed always samples outside known preferences (prevents filter bubble from day one)

Once `swipes.count(user) >= 5`, transition to personalized scoring.

---

## 7. Frontend Migration Sequencing

The frontend currently has `fakeBaseQuery()` and two slices that hold state locally. Migration order:

1. **Replace baseQuery** with a real `fetchBaseQuery` against the deployed backend — no UI changes
2. **swipe slice** — drop `mockBooks`, drop `currentIndex`, use `useGetFeedQuery` with cursor pagination; swipe actions fire `POST /v1/swipes` via RTK mutation
3. **library slice** — becomes a thin optimistic wrapper over `useGetLibraryQuery` + `useAddToLibraryMutation`
4. **User/stats** — read from `/v1/me`; remove hardcoded xp/level from initial state
5. **Reviews/threads/challenges** — last, since they're less critical paths

Each step ships independently behind the same API surface.

---

## 8. Open Questions (need your input)

- `[DECIDE]` **Framework**: Fastify vs NestJS vs Express?
- `[DECIDE]` **Auth provider**: Supabase Auth, Clerk, or other? (must support Google OAuth + email/password natively)
- `[DECIDE]` **Apple Sign-In**: required by App Store guideline 4.8 if you ship to iOS with Google as a third-party sign-in option. Add at v1 or accept iOS submission risk?
- `[DECIDE]` **Hosting**: Neon + Fly, Supabase (DB+auth bundled), or Railway all-in?
- `[DECIDE]` **Frontend type changes**: are you OK adding `bookId`/`userId` to `Review`, and swapping local-asset `cover` keys for `coverUrl` on seeded books?
- `[DECIDE]` **Scope of v1**: is it OK that Threads + Challenges + Leaderboard are Phase 5? They're visible in the UI today.
- `[DECIDE]` **Seed size**: 3K or 5K books? Affects seeding time (~45 vs ~90 min) but not much else.

---

## 9. Out of Scope

- Embeddings / pgvector (revisit at Phase 5)
- Neo4j (rejected per review.md)
- Redis caching (premature at this scale)
- Image hosting for user avatars (using `avatarHue` numeric keeps this simple)
- Push notifications, email
