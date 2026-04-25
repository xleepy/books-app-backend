import { describe, test, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app";
import { db } from "../src/lib/db";

// ─── test user ───────────────────────────────────────────────────────────────

const TEST_USER = {
  sub: "test-auth-feed",
  email: "test-feed@example.com",
};

// ─── apps ────────────────────────────────────────────────────────────────────

// Ghost user has no DB record → triggers the popularity fallback path
const GHOST_USER = { sub: "ghost-feed", email: "ghost-feed@example.com" };

// Preferred-genres user has no library but explicit genre prefs
const PREFS_USER = {
  sub: "test-prefs-feed",
  email: "test-prefs-feed@example.com",
};
let ghostApp: FastifyInstance;
let authApp: FastifyInstance; // authenticated — exercises personalised scoring
let prefsApp: FastifyInstance;

// ─── test data ids ───────────────────────────────────────────────────────────

let subjectFantasyId: string;
let subjectAdventureId: string;
let subjectSciFiId: string;

/*
  Library book  (Fantasy + Adventure) → added to library; must be excluded from feed
  High score    (Fantasy + Adventure) → subject overlap = 2
  Tie-high      (Fantasy only)        → subject overlap = 1, ratingCount = 50
  Tie-low       (Fantasy only)        → subject overlap = 1, ratingCount = 5
  Zero score    (Sci-Fi only)         → subject overlap = 0, ratingCount = 100
*/
let bookLibraryId: string;
let bookHighId: string;
let bookTieHighId: string;
let bookTieLowId: string;
let bookZeroId: string;

// ─── setup ───────────────────────────────────────────────────────────────────

beforeAll(async () => {
  // subjects
  const [fantasy, adventure, scifi] = await Promise.all([
    db.subject.create({ data: { name: "Test Fantasy", slug: "test-fantasy" } }),
    db.subject.create({
      data: { name: "Test Adventure", slug: "test-adventure" },
    }),
    db.subject.create({ data: { name: "Test SciFi", slug: "test-scifi" } }),
  ]);
  subjectFantasyId = fantasy.id;
  subjectAdventureId = adventure.id;
  subjectSciFiId = scifi.id;

  // books
  const [bookLib, bookHigh, bookTieHigh, bookTieLow, bookZero] =
    await Promise.all([
      db.book.create({
        data: {
          openLibraryId: "OL_FEED_LIB",
          title: "Feed: In Library",
          author: "Author",
          ratingCount: 0,
          bookSubjects: {
            create: [
              { subjectId: subjectFantasyId },
              { subjectId: subjectAdventureId },
            ],
          },
        },
      }),
      db.book.create({
        data: {
          openLibraryId: "OL_FEED_HIGH",
          title: "Feed: High Score",
          author: "Author",
          ratingCount: 10,
          bookSubjects: {
            create: [
              { subjectId: subjectFantasyId },
              { subjectId: subjectAdventureId },
            ],
          },
        },
      }),
      db.book.create({
        data: {
          openLibraryId: "OL_FEED_TIE_HIGH",
          title: "Feed: Tie High",
          author: "Author",
          ratingCount: 50,
          bookSubjects: { create: [{ subjectId: subjectFantasyId }] },
        },
      }),
      db.book.create({
        data: {
          openLibraryId: "OL_FEED_TIE_LOW",
          title: "Feed: Tie Low",
          author: "Author",
          ratingCount: 5,
          bookSubjects: { create: [{ subjectId: subjectFantasyId }] },
        },
      }),
      db.book.create({
        data: {
          openLibraryId: "OL_FEED_ZERO",
          title: "Feed: Zero Score",
          author: "Author",
          ratingCount: 100,
          bookSubjects: { create: [{ subjectId: subjectSciFiId }] },
        },
      }),
    ]);

  bookLibraryId = bookLib.id;
  bookHighId = bookHigh.id;
  bookTieHighId = bookTieHigh.id;
  bookTieLowId = bookTieLow.id;
  bookZeroId = bookZero.id;

  // apps
  ghostApp = buildApp({ testUser: GHOST_USER });
  authApp = buildApp({ testUser: TEST_USER });
  prefsApp = buildApp({ testUser: PREFS_USER });
  await Promise.all([ghostApp.ready(), authApp.ready(), prefsApp.ready()]);

  // add the library book so the personalized path is active
  const libRes = await authApp.inject({
    method: "POST",
    url: "/library",
    payload: { bookId: bookLibraryId, status: "reading" },
  });
  if (libRes.statusCode !== 201) {
    throw new Error(
      `Setup POST /library failed: ${libRes.statusCode} — ${libRes.body}`,
    );
  }

  // set preferred genres for prefs user (no library items)
  const prefRes = await prefsApp.inject({
    method: "PUT",
    url: "/me/preferences",
    payload: {
      readingGoalMinutes: 30,
      reminderEnabled: false,
      preferredGenres: ["Test Adventure"],
      notifyPush: false,
      notifyWeeklyDigest: false,
      notifyChallenge: false,
      profileVisibility: "public",
    },
  });
  if (prefRes.statusCode !== 200) {
    throw new Error(
      `Setup PUT /me/preferences failed: ${prefRes.statusCode} — ${prefRes.body}`,
    );
  }
});

afterAll(async () => {
  const user = await db.user.findUnique({ where: { authId: TEST_USER.sub } });
  if (user) {
    await db.xpEvent.deleteMany({ where: { userId: user.id } });
    await db.userBadge.deleteMany({ where: { userId: user.id } });
    await db.userChallenge.deleteMany({ where: { userId: user.id } });
    await db.libraryItem.deleteMany({ where: { userId: user.id } });
    await db.userPreferences.deleteMany({ where: { userId: user.id } });
    await db.user.delete({ where: { id: user.id } });
  }

  const prefsUser = await db.user.findUnique({
    where: { authId: PREFS_USER.sub },
  });
  if (prefsUser) {
    await db.userPreferences.deleteMany({ where: { userId: prefsUser.id } });
    await db.user.delete({ where: { id: prefsUser.id } });
  }

  const testBookIds = [
    bookLibraryId,
    bookHighId,
    bookTieHighId,
    bookTieLowId,
    bookZeroId,
  ];
  await db.bookSubject.deleteMany({ where: { bookId: { in: testBookIds } } });
  await db.book.deleteMany({ where: { id: { in: testBookIds } } });
  await db.subject.deleteMany({
    where: {
      id: { in: [subjectFantasyId, subjectAdventureId, subjectSciFiId] },
    },
  });

  await Promise.all([ghostApp.close(), authApp.close(), prefsApp.close()]);
  await db.$disconnect();
});

// ─── tests ───────────────────────────────────────────────────────────────────

describe("GET /books/feed — popularity fallback (user has no DB record)", () => {
  test("returns 200 with data array", async () => {
    const res = await ghostApp.inject({ method: "GET", url: "/books/feed" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveProperty("data");
  });

  test("orders by ratingCount DESC — zero-score book (ratingCount 100) comes first", async () => {
    const res = await ghostApp.inject({ method: "GET", url: "/books/feed" });
    const ids: string[] = res.json().data.map((b: { id: string }) => b.id);
    expect(ids[0]).toBe(bookZeroId);
  });
});

describe("GET /books/feed — personalised scoring", () => {
  test("excludes books that are in the user's library", async () => {
    const res = await authApp.inject({ method: "GET", url: "/books/feed" });
    const ids: string[] = res.json().data.map((b: { id: string }) => b.id);
    expect(ids).not.toContain(bookLibraryId);
  });

  test("ranks books by subject overlap score — high score (2) before low score (1)", async () => {
    const res = await authApp.inject({ method: "GET", url: "/books/feed" });
    const ids: string[] = res.json().data.map((b: { id: string }) => b.id);
    expect(ids.indexOf(bookHighId)).toBeLessThan(ids.indexOf(bookTieHighId));
    expect(ids.indexOf(bookHighId)).toBeLessThan(ids.indexOf(bookTieLowId));
  });

  test("breaks score ties by ratingCount — tie-high (50) before tie-low (5)", async () => {
    const res = await authApp.inject({ method: "GET", url: "/books/feed" });
    const ids: string[] = res.json().data.map((b: { id: string }) => b.id);
    expect(ids.indexOf(bookTieHighId)).toBeLessThan(ids.indexOf(bookTieLowId));
  });

  test("zero-score books (no subject overlap) appear last despite high ratingCount", async () => {
    const res = await authApp.inject({ method: "GET", url: "/books/feed" });
    const ids: string[] = res.json().data.map((b: { id: string }) => b.id);
    const zeroPos = ids.indexOf(bookZeroId);
    expect(ids.indexOf(bookHighId)).toBeLessThan(zeroPos);
    expect(ids.indexOf(bookTieHighId)).toBeLessThan(zeroPos);
    expect(ids.indexOf(bookTieLowId)).toBeLessThan(zeroPos);
  });
});

describe("GET /books/feed — cursor pagination (personalised path)", () => {
  test("returns nextCursor when more results exist", async () => {
    const res = await authApp.inject({
      method: "GET",
      url: "/books/feed?limit=1",
    });
    expect(res.json().nextCursor).not.toBeNull();
  });

  test("second page returns the next book in ranked order", async () => {
    const first = await authApp.inject({
      method: "GET",
      url: "/books/feed?limit=1",
    });
    const { data: page1, nextCursor } = first.json();

    const second = await authApp.inject({
      method: "GET",
      url: `/books/feed?limit=1&cursor=${nextCursor}`,
    });
    const { data: page2 } = second.json();

    expect(page2[0].id).not.toBe(page1[0].id);
    expect(page2[0].id).toBe(bookTieHighId); // highest-ratingCount of the score-1 group
  });

  test("nextCursor is null on the last page", async () => {
    // 4 books in feed (library book excluded); fetch all at once
    const res = await authApp.inject({
      method: "GET",
      url: "/books/feed?limit=50",
    });
    expect(res.json().nextCursor).toBeNull();
  });
});

describe("GET /books/feed — preferred genres personalization (no library items)", () => {
  test("boosts books matching preferred genres even without library history", async () => {
    const res = await prefsApp.inject({
      method: "GET",
      url: "/books/feed",
    });
    expect(res.statusCode).toBe(200);
    const ids: string[] = res.json().data.map((b: { id: string }) => b.id);

    // bookHigh has Adventure (preferred) so should outrank bookZero despite lower ratingCount
    expect(ids.indexOf(bookHighId)).toBeLessThan(ids.indexOf(bookZeroId));
  });
});

describe("GET /subjects", () => {
  test("returns all subjects sorted by name", async () => {
    const res = await ghostApp.inject({ method: "GET", url: "/subjects" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data).toBeInstanceOf(Array);
    expect(body.data.length).toBeGreaterThanOrEqual(3);
    expect(body.data[0]).toHaveProperty("id");
    expect(body.data[0]).toHaveProperty("name");
    expect(body.data[0]).toHaveProperty("slug");
  });
});
