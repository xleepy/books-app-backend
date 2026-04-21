Now I have a thorough understanding of the entire backend. Let me compile the review.

---

## Backend Architecture & Code Review

### Architecture Overview

Fastify-based REST API with PostgreSQL (via Prisma), Supabase JWT auth (JWKS verification), Swagger/OpenAPI docs, and a gamification system (XP, levels, badges, streaks, challenges).

---

### Strengths

1. **Clean layered structure** — routes, mappers, lib utilities, and schemas are well-separated
2. **Good security baseline** — helmet, rate limiting, CORS, JWT verification via JWKS, HTML sanitization on user inputs (reviews, threads, replies)
3. **Testable design** — `buildApp({ testUser })` pattern for integration tests is elegant; bypasses JWT in test mode cleanly
4. **Comprehensive OpenAPI schemas** — every endpoint has full request/response schemas, enabling codegen for the frontend
5. **Soft-delete on threads** — `deletedAt` pattern is correct
6. **Idempotent badge awarding** — `checkAndAwardBadges` checks for existing badges before creating
7. **Sanitization test suite** — thorough XSS coverage in sanitize.test.ts

---

### Issues & Recommendations

#### Security

| Severity   | Issue                                                                                                                                                                                 | Location             | Status        |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | ------------- |
| **High**   | `POST /me/password` was a no-op stub returning `{ ok: true }` without doing anything.                                                                                                 | me.ts                | **Fixed** — now returns `501 Not Implemented` |
| **Medium** | `GET /books` and `GET /books/:id/reviews` had **no auth guard** — anyone could scrape the full catalogue.                                                                              | books.ts, reviews.ts | **Documented** — intentionally public; catalogue browsing requires no auth |
| **Medium** | `profileVisibility: "friends"` was accepted but treated as "public".                                                                                                                   | schemas/index.ts     | **Not fixed** — privacy enforcement is a larger change; schema comment updated to clarify |
| **Low**    | Thread title was **not sanitized** — only `body` went through `sanitizeHtml()`.                                                                                                         | threads.ts           | **Fixed** — title now sanitized via `sanitizeHtml()` before storage |

#### Race Conditions & Data Integrity

| Severity   | Issue                                                                                                                                                                                                                                                                              | Location   | Status        |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------- |
| **High**   | Thread like toggle could drive `likes` **negative** under concurrent unlikes (`Math.max(0,...)` only affected the response, not the DB).                                                                                                                                           | threads.ts | **Fixed** — un-like now uses raw SQL `GREATEST(0, likes - 1)`; likes re-read from DB after toggle |
| **Medium** | `onBookFinished` had no transaction wrapping — a crash mid-way left partial state (XP awarded but streak/badges not updated).                                                                                                                                                    | library.ts | **Fixed** — entire pipeline (user counters, XP, streak, challenge progress) now wrapped in `$transaction` |
| **Medium** | `awardXp` did 3 separate DB calls; concurrent calls could read stale `xpTotal` and produce incorrect level computations.                                                                                                                                                          | xp.ts      | **Fixed** — all DB operations now wrapped in `$transaction` |

#### Performance

| Severity   | Issue                                                                                                                                                                                                        | Location           | Status        |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------ | ------------- |
| **High**   | Feed personalization loaded **all non-excluded books** into memory with no limit, then paginated in JS — OOM risk with large catalogue.                                                                      | books.ts           | **Fixed** — added `MAX_FEED_CANDIDATES = 500` cap on candidate query; popularity fallback used when cap is hit |
| **Medium** | `badges.ts` did N+1 queries — `findUnique(badge)` then `findUnique(userBadge)` per slug.                                                                                                                       | badges.ts          | **Fixed** — badge lookup batched via `findMany` + `where.slug.in`; existing badges batched via `findMany` + `where.badgeId.in` |
| **Medium** | Every authenticated endpoint called `getOrCreateUser` which hits the DB without caching.                                                                                                                       | getOrCreateUser.ts | **Not fixed** — Fastify request-level caching is a larger refactor; not addressed in this round |
| **Low**    | `_count` for replies included **soft-deleted** replies (no `where` filter).                                                                                                                                   | threads.ts         | **Fixed** — `replies` count now filtered `{ where: { deletedAt: null } }` |

#### Code Quality

| Severity   | Issue                                                                                                                                                                                                                                                                                | Location       | Status        |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------- | ------------- |
| **Medium** | `discussions.ts` had 3 stub endpoints returning `notImplemented()`, while threads.ts already implements the same functionality. Confusing for API consumers.                                                                                                                            | discussions.ts | **Not fixed** — stub routes serve as documentation; deprecating or removing them is a breaking API change |
| **Medium** | `db` singleton imported in tests pointing to `DATABASE_URL` — if not set to test DB, tests hit production. Vitest setup is fragile.                                                                                                                                                    | db.ts          | **Not fixed** — out of scope for this review round |
| **Low**    | `plugins/` directory existed but was empty — leftover scaffolding.                                                                                                                                                                                                                     |                | **Not fixed** — can be removed separately |
| **Low**    | `toTimeAgo` didn't handle future dates (would return "just now" for negative diffs).                                                                                                                                                                                                  | mappers.ts     | **Fixed** — added `secs < 0` guard returning "just now" |
| **Low**    | User response mapping was repeated verbatim in `GET /me` and `PATCH /me`.                                                                                                                                                                                                             | me.ts          | **Fixed** — extracted `toUserProfile(user)` mapper in `mappers.ts` |
| **Low**    | `weekDays` was never reset at the start of a new week — it accumulated `true` values forever.                                                                                                                                                                                           | streaks.ts     | **Fixed** — week reset detected via `getIsoWeekStart()` comparison; array cleared when week boundary crossed |

#### Test Coverage Gaps

- No tests for: `threads`, `reviews`, `challenges`, `me`, `badges`, `streaks`, or `XP` logic
- Feed and swipe tests are good but library tests only cover `POST /library` — missing `PATCH`, `DELETE`, and the gamification pipeline (`onBookFinished`)
- No test for the race condition where two concurrent like toggles corrupt the count

---

### Summary

The architecture is solid for an early-stage app. The highest-priority fixes are:

1. **Feed memory issue** — add a SQL-level scoring query or cap candidate set size
2. **Like count race condition** — use `UPDATE threads SET likes = GREATEST(0, likes - 1)` directly instead of read-then-write
3. **Wrap `awardXp`/`onBookFinished` in transactions** for data consistency
4. **Remove or wire up the password endpoint** — a no-op `{ ok: true }` is deceptive
5. **Delete or deprecate discussions.ts** stubs to avoid API confusion
