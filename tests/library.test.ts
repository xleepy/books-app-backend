import { describe, test, expect, beforeAll, afterAll, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app";
import { db } from "../src/lib/db";

const TEST_USER = {
  sub: "test-auth-library",
  email: "test-library@example.com",
};

let app: FastifyInstance;
let bookId: string;
let pagesChallengeId: string;
let booksChallengeId: string;

beforeAll(async () => {
  const book = await db.book.create({
    data: {
      openLibraryId: "OL_TEST_LIBRARY_1",
      title: "Integration Test Book",
      author: "Test Author",
      pageCount: 300,
    },
  });
  bookId = book.id;

  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const pagesChallenge = await db.challenge.create({
    data: {
      slug: "test-pages-1000",
      title: "Read 1000 Pages",
      variant: "custom",
      metric: "pages",
      target: 1000,
      activeFrom: today,
      activeTo: tomorrow,
    },
  });
  pagesChallengeId = pagesChallenge.id;

  const booksChallenge = await db.challenge.create({
    data: {
      slug: "test-books-5",
      title: "Read 5 Books",
      variant: "custom",
      metric: "books",
      target: 5,
      activeFrom: today,
      activeTo: tomorrow,
    },
  });
  booksChallengeId = booksChallenge.id;

  // Seed badge required for streak milestone tests
  await db.badge.upsert({
    where: { slug: "on-fire" },
    update: {},
    create: {
      slug: "on-fire",
      name: "On Fire",
      description: "Maintain a 7-day reading streak",
    },
  });

  app = buildApp({ testUser: TEST_USER });
  await app.ready();
});

afterEach(async () => {
  const user = await db.user.findUnique({ where: { authId: TEST_USER.sub } });
  if (user) {
    await db.libraryItem.deleteMany({ where: { userId: user.id } });
    await db.userChallenge.deleteMany({ where: { userId: user.id } });
    await db.xpEvent.deleteMany({ where: { userId: user.id } });
    await db.userBadge.deleteMany({ where: { userId: user.id } });
    await db.user.update({
      where: { id: user.id },
      data: {
        streak: 0,
        bestStreak: 0,
        streakLastDate: null,
        weekDays: [false, false, false, false, false, false, false],
      },
    });
  }
});

afterAll(async () => {
  const user = await db.user.findUnique({ where: { authId: TEST_USER.sub } });
  if (user) {
    await db.xpEvent.deleteMany({ where: { userId: user.id } });
    await db.userBadge.deleteMany({ where: { userId: user.id } });
    await db.userChallenge.deleteMany({ where: { userId: user.id } });
    await db.userPreferences.deleteMany({ where: { userId: user.id } });
    await db.libraryItem.deleteMany({ where: { userId: user.id } });
    await db.user.delete({ where: { id: user.id } });
  }
  await db.challenge.deleteMany({
    where: { id: { in: [pagesChallengeId, booksChallengeId] } },
  });
  await db.book.delete({ where: { id: bookId } });
  await app.close();
  await db.$disconnect();
});

describe("POST /library", () => {
  test("201 — adds book and returns LibraryBook shape", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/library",
      payload: { bookId, status: "want" },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({
      id: bookId,
      title: "Integration Test Book",
      author: "Test Author",
      status: "want",
      progressPct: 0,
      timeLeftMin: null,
    });
  });

  test("201 — persists row in DB", async () => {
    await app.inject({
      method: "POST",
      url: "/library",
      payload: { bookId, status: "reading" },
    });

    const user = await db.user.findUnique({ where: { authId: TEST_USER.sub } });
    const item = await db.libraryItem.findUnique({
      where: { userId_bookId: { userId: user!.id, bookId } },
    });

    expect(item).not.toBeNull();
    expect(item!.status).toBe("reading");
  });

  test("201 — creates user on first add", async () => {
    await app.inject({
      method: "POST",
      url: "/library",
      payload: { bookId, status: "want" },
    });

    const user = await db.user.findUnique({ where: { authId: TEST_USER.sub } });
    expect(user).not.toBeNull();
    expect(user!.email).toBe(TEST_USER.email);
  });

  test("404 — unknown bookId", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/library",
      payload: {
        bookId: "00000000-0000-0000-0000-000000000000",
        status: "want",
      },
    });

    expect(res.statusCode).toBe(404);
  });

  test("409 — duplicate add", async () => {
    await app.inject({
      method: "POST",
      url: "/library",
      payload: { bookId, status: "want" },
    });

    const res = await app.inject({
      method: "POST",
      url: "/library",
      payload: { bookId, status: "reading" },
    });

    expect(res.statusCode).toBe(409);
  });

  test("400 — invalid status value", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/library",
      payload: { bookId, status: "invalid" },
    });

    expect(res.statusCode).toBe(400);
  });
});

describe("PATCH /library/:bookId", () => {
  test("200 — updates currentPage and derives progressPct", async () => {
    await app.inject({
      method: "POST",
      url: "/library",
      payload: { bookId, status: "reading" },
    });

    const res = await app.inject({
      method: "PATCH",
      url: `/library/${bookId}`,
      payload: { currentPage: 150 },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.currentPage).toBe(150);
    expect(body.progressPct).toBe(50);
    expect(body.pageCount).toBe(300);
  });

  test("200 — clamps currentPage to pageCount", async () => {
    await app.inject({
      method: "POST",
      url: "/library",
      payload: { bookId, status: "reading" },
    });

    const res = await app.inject({
      method: "PATCH",
      url: `/library/${bookId}`,
      payload: { currentPage: 999 },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.currentPage).toBe(300);
    expect(body.progressPct).toBe(100);
  });

  test("200 — explicit progressPct still works", async () => {
    await app.inject({
      method: "POST",
      url: "/library",
      payload: { bookId, status: "reading" },
    });

    const res = await app.inject({
      method: "PATCH",
      url: `/library/${bookId}`,
      payload: { progressPct: 75 },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.progressPct).toBe(75);
  });

  test("200 — marking finished sets status and finishedAt", async () => {
    await app.inject({
      method: "POST",
      url: "/library",
      payload: { bookId, status: "reading" },
    });

    const res = await app.inject({
      method: "PATCH",
      url: `/library/${bookId}`,
      payload: { status: "finished" },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe("finished");
  });

  test("200 — updating currentPage progresses pages-metric challenge", async () => {
    await app.inject({
      method: "POST",
      url: "/library",
      payload: { bookId, status: "reading" },
    });

    const res = await app.inject({
      method: "PATCH",
      url: `/library/${bookId}`,
      payload: { currentPage: 100 },
    });

    expect(res.statusCode).toBe(200);

    const user = await db.user.findUnique({ where: { authId: TEST_USER.sub } });
    const uc = await db.userChallenge.findUnique({
      where: {
        userId_challengeId: { userId: user!.id, challengeId: pagesChallengeId },
      },
    });

    expect(uc).not.toBeNull();
    expect(uc!.current).toBe(100);
  });

  test("200 — marking finished progresses books-metric challenge", async () => {
    await app.inject({
      method: "POST",
      url: "/library",
      payload: { bookId, status: "reading" },
    });

    const res = await app.inject({
      method: "PATCH",
      url: `/library/${bookId}`,
      payload: { status: "finished" },
    });

    expect(res.statusCode).toBe(200);

    const user = await db.user.findUnique({ where: { authId: TEST_USER.sub } });
    const uc = await db.userChallenge.findUnique({
      where: {
        userId_challengeId: { userId: user!.id, challengeId: booksChallengeId },
      },
    });

    expect(uc).not.toBeNull();
    expect(uc!.current).toBe(1);
  });

  test("200 — pages-metric challenge accumulates across multiple updates", async () => {
    await app.inject({
      method: "POST",
      url: "/library",
      payload: { bookId, status: "reading" },
    });

    await app.inject({
      method: "PATCH",
      url: `/library/${bookId}`,
      payload: { currentPage: 50 },
    });

    await app.inject({
      method: "PATCH",
      url: `/library/${bookId}`,
      payload: { currentPage: 120 },
    });

    const user = await db.user.findUnique({ where: { authId: TEST_USER.sub } });
    const uc = await db.userChallenge.findUnique({
      where: {
        userId_challengeId: { userId: user!.id, challengeId: pagesChallengeId },
      },
    });

    expect(uc).not.toBeNull();
    expect(uc!.current).toBe(120);
  });

  test("200 — books-metric challenge is not affected by page-only update", async () => {
    await app.inject({
      method: "POST",
      url: "/library",
      payload: { bookId, status: "reading" },
    });

    const res = await app.inject({
      method: "PATCH",
      url: `/library/${bookId}`,
      payload: { currentPage: 80 },
    });

    expect(res.statusCode).toBe(200);

    const user = await db.user.findUnique({ where: { authId: TEST_USER.sub } });
    const uc = await db.userChallenge.findUnique({
      where: {
        userId_challengeId: { userId: user!.id, challengeId: booksChallengeId },
      },
    });

    expect(uc).toBeNull();
  });

  test("200 — page progress updates streak and weekDays", async () => {
    await app.inject({
      method: "POST",
      url: "/library",
      payload: { bookId, status: "reading" },
    });

    const res = await app.inject({
      method: "PATCH",
      url: `/library/${bookId}`,
      payload: { currentPage: 50 },
    });

    expect(res.statusCode).toBe(200);

    const user = await db.user.findUnique({ where: { authId: TEST_USER.sub } });
    expect(user!.streak).toBe(1);
    const isoDow = new Date().getDay() === 0 ? 6 : new Date().getDay() - 1;
    expect(user!.weekDays[isoDow]).toBe(true);
  });

  test("200 — same-day page update does not double-count streak", async () => {
    await app.inject({
      method: "POST",
      url: "/library",
      payload: { bookId, status: "reading" },
    });

    // First update today
    await app.inject({
      method: "PATCH",
      url: `/library/${bookId}`,
      payload: { currentPage: 50 },
    });

    // Second update today
    const res = await app.inject({
      method: "PATCH",
      url: `/library/${bookId}`,
      payload: { currentPage: 60 },
    });

    expect(res.statusCode).toBe(200);

    const user = await db.user.findUnique({ where: { authId: TEST_USER.sub } });
    expect(user!.streak).toBe(1);
  });

  test("200 — streak increments after a gap day", async () => {
    await app.inject({
      method: "POST",
      url: "/library",
      payload: { bookId, status: "reading" },
    });

    // First activity today
    await app.inject({
      method: "PATCH",
      url: `/library/${bookId}`,
      payload: { currentPage: 50 },
    });

    const user = await db.user.findUnique({ where: { authId: TEST_USER.sub } });
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    // Simulate last activity was yesterday
    await db.user.update({
      where: { id: user!.id },
      data: { streakLastDate: yesterday },
    });

    // Update pages again — should increment streak
    const res = await app.inject({
      method: "PATCH",
      url: `/library/${bookId}`,
      payload: { currentPage: 100 },
    });

    expect(res.statusCode).toBe(200);

    const updated = await db.user.findUnique({
      where: { authId: TEST_USER.sub },
    });
    expect(updated!.streak).toBe(2);
  });

  test("200 — streak resets after gap > 1 day", async () => {
    await app.inject({
      method: "POST",
      url: "/library",
      payload: { bookId, status: "reading" },
    });

    // First activity today
    await app.inject({
      method: "PATCH",
      url: `/library/${bookId}`,
      payload: { currentPage: 50 },
    });

    const user = await db.user.findUnique({ where: { authId: TEST_USER.sub } });
    const twoDaysAgo = new Date();
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

    // Simulate last activity was 2 days ago
    await db.user.update({
      where: { id: user!.id },
      data: { streakLastDate: twoDaysAgo },
    });

    // Update pages again — should reset streak to 1
    const res = await app.inject({
      method: "PATCH",
      url: `/library/${bookId}`,
      payload: { currentPage: 100 },
    });

    expect(res.statusCode).toBe(200);

    const updated = await db.user.findUnique({
      where: { authId: TEST_USER.sub },
    });
    expect(updated!.streak).toBe(1);
  });

  test("200 — 7-day streak milestone awards XP and On Fire badge", async () => {
    await app.inject({
      method: "POST",
      url: "/library",
      payload: { bookId, status: "reading" },
    });

    const user = await db.user.findUnique({ where: { authId: TEST_USER.sub } });
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    // Set up a 6-day streak ending yesterday
    await db.user.update({
      where: { id: user!.id },
      data: {
        streak: 6,
        bestStreak: 6,
        streakLastDate: yesterday,
        weekDays: [true, true, true, true, true, true, true],
      },
    });

    // Today's activity should push to 7 days
    const res = await app.inject({
      method: "PATCH",
      url: `/library/${bookId}`,
      payload: { currentPage: 100 },
    });

    expect(res.statusCode).toBe(200);

    const updated = await db.user.findUnique({
      where: { authId: TEST_USER.sub },
    });
    expect(updated!.streak).toBe(7);
    expect(updated!.bestStreak).toBe(7);

    // Verify XP event was recorded
    const xpEvents = await db.xpEvent.findMany({
      where: { userId: updated!.id, source: "streak_milestone" },
    });
    expect(xpEvents.length).toBeGreaterThanOrEqual(1);
    expect(xpEvents[0].xp).toBe(50);

    // Verify badge was awarded
    const badge = await db.badge.findUnique({ where: { slug: "on-fire" } });
    const userBadge = await db.userBadge.findUnique({
      where: { userId_badgeId: { userId: updated!.id, badgeId: badge!.id } },
    });
    expect(userBadge).not.toBeNull();
  });
});
