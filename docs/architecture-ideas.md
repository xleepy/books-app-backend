> **Historical research doc** — decisions have been finalized in `implementation-plan.md`. The swipe-signal model described here was superseded: there is no separate swipes endpoint; adding a book to the library is the signal. Neo4j was rejected in favour of PostgreSQL (junction tables + in-memory scoring). See `implementation-plan.md` for current architecture.

---

## Research Report: Books App Backend Architecture

### Research Question
Design a backend for the books app with Open Library API seeding, a preference/recommendation algorithm based on a related-books graph, and the best database choice.

### Approach
- **Codebase search**: Analyzed the frontend data models (`Book`, `User`, `Review`, `Discussion`, `Challenge`), Redux slices, and RTK Query setup
- **Web research**: Open Library API endpoints, data structures, rate limits; database comparison (PostgreSQL+pgvector, Neo4j, MongoDB, hybrid approaches)

---

## Findings

### 1. Current Frontend Data Model

Your app already defines these entities:

| Entity       | Key Fields                                                                                |
| ------------ | ----------------------------------------------------------------------------------------- |
| `Book`       | id, title, author, cover (local image), rating, genres, pages, published, synopsis, tags  |
| `User`       | id, name, avatar, level, xp, booksRead, currentStreak, longestStreak, readingGoal, badges |
| `Review`     | id, bookId, userName, rating, text, date, avatarHue                                       |
| `Discussion` | id, bookCover, bookTitle, title, preview, replies, likes, timestamp                       |
| `Challenge`  | id, title, description, type, progress, total, deadline, members, leaderboard             |

The RTK Query `apiSlice` is empty — prepped for a future API with `baseUrl: ''`. The swipe slice tracks `currentIndex` into a static book array; the library slice stores `savedBooks` in Redux.

### 2. Open Library API — What's Available for Seeding

| Capability      | Endpoint                                      | Notes                                                                                       |
| --------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------- |
| **Search**      | `/search.json?q=...`                          | Returns title, author, subjects, cover_i, first_publish_year, ISBN. Best for bulk fetching. |
| **Book detail** | `/works/OL{id}W.json`                         | Full description, subjects, subject_people, subject_places                                  |
| **Ratings**     | `/works/OL{id}W/ratings.json`                 | Average rating per work                                                                     |
| **Subjects**    | `/subjects/{subject}.json?details=true`       | Lists books + **related subjects** — critical for building the graph                        |
| **Authors**     | `/authors/OL{id}A/works.json`                 | All works by an author                                                                      |
| **Covers**      | `covers.openlibrary.org/b/id/{cover_i}-L.jpg` | S/M/L sizes                                                                                 |
| **Bulk dumps**  | `openlibrary.org/developers/dumps`            | Monthly full data dumps (TB-scale)                                                          |
| **Rate limit**  | 100 req/5min (covers), 3 req/s (identified)   | Must include `User-Agent` header                                                            |

**Key insight**: There's **no "similar books" API**. You must build the relatedness graph yourself using shared subjects, authors, and collaborative signals.

**Seeding strategy**: Use the **Subjects API** to pull curated lists (e.g., `/subjects/fiction.json?limit=100`, `/subjects/fantasy.json`, etc.) rather than random search. This gives you well-categorized books with subject relationships baked in.

### 3. Database Options — Comparison

Here are the three most viable architectures for your use case:

---

#### **Option A: PostgreSQL + pgvector** (Single DB, simplest)

```
┌─────────────────────────────────────────┐
│              PostgreSQL                  │
│  ┌─────────┐  ┌──────────┐  ┌────────┐ │
│  │  books   │  │  users   │  │ swipes │ │
│  │(+vector) │  │(+prefs)  │  │        │ │
│  └────┬─────┘  └────┬─────┘  └────────┘ │
│       │  ┌───────────┘                   │
│  ┌────▼──▼────┐  ┌──────────────┐       │
│  │book_subjects│  │book_embeddings│      │
│  │(junction)   │  │(pgvector)     │      │
│  └─────────────┘  └──────────────┘       │
└─────────────────────────────────────────┘
```

**How recommendations work:**

- Store book embeddings (generated from subjects/description via a lightweight embedding model)
- `SELECT * FROM books ORDER BY embedding <=> user_preference_vector LIMIT 20`
- Combine with collaborative filtering via SQL (users who liked X also liked Y)
- Content-based: shared subjects/authors via junction tables

**Pros:**

- Single database to deploy and maintain
- pgvector HNSW index = fast nearest-neighbor search
- Full ACID, mature ecosystem, cheap hosting ($15–50/month on Supabase/Neon/Railway)
- Your existing relational data model maps naturally

**Cons:**

- Multi-hop graph traversals (book→subject→related_subject→other_books) need recursive CTEs — possible but verbose
- Need to generate and maintain embedding vectors (adds ML pipeline complexity)

**Cost:** $15–50/month

---

#### **Option B: Neo4j AuraDB** (Native graph, best for recommendations)

```
(User)──[:LIKED]──▶(Book)──[:HAS_SUBJECT]──▶(Subject)
  │                   │                         │
  │                   ├──[:WRITTEN_BY]──▶(Author)│
  │                   │                         │
  └──[:DISLIKED]──▶(Book)    (Subject)◀──[:RELATED_TO]──▶(Subject)
```

**How recommendations work (Cypher):**

```cypher
// Books similar to what user swiped right on
MATCH (u:User {id: $userId})-[:LIKED]->(liked:Book)-[:HAS_SUBJECT]->(s:Subject)<-[:HAS_SUBJECT]-(rec:Book)
WHERE NOT (u)-[:LIKED|DISLIKED]->(rec)
WITH rec, count(DISTINCT s) AS overlap, collect(s.name) AS shared_subjects
RETURN rec ORDER BY overlap DESC LIMIT 20
```

**Pros:**

- The related-books graph IS the database — zero impedance mismatch
- Cypher queries for "find me books like the ones I liked" are 5-10 lines vs 50+ in SQL
- Native graph algorithms (PageRank, community detection, similarity) built-in via GDS
- Real-time preference updates as user swipes — each swipe creates/strengthens edges
- Perfect for your "Tinder for books" swipe + discover pattern

**Cons:**

- AuraDB Free tier: 1 instance, 200K nodes (plenty for prototype)
- AuraDB Pro: starts ~$65/month
- Learning curve for Cypher (though it's intuitive)
- Need a secondary store or layer for auth/sessions (or pair with a lightweight SQL DB)

**Cost:** Free tier → $65+/month for production

---

#### **Option C: PostgreSQL (data) + Redis (recommendation cache)** (Cheapest production)

```
┌──────────────────┐     ┌──────────────────┐
│   PostgreSQL     │     │     Redis        │
│  (source of truth)│────▶│  (precomputed)   │
│  books, users,   │     │  user:123:recs   │
│  ratings, swipes │     │  book:456:similar │
└──────────────────┘     └──────────────────┘
        ▲                         │
        │      ┌──────────┐      │
        └──────│ Cron Job  │◀────┘
               │(recompute │
               │ recs daily)│
               └──────────┘
```

**Pros:** Cheapest ($25/month), fast reads from cache, familiar tools
**Cons:** Batch-only recommendation updates (not real-time), cache invalidation complexity, more app code

---

### 4. Recommendation Algorithm Design

Regardless of database, the preference algorithm would have these layers:

```
┌─────────────────────────────────────────────┐
│           Recommendation Pipeline            │
├─────────────────────────────────────────────┤
│                                             │
│  1. CONTENT-BASED (from book metadata)      │
│     • Shared subjects/genres (weighted)     │
│     • Same author → strong signal           │
│     • Similar page count, era, tags         │
│                                             │
│  2. COLLABORATIVE (from user behavior)      │
│     • Users who liked book A also liked B   │
│     • Swipe-right co-occurrence matrix      │
│                                             │
│  3. GRAPH-BASED (relatedness traversal)     │
│     • Book → Subject → Related Subject →    │
│       Other Books (Open Library subjects    │
│       API gives related subjects!)          │
│     • Author → Other Works                  │
│     • 2-3 hop traversals for diversity      │
│                                             │
│  4. PROFILE BOOST (user preferences)        │
│     • Preferred genres from profile setup   │
│     • Reading history momentum              │
│     • Penalize already-seen books           │
│                                             │
│  5. BLENDING & RANKING                      │
│     score = 0.4×content + 0.3×collab        │
│           + 0.2×graph + 0.1×profile_boost   │
│     + diversity factor (avoid genre bubbles) │
│                                             │
└─────────────────────────────────────────────┘
```

**Swipe signal mapping:**
| Swipe | Signal | Weight |
|---|---|---|
| Right (like) | Strong positive | +1.0 |
| Bookmark | Moderate positive | +0.6 |
| Left (pass) | Weak negative | -0.3 |
| Tap → Add to Library | Strong positive | +1.0 |
| Tap → Back (no action) | Neutral | 0 |

### 5. Open Library Seeding Pipeline

```
Phase 1: Seed subjects (pull ~50 key genres/subjects)
  ↓
Phase 2: For each subject, fetch top 100 books via /subjects/{name}.json
  ↓
Phase 3: For each book, fetch /works/{id}.json for full metadata + description
  ↓
Phase 4: Fetch /works/{id}/ratings.json for community ratings
  ↓
Phase 5: Build subject graph from "related subjects" in subject API responses
  ↓
Phase 6: Store cover URLs (covers.openlibrary.org/b/id/{cover_i}-L.jpg)
  ↓
Result: ~2000-5000 well-categorized books with subject relationships
```

**Rate limit strategy**: 3 req/s with identified User-Agent. Seeding ~5000 books ≈ 15,000 requests ≈ ~90 minutes. Run once, store locally.

---

## Synthesis — My Recommendation

| Criterion                   | PostgreSQL + pgvector    | Neo4j                 | PG + Redis         |
| --------------------------- | ------------------------ | --------------------- | ------------------ |
| **Graph fit**               | Decent (junction tables) | Perfect (native)      | Poor (app logic)   |
| **Recommendation queries**  | Complex SQL/CTEs         | Elegant Cypher        | Precomputed only   |
| **Real-time swipe updates** | Good                     | Excellent             | Batch              |
| **Hosting cost**            | $15–50/mo                | Free → $65/mo         | $25/mo             |
| **Ops complexity**          | Low (1 DB)               | Medium (graph + auth) | Medium (2 systems) |
| **Dev speed**               | Fast (familiar)          | Medium (new paradigm) | Fast               |

**For your use case specifically** (swipe-based discovery + related-books graph + preference algorithm):

- **If you want the best DX for graph recommendations**: **Neo4j AuraDB Free** for prototyping (200K nodes is enough for 5K+ books with relationships), paired with a lightweight PostgreSQL or SQLite for auth/user data. The "related books graph" concept maps 1:1 to Neo4j's data model.

- **If you want a single-DB pragmatic approach**: **PostgreSQL + pgvector** on Supabase or Neon. You lose the elegant graph queries but gain simplicity. Model subjects as a junction table, use pgvector for embedding-based similarity, and write the recommendation logic in SQL + application code. This is the 80/20 choice.

- **If budget is king**: **PostgreSQL + Redis** with a daily cron job that recomputes recommendation lists. Cheapest and simplest, but recommendations won't reflect the latest swipes in real-time.

### Gaps

- **Embedding generation**: If using pgvector, you'd need a strategy to generate book embeddings (OpenAI API, sentence-transformers, or simpler TF-IDF on subjects). Not researched in depth.
- **Auth**: None of the research covered auth — you'd likely add Clerk, Supabase Auth, or Firebase Auth regardless of DB choice.
- **Backend framework**: Not discussed — Node.js/Express, Fastify, or NestJS would pair well with any option. Your frontend uses RTK Query which is framework-agnostic.
