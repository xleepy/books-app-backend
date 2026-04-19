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

beforeAll(async () => {
  const book = await db.book.create({
    data: {
      openLibraryId: "OL_TEST_LIBRARY_1",
      title: "Integration Test Book",
      author: "Test Author",
    },
  });
  bookId = book.id;

  app = buildApp({ testUser: TEST_USER });
  await app.ready();
});

afterEach(async () => {
  const user = await db.user.findUnique({ where: { authId: TEST_USER.sub } });
  if (user) {
    await db.libraryItem.deleteMany({ where: { userId: user.id } });
  }
});

afterAll(async () => {
  const user = await db.user.findUnique({ where: { authId: TEST_USER.sub } });
  if (user) {
    await db.userPreferences.deleteMany({ where: { userId: user.id } });
    await db.user.delete({ where: { id: user.id } });
  }
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
      isCurrent: false,
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
      payload: { bookId: "00000000-0000-0000-0000-000000000000", status: "want" },
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
