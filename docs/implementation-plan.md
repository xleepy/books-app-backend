# Implementation Plan — Books App Backend

**Status:** DRAFT — decisions below are tentative; open questions are marked `[DECIDE]`.
**Supersedes:** `architecture-ideas.md` (research) + `review.md` (critique) once accepted.

---

## 1. Decisions (tentative)

| Area | Choice | Rationale |
| --- | --- | --- |
| **Database** | PostgreSQL (no pgvector yet) | Relational data, junction tables carry graph for 5K books, one DB to run. Add pgvector later if content-based plateaus. |
| **Framework** | **Fastify + TypeScript** | Lightweight, fast, good TS story, pairs cleanly with Prisma. NestJS is heavier than needed; Express is dated. |
| **ORM / migrations** | Prisma | Type-safe client shared with seeding scripts, first-class migrations. |
| **Auth** | **Supabase Auth** (JWT only, not the DB) | 50K MAU free tier, JWTs verifiable server-side. Clerk is pricier; roll-your-own isn't worth it. |
| **Auth providers** | **Google OAuth + email/password** for v1 | Google = low-friction mobile signup, no password to remember. Email/password as fallback for users without a Google account. Both flow through Supabase → server gets a single JWT to verify regardless of provider. Apple Sign-In flagged in §8 (App Store requirement). |
| **Hosting** | **Self-hosted Postgres + API on VPS** | Full control, cheapest at scale. Own backups/upgrades; standard Postgres so migration is trivial later. |
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
- `User` gains server-owned `createdAt`, `email`, removes `xpCurrent`/`xpRequired` from client state in favor of derived values
- `User` gains `preferences` (see §3): `readingGoalMinutes`, `reminderTime`, `preferredGenres[]`, `notificationPrefs { push, weeklyDigest, challengeUpdates }`, `profileVisibility`
- `Thread` gains `creatorId`, `createdAt`; `replies` becomes a count **and** a sibling `ThreadReply[]` resource
- **New** `LibraryItem` fields: `progressPct`, `timeLeftMinutes`, `isCurrent` (replaces the frontend's separate `userSlice.currentBook`)

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
users (
  id, auth_id UNIQUE, email, name, avatar_hue, reading_goal,
  xp_total        int DEFAULT 0,
  level           int DEFAULT 1,
  level_title     text DEFAULT 'Newcomer',
  streak          int DEFAULT 0,
  best_streak     int DEFAULT 0,
  streak_last_date date,                   -- last day an activity was logged
  week_days       bool[7] DEFAULT ARRAY[false,false,false,false,false,false,false],
  pages_read      int DEFAULT 0,
  books_finished  int DEFAULT 0,
  hours_read      numeric(8,2) DEFAULT 0,
  created_at      timestamptz DEFAULT now()
)
user_preferences (
  user_id                 uuid PK REFERENCES users,
  reading_goal_minutes    int DEFAULT 30,
  reminder_time           time,                      -- e.g. '21:00' for 9 PM
  reminder_enabled        bool DEFAULT false,
  preferred_genres        text[] DEFAULT '{}',       -- subject slugs
  notify_push             bool DEFAULT true,
  notify_weekly_digest    bool DEFAULT true,
  notify_challenge        bool DEFAULT true,
  profile_visibility      text DEFAULT 'public' CHECK (profile_visibility IN ('public','friends','private')),
  onboarded_at            timestamptz,
  updated_at              timestamptz DEFAULT now()
)
swipes (
  id, user_id, book_id,
  direction text CHECK (direction IN ('right','left','bookmark','library','skip')),
  created_at timestamptz DEFAULT now(),
  UNIQUE (user_id, book_id)             -- last swipe wins; on conflict update
)
library_items (
  user_id, book_id,
  status text CHECK (status IN ('want','reading','finished')),
  is_current      bool DEFAULT false,     -- one row per user may be true; enforced in app + partial unique index
  progress_pct    numeric(5,2) DEFAULT 0, -- 0.00–100.00
  time_left_min   int,                    -- estimated minutes remaining, nullable
  added_at        timestamptz DEFAULT now(),
  finished_at     timestamptz
)
-- Partial unique index: at most one current book per user
-- CREATE UNIQUE INDEX one_current_per_user ON library_items (user_id) WHERE is_current;
reviews (id, book_id, user_id, rating, text, created_at)

-- Gamification
xp_events (
  id, user_id, source text,               -- 'book_finished' | 'review' | 'streak_milestone' | 'challenge'
  xp int, meta jsonb, created_at timestamptz DEFAULT now()
)
badges (id, slug UNIQUE, name, description, icon_url)
user_badges (user_id, badge_id, awarded_at)
challenges (
  id, slug UNIQUE, title, subtitle, goal text,
  variant text CHECK (variant IN ('monthly','yearly')),
  target int, badge_id uuid REFERENCES badges,
  active_from date, active_to date
)
user_challenges (user_id, challenge_id, current int DEFAULT 0, completed_at timestamptz)

-- Community (Phase 6 endpoints, but schema lives here from day 1)
threads (
  id uuid PK,
  creator_id uuid REFERENCES users,
  book_id    uuid REFERENCES books,       -- nullable; threads can be general
  title      text NOT NULL,
  preview    text,                        -- first ~140 chars of body for list view
  body       text,
  spoiler    bool DEFAULT false,
  likes      int  DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
)
thread_replies (
  id uuid PK,
  thread_id uuid REFERENCES threads ON DELETE CASCADE,
  user_id   uuid REFERENCES users,
  body      text NOT NULL,
  created_at timestamptz DEFAULT now()
)
thread_likes (user_id, thread_id, PRIMARY KEY (user_id, thread_id))

-- Precomputed per-user feed (optional, Phase 3)
recommendation_cache (user_id, book_id, score, reason jsonb, computed_at)
```

**Indexes:** `swipes (user_id, created_at DESC)`, `book_subjects (subject_id)`, `subject_edges (from_id)`, `books (open_library_id)`, `thread_replies (thread_id, created_at)`, partial-unique `library_items (user_id) WHERE is_current`.

---

## 4. API Contract (v1)

RTK Query is already stubbed on the frontend with `fakeBaseQuery()`. Replace with a real `baseQuery` pointing at these endpoints:

```
# Books & feed
GET    /v1/books/feed?cursor=<opaque>           → Book[] + nextCursor   (swipe deck)
GET    /v1/books/:id                            → BookDetail

# Swipes
POST   /v1/swipes                               → { accepted: true }     body: { bookId, direction }

# Library
GET    /v1/library                              → LibraryItem[]
POST   /v1/library                              → LibraryItem            body: { bookId, status }
PATCH  /v1/library/:bookId                      → LibraryItem            body: { status?, progressPct?, timeLeftMin?, isCurrent? }
DELETE /v1/library/:bookId
GET    /v1/me/current-book                      → LibraryItem | null     (drives ReadingCard)

# Reviews
GET    /v1/reviews?bookId=<id>                  → Review[]
POST   /v1/reviews                              → Review                 body: { bookId, rating, text }

# Me / profile / preferences
GET    /v1/me                                   → User + ReadingStats + Preferences
PATCH  /v1/me                                   → User                   body: { name?, avatarHue?, readingGoal? }
GET    /v1/me/preferences                       → Preferences
PUT    /v1/me/preferences                       → Preferences            body: full preferences object
POST   /v1/me/password                          → { ok: true }           body: { currentPassword, newPassword }  (email/password users only)
POST   /v1/auth/logout                          → { ok: true }           (revokes refresh token)

# Community (Phase 6)
GET    /v1/threads?filter=all|popular|recent|mine&search=<q>&cursor=<c>  → Thread[] + nextCursor
GET    /v1/threads/:id                          → ThreadDetail (thread + replies)
POST   /v1/threads                              → Thread                 body: { title, body, bookId?, spoiler? }
POST   /v1/threads/:id/replies                  → ThreadReply            body: { body }
POST   /v1/threads/:id/like                     → { liked: bool, likes: int }

# Gamification
GET    /v1/challenges?filter=active|monthly|yearly  → Challenge[]
GET    /v1/challenges/:id/progress              → UserChallenge
GET    /v1/leaderboard                          → LeaderboardEntry[]
GET    /v1/me/badges                            → UserBadge[]
```

All mutating routes require `Authorization: Bearer <jwt>`. Feed endpoint is the recommendation engine's only public surface.

---

## 5. Phased Milestones

### Phase 0 — Foundation (1–2 days)

- Scaffold Fastify + TS + Prisma
- Postgres provisioned on VPS, `.env` wiring, `/healthz`
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
- First successful sign-in creates a `users` row + default `user_preferences` row keyed by `auth_id` (Supabase UUID); pre-fill `name` from Google profile if available, default `avatar_hue`
- `GET /v1/books/:id`, `GET /v1/books/feed` (random-order first, no personalization yet)
- `GET /v1/me`, `GET /v1/reviews`, `GET /v1/library`, `GET /v1/me/current-book`
- `GET/PUT /v1/me/preferences`, `PATCH /v1/me`, `POST /v1/auth/logout`, `POST /v1/me/password` — Settings screen wiring
- Frontend swaps `mockBooks` for `useGetFeedQuery()`; library slice becomes a thin cache over `/v1/library`; `userSlice.currentBook` collapses into `library_items.is_current`
- **Exit criteria:** sign in with Google on a real device, app runs end-to-end against deployed backend, Settings screen persists to server, zero personalization

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

### Phase 5 — Gamification

- XP event pipeline: award XP on `library_items` status → `finished`, review posted, streak milestone
- Level computation: derive `level` + `level_title` from `xp_total` on each XP event
- Streak maintenance: nightly job increments/resets `streak`, updates `week_days`
- Seed challenge definitions (monthly/yearly) in `challenges` table
- `GET /v1/challenges`, `GET /v1/challenges/:id/progress`, `GET /v1/leaderboard`, `GET /v1/me/badges`
- Award badges on milestone events (first book, 7-day streak, challenge completed, etc.)
- **Exit criteria:** Progress screen and Challenges tab fully driven by backend; no mock data

### Phase 6 — Community (threads)

- Tables (`threads`, `thread_replies`, `thread_likes`) already migrated in Phase 0; endpoints activated here
- `GET /v1/threads` with `filter` (all/popular/recent/mine) + `search` + cursor
- `POST /v1/threads`, `GET /v1/threads/:id`, `POST /v1/threads/:id/replies`, `POST /v1/threads/:id/like`
- Frontend `DiscussionsScreen` FilterRow + `+` button become live; thread-detail route added
- Moderation: basic rate limit on thread/reply creation, soft-delete column
- **Exit criteria:** create a thread + reply on a real device, filters work, likes persist

### Phase 7 — Nice-to-haves

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

- `[DECIDE]` **Apple Sign-In**: required by App Store guideline 4.8 if you ship to iOS with Google as a third-party sign-in option. Add at v1 or accept iOS submission risk?
- `[DECIDE]` **Frontend type changes**: are you OK adding `bookId`/`userId` to `Review`, and swapping local-asset `cover` keys for `coverUrl` on seeded books?
- `[DECIDE]` **Scope of v1**: Challenges + Leaderboard are Phase 5; Threads are Phase 6. They're visible in the UI today — is that acceptable?
- `[DECIDE]` **Seed size**: 3K or 5K books? Affects seeding time (~45 vs ~90 min) but not much else.
- `[DECIDE]` **Profile visibility semantics**: `public` / `friends` / `private` — but we have no friends graph. Ship with just `public`/`private` for v1?
- `[DECIDE]` **Onboarding preferences**: Settings screen lists "Preferred Genres" but there's no onboarding flow yet. Ship Settings as the only entry point, or add an onboarding step in Phase 2?
- `[DECIDE]` **Reading reminders**: server-side push (needs APNs/FCM — currently out of scope per §9) or client-local notifications? Latter ships faster.

---

## 9. Out of Scope

- Embeddings / pgvector (revisit at Phase 6)
- Neo4j (rejected per review.md)
- Redis caching (premature at this scale)
- Image hosting for user avatars (using `avatarHue` numeric keeps this simple)
- Push notifications, email

---

## 10. Gamification System

### XP rules

| Action | XP |
|--------|----|
| Finish a book | 100 |
| Write a review | 25 |
| 7-day streak milestone | 50 |
| Complete a challenge | 150 |
| First book ever | 50 (bonus) |

### Level progression

Level thresholds use a simple quadratic curve: `xp_required(level) = level * 100 + (level - 1) * 50`. Level titles are seeded as static config (e.g. Newcomer → Reader → Bookworm → Scholar → Sage).

### Streak logic

A streak increments when a user logs any reading activity on a calendar day different from `streak_last_date`. If `streak_last_date < today - 1`, streak resets to 1. `week_days[i]` is true if the user was active on day `i` of the current ISO week (Monday = 0).

### Badge triggers

Badges are awarded server-side inside the XP event handler. Initial badge set:

| Badge | Trigger |
|-------|---------|
| First Chapter | First book finished |
| On Fire | 7-day streak |
| Critic | 5 reviews written |
| Centurion | 100 books finished |
| Champion | Any challenge completed |
