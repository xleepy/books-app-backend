import { describe, test, expect, beforeAll, afterAll, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app";
import { db } from "../src/lib/db";

// ─── test users ──────────────────────────────────────────────────────────────

const TEST_USER = { sub: "test-auth-swipes", email: "test-swipes@example.com" };

// Ghost user triggers the popularity fallback (no DB record → no library items)
const GHOST_USER = { sub: "ghost-swipes", email: "ghost-swipes@example.com" };

let app: FastifyInstance;
let ghostApp: FastifyInstance;

// ─── test data ids ───────────────────────────────────────────────────────────

let subjectId: string;
let bookAId: string;   // will be left-swiped
let bookBId: string;   // will be right-swiped
let bookCId: string;   // control — never swiped
let bookLibId: string; // added to library (activates personalization scoring)

// ─── setup ───────────────────────────────────────────────────────────────────

beforeAll(async () => {
  const subject = await db.subject.create({
    data: { name: "Test Swipe Subject", slug: "test-swipe-subject" },
  });
  subjectId = subject.id;

  const [bookA, bookB, bookC, bookLib] = await Promise.all([
    db.book.create({
      data: {
        openLibraryId: "OL_SWIPE_A",
        title: "Swipe: Book A (left)",
        author: "Author",
        ratingCount: 10,
        bookSubjects: { create: [{ subjectId }] },
      },
    }),
    db.book.create({
      data: {
        openLibraryId: "OL_SWIPE_B",
        title: "Swipe: Book B (right)",
        author: "Author",
        ratingCount: 10,
        bookSubjects: { create: [{ subjectId }] },
      },
    }),
    db.book.create({
      data: {
        openLibraryId: "OL_SWIPE_C",
        title: "Swipe: Book C (control)",
        author: "Author",
        ratingCount: 10,
        bookSubjects: { create: [{ subjectId }] },
      },
    }),
    db.book.create({
      data: {
        openLibraryId: "OL_SWIPE_LIB",
        title: "Swipe: Library Book",
        author: "Author",
        ratingCount: 0,
        bookSubjects: { create: [{ subjectId }] },
      },
    }),
  ]);

  bookAId = bookA.id;
  bookBId = bookB.id;
  bookCId = bookC.id;
  bookLibId = bookLib.id;

  app = buildApp({ testUser: TEST_USER });
  ghostApp = buildApp({ testUser: GHOST_USER });
  await Promise.all([app.ready(), ghostApp.ready()]);
});

afterEach(async () => {
  const user = await db.user.findUnique({ where: { authId: TEST_USER.sub } });
  if (user) {
    await db.swipe.deleteMany({ where: { userId: user.id } });
    await db.libraryItem.deleteMany({ where: { userId: user.id } });
  }
});

afterAll(async () => {
  const user = await db.user.findUnique({ where: { authId: TEST_USER.sub } });
  if (user) {
    await db.xpEvent.deleteMany({ where: { userId: user.id } });
    await db.userBadge.deleteMany({ where: { userId: user.id } });
    await db.userChallenge.deleteMany({ where: { userId: user.id } });
    await db.userPreferences.deleteMany({ where: { userId: user.id } });
    await db.swipe.deleteMany({ where: { userId: user.id } });
    await db.libraryItem.deleteMany({ where: { userId: user.id } });
    await db.user.delete({ where: { id: user.id } });
  }

  const testBookIds = [bookAId, bookBId, bookCId, bookLibId];
  await db.bookSubject.deleteMany({ where: { bookId: { in: testBookIds } } });
  await db.book.deleteMany({ where: { id: { in: testBookIds } } });
  await db.subject.deleteMany({ where: { id: subjectId } });

  await Promise.all([app.close(), ghostApp.close()]);
  await db.$disconnect();
});

// ─── tests ───────────────────────────────────────────────────────────────────

describe("POST /swipes", () => {
  test("204 — records a left swipe", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/swipes",
      payload: { bookId: bookAId, direction: "left" },
    });
    expect(res.statusCode).toBe(204);
  });

  test("204 — records a right swipe", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/swipes",
      payload: { bookId: bookBId, direction: "right" },
    });
    expect(res.statusCode).toBe(204);
  });

  test("persists swipe direction in DB", async () => {
    await app.inject({
      method: "POST",
      url: "/swipes",
      payload: { bookId: bookAId, direction: "left" },
    });

    const user = await db.user.findUnique({ where: { authId: TEST_USER.sub } });
    const swipe = await db.swipe.findUnique({
      where: { userId_bookId: { userId: user!.id, bookId: bookAId } },
    });
    expect(swipe).not.toBeNull();
    expect(swipe!.direction).toBe("left");
  });

  test("upsert — re-swiping the same book updates the direction", async () => {
    await app.inject({
      method: "POST",
      url: "/swipes",
      payload: { bookId: bookAId, direction: "left" },
    });
    await app.inject({
      method: "POST",
      url: "/swipes",
      payload: { bookId: bookAId, direction: "right" },
    });

    const user = await db.user.findUnique({ where: { authId: TEST_USER.sub } });
    const swipe = await db.swipe.findUnique({
      where: { userId_bookId: { userId: user!.id, bookId: bookAId } },
    });
    expect(swipe!.direction).toBe("right");
  });

  test("404 — unknown bookId", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/swipes",
      payload: { bookId: "00000000-0000-0000-0000-000000000000", direction: "left" },
    });
    expect(res.statusCode).toBe(404);
  });

  test("400 — invalid direction", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/swipes",
      payload: { bookId: bookAId, direction: "up" },
    });
    expect(res.statusCode).toBe(400);
  });

  test("400 — missing bookId", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/swipes",
      payload: { direction: "left" },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("GET /books/feed — left-swipe exclusions", () => {
  test("left-swiped book is excluded from the feed (fallback path)", async () => {
    await app.inject({
      method: "POST",
      url: "/swipes",
      payload: { bookId: bookAId, direction: "left" },
    });

    const res = await app.inject({ method: "GET", url: "/books/feed" });
    const ids: string[] = res.json().data.map((b: { id: string }) => b.id);
    expect(ids).not.toContain(bookAId);
  });

  test("right-swiped book is NOT excluded from the feed", async () => {
    await app.inject({
      method: "POST",
      url: "/swipes",
      payload: { bookId: bookBId, direction: "right" },
    });

    const res = await app.inject({ method: "GET", url: "/books/feed" });
    const ids: string[] = res.json().data.map((b: { id: string }) => b.id);
    expect(ids).toContain(bookBId);
  });

  test("un-swiped books remain in the feed", async () => {
    await app.inject({
      method: "POST",
      url: "/swipes",
      payload: { bookId: bookAId, direction: "left" },
    });

    const res = await app.inject({ method: "GET", url: "/books/feed" });
    const ids: string[] = res.json().data.map((b: { id: string }) => b.id);
    expect(ids).toContain(bookCId);
  });

  test("left-swiped books stay excluded across multiple swipes", async () => {
    await Promise.all([
      app.inject({ method: "POST", url: "/swipes", payload: { bookId: bookAId, direction: "left" } }),
      app.inject({ method: "POST", url: "/swipes", payload: { bookId: bookBId, direction: "left" } }),
    ]);

    const res = await app.inject({ method: "GET", url: "/books/feed" });
    const ids: string[] = res.json().data.map((b: { id: string }) => b.id);
    expect(ids).not.toContain(bookAId);
    expect(ids).not.toContain(bookBId);
    expect(ids).toContain(bookCId);
  });
});

describe("GET /books/feed — swipes + library combined exclusions", () => {
  test("left-swiped books and library books are both excluded from the personalised feed", async () => {
    // Add library book to activate personalised scoring
    await app.inject({
      method: "POST",
      url: "/library",
      payload: { bookId: bookLibId, status: "want" },
    });
    // Pass on book A
    await app.inject({
      method: "POST",
      url: "/swipes",
      payload: { bookId: bookAId, direction: "left" },
    });

    const res = await app.inject({ method: "GET", url: "/books/feed" });
    const ids: string[] = res.json().data.map((b: { id: string }) => b.id);
    expect(ids).not.toContain(bookLibId);
    expect(ids).not.toContain(bookAId);
  });

  test("swipes do not affect subject-scoring — only library books drive personalisation", async () => {
    // Add library book (same subject as all test books) → activates personalised path
    await app.inject({
      method: "POST",
      url: "/library",
      payload: { bookId: bookLibId, status: "want" },
    });
    // Right-swipe book B — should NOT change subject scoring, book B still scored
    await app.inject({
      method: "POST",
      url: "/swipes",
      payload: { bookId: bookBId, direction: "right" },
    });

    const res = await app.inject({ method: "GET", url: "/books/feed" });
    const ids: string[] = res.json().data.map((b: { id: string }) => b.id);
    // Book B is in the feed and still scored by subject overlap
    expect(ids).toContain(bookBId);
    expect(ids).toContain(bookCId);
  });

  test("direction change from left to right re-includes book in the feed", async () => {
    await app.inject({
      method: "POST",
      url: "/swipes",
      payload: { bookId: bookAId, direction: "left" },
    });
    // Change mind — swipe right
    await app.inject({
      method: "POST",
      url: "/swipes",
      payload: { bookId: bookAId, direction: "right" },
    });

    const res = await app.inject({ method: "GET", url: "/books/feed" });
    const ids: string[] = res.json().data.map((b: { id: string }) => b.id);
    expect(ids).toContain(bookAId);
  });
});

describe("GET /books/feed — subject scoring uses only library subjects, not swipe subjects", () => {
  // Two disjoint subjects: X lives on the left-swiped book; Y lives on the library book.
  // candidateX (subjectX-only, high ratingCount) should NOT be boosted after the fix because
  // left-swiped books must not contribute to the subject frequency map.
  // candidateY (subjectY-only, low ratingCount) SHOULD be boosted by the library book's subject
  // and therefore appear first despite a lower ratingCount.
  let subjectXId: string;
  let subjectYId: string;
  let srcLeftId: string;    // left-swiped source — has subjectX
  let srcLibId: string;     // library source   — has subjectY (activates personalisation)
  let candidateXId: string; // shares subjectX with the left-swiped book
  let candidateYId: string; // shares subjectY with the library book

  beforeAll(async () => {
    const [subjectX, subjectY] = await Promise.all([
      db.subject.create({ data: { name: "Scoring Subject X", slug: "scoring-subject-x" } }),
      db.subject.create({ data: { name: "Scoring Subject Y", slug: "scoring-subject-y" } }),
    ]);
    subjectXId = subjectX.id;
    subjectYId = subjectY.id;

    const [srcLeft, srcLib, candidateX, candidateY] = await Promise.all([
      db.book.create({ data: { openLibraryId: "OL_SCORE_SRC_LEFT", title: "Score: Src Left", author: "A", ratingCount: 50, bookSubjects: { create: [{ subjectId: subjectXId }] } } }),
      db.book.create({ data: { openLibraryId: "OL_SCORE_SRC_LIB",  title: "Score: Src Lib",  author: "A", ratingCount: 10, bookSubjects: { create: [{ subjectId: subjectYId }] } } }),
      db.book.create({ data: { openLibraryId: "OL_SCORE_CAND_X",   title: "Score: Candidate X", author: "A", ratingCount: 50, bookSubjects: { create: [{ subjectId: subjectXId }] } } }),
      db.book.create({ data: { openLibraryId: "OL_SCORE_CAND_Y",   title: "Score: Candidate Y", author: "A", ratingCount: 5,  bookSubjects: { create: [{ subjectId: subjectYId }] } } }),
    ]);
    srcLeftId    = srcLeft.id;
    srcLibId     = srcLib.id;
    candidateXId = candidateX.id;
    candidateYId = candidateY.id;
  });

  afterAll(async () => {
    const ids = [srcLeftId, srcLibId, candidateXId, candidateYId];
    await db.bookSubject.deleteMany({ where: { bookId: { in: ids } } });
    await db.book.deleteMany({ where: { id: { in: ids } } });
    await db.subject.deleteMany({ where: { id: { in: [subjectXId, subjectYId] } } });
  });

  test("left-swiped book subjects do not boost candidates — only library book subjects score", async () => {
    // Add library book (subjectY) to activate personalised path
    await app.inject({ method: "POST", url: "/library", payload: { bookId: srcLibId, status: "want" } });
    // Left-swipe the subjectX book — its subject must NOT feed into scoring
    await app.inject({ method: "POST", url: "/swipes", payload: { bookId: srcLeftId, direction: "left" } });

    const res = await app.inject({ method: "GET", url: "/books/feed" });
    const ids: string[] = res.json().data.map((b: { id: string }) => b.id);

    const idxX = ids.indexOf(candidateXId);
    const idxY = ids.indexOf(candidateYId);

    // candidateY (ratingCount=5, subjectY score=1) must rank above
    // candidateX (ratingCount=50, subjectX score=0) — proving left-swipe subjects don't score
    expect(idxY).toBeGreaterThan(-1);
    expect(idxX).toBeGreaterThan(-1);
    expect(idxY).toBeLessThan(idxX);
  });
});
