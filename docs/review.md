# Architecture Review — Books App Backend

## Data Model Inaccuracies

The doc's description of the current frontend models has several mismatches with what's actually in the code:

| Entity | Doc says | Code actually has |
| --- | --- | --- |
| **Book** | `cover` (local image), `genres`, `pages`, `published`, `synopsis`, `tags` | `cover` (BookCoverKey), no `genres`, no `pages`, no `published`, `description` not `synopsis`, `tags` exists, plus `reviewCount` |
| **User** | `avatar`, `xp`, `booksRead`, `currentStreak`, `longestStreak`, `readingGoal`, `badges` | `avatarHue` (number), `xpCurrent`/`xpRequired` (split), reading stats live in a separate `ReadingStats` interface (`streak`, `bestStreak`, `booksFinished`), no `badges` field |
| **Review** | `bookId`, `userName` | `reviewer` (no `bookId`, no `userName`) |
| **Discussion** | `bookCover`, `bookTitle`, `timestamp` | Type is actually named `Thread`, uses `cover` (BookCoverKey) + `bookContext`, `timeAgo` not `timestamp`, plus `spoiler?` and `liked?` flags |
| **Challenge** | `type`, `progress`, `total`, `deadline`, `members`, `leaderboard` | `variant`, `current`/`target` (not progress/total), `goal`, `badgeText`, `subtitle` — no `deadline` or `members`; `LeaderboardEntry` is a separate type |

The RTK Query setup uses `fakeBaseQuery()`, not `baseUrl: ''` as claimed. That's a meaningful difference — `fakeBaseQuery` means there's no HTTP layer wired up at all, not just an empty base URL.

These inaccuracies matter because the backend schema design should align with the actual frontend types, or the doc should explicitly call out where the backend will diverge and require frontend changes.

---

## What's Good

- **Open Library API research is solid.** The endpoint breakdown, rate limits, and the key insight about no "similar books" API are accurate and useful. The seeding strategy via the Subjects API is smart.
- **The recommendation pipeline design** (section 4) is well-layered. The swipe signal mapping with weighted scores is a practical starting point. The diversity factor mention is important to avoid filter bubbles.
- **The 3-option comparison is fair.** Tradeoffs are honestly presented without overselling any single option.

---

## Concerns & Suggestions

**On the Neo4j recommendation:** The doc leans toward Neo4j for prototyping, but the app is a React Native/Expo project with Redux Toolkit. Adding Neo4j + a secondary Postgres for auth means two databases, a Cypher learning curve, and more deployment complexity — for a prototype. The 200K node free tier is generous, but you'd outgrow it fast if you add users+swipes+relationships. The jump to $65/month is steep.

**PostgreSQL + pgvector is likely the better fit** for where this project is now. The data is already relational (the FSD architecture, Redux slices, type definitions all model flat entities with references). The junction-table approach for subjects maps naturally. And the "verbose recursive CTEs" concern is overstated — for 2-3 hop traversals on 5K books, a well-indexed Postgres query will be fast and maintainable.

**The embedding pipeline gap is undersold.** The doc flags it as a gap but pgvector is useless without embeddings. You'd need to decide:

- Use OpenAI's embedding API (adds cost + external dependency)
- Run sentence-transformers locally (adds infra)
- Skip vectors entirely and use subject/author junction tables with scoring queries

For a prototype, the non-vector content-based approach (shared subjects + author overlap + collaborative filtering via SQL) might be sufficient without any ML pipeline at all.

**Missing from the doc:**

- **Backend framework choice** — acknowledged as a gap, but it should be decided alongside the DB since it affects ORM choice, migration tooling, and deployment
- **How the frontend will transition** — the swipe slice currently indexes into a static `mockBooks` array, and the library slice stores `Book[]` directly in Redux. Moving to API-backed data means reworking both slices to use RTK Query (which is already stubbed out with `fakeBaseQuery`)
- **Auth** — acknowledged gap, but it's load-bearing: the recommendation engine needs user identity from day one

---

## Recommendation

The research is thorough but the data model section needs a correction pass against the actual code. For the current stage (Expo/RN prototype, swipe-based UX), the suggested path is:

**Start with Postgres without pgvector.** Use subject/author junction tables for content-based recommendations, add collaborative filtering via SQL as real user data accumulates, and only introduce embeddings later if the simpler approach plateaus. One database, one framework, ship fast.
