import type { FastifyInstance } from "fastify";
import { db } from "../lib/db";
import { getOrCreateUser } from "../lib/getOrCreateUser";

export async function challengesRoute(app: FastifyInstance) {
  // ─── Global leaderboard ────────────────────────────────────────────────────

  app.get("/leaderboard", {
    schema: {
      tags: ["challenges"],
      summary: "Global leaderboard ranked by XP",
      security: [{ bearerAuth: [] }],
      querystring: {
        type: "object",
        properties: {
          limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
        },
      },
      response: {
        200: {
          type: "object",
          required: ["data"],
          properties: {
            data: { type: "array", items: { $ref: "LeaderboardEntry" } },
          },
        },
        401: { $ref: "ApiError" },
      },
    },
    preHandler: [app.authenticate],
    handler: async (request, reply) => {
      const { limit = 20 } = request.query as { limit?: number };
      const { sub, email, user_metadata } = request.user;
      const currentUser = await getOrCreateUser(
        sub,
        email,
        user_metadata?.full_name ?? user_metadata?.name
      );

      const users = await db.user.findMany({
        orderBy: [{ xpTotal: "desc" }, { booksFinished: "desc" }],
        take: limit,
      });

      const data = users.map((u, i) => ({
        id: u.id,
        rank: i + 1,
        name: u.name,
        level: u.level,
        levelTitle: u.levelTitle,
        books: u.booksFinished,
        xp: u.xpTotal,
        isYou: u.id === currentUser.id,
        avatarHue: u.avatarHue,
      }));

      return reply.send({ data });
    },
  });

  // ─── List challenges ────────────────────────────────────────────────────────

  app.get("/challenges", {
    schema: {
      tags: ["challenges"],
      summary: "List active reading challenges with user progress",
      security: [{ bearerAuth: [] }],
      querystring: {
        type: "object",
        properties: {
          filter: {
            type: "string",
            enum: ["active", "monthly", "yearly"],
            default: "active",
          },
        },
      },
      response: {
        200: {
          type: "object",
          required: ["data"],
          properties: {
            data: { type: "array", items: { $ref: "Challenge" } },
          },
        },
        401: { $ref: "ApiError" },
      },
    },
    preHandler: [app.authenticate],
    handler: async (request, reply) => {
      const { filter = "active" } = request.query as {
        filter?: "active" | "monthly" | "yearly";
      };
      const { sub, email, user_metadata } = request.user;
      const user = await getOrCreateUser(
        sub,
        email,
        user_metadata?.full_name ?? user_metadata?.name
      );

      const today = new Date();
      const variantFilter = filter === "monthly" || filter === "yearly" ? filter : undefined;

      const challenges = await db.challenge.findMany({
        where: {
          activeFrom: { lte: today },
          activeTo: { gte: today },
          ...(variantFilter ? { variant: variantFilter } : {}),
        },
        include: { badge: true },
        orderBy: [{ variant: "asc" }, { activeFrom: "desc" }],
      });

      // Load user's progress for these challenges in one query
      const userChallenges = await db.userChallenge.findMany({
        where: {
          userId: user.id,
          challengeId: { in: challenges.map((c) => c.id) },
        },
      });
      const progressMap = new Map(
        userChallenges.map((uc) => [uc.challengeId, uc.current])
      );

      const data = challenges.map((c) => ({
        id: c.id,
        title: c.title,
        subtitle: c.subtitle ?? "",
        goal: c.goal ?? "",
        current: progressMap.get(c.id) ?? 0,
        target: c.target,
        badgeText: c.badge?.name ?? "",
        variant: c.variant as "monthly" | "yearly",
      }));

      return reply.send({ data });
    },
  });

  // ─── Per-challenge progress ─────────────────────────────────────────────────

  app.get("/challenges/:id/progress", {
    schema: {
      tags: ["challenges"],
      summary: "Get authenticated user's progress for a specific challenge",
      security: [{ bearerAuth: [] }],
      params: {
        type: "object",
        required: ["id"],
        properties: { id: { type: "string" } },
      },
      response: {
        200: {
          type: "object",
          required: ["challengeId", "current", "target", "completed"],
          properties: {
            challengeId: { type: "string" },
            current: { type: "integer" },
            target: { type: "integer" },
            completed: { type: "boolean" },
            completedAt: { type: "string", nullable: true },
          },
        },
        401: { $ref: "ApiError" },
        404: { $ref: "ApiError" },
      },
    },
    preHandler: [app.authenticate],
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };
      const { sub, email, user_metadata } = request.user;
      const user = await getOrCreateUser(
        sub,
        email,
        user_metadata?.full_name ?? user_metadata?.name
      );

      const challenge = await db.challenge.findUnique({ where: { id } });
      if (!challenge) return reply.notFound("Challenge not found");

      const uc = await db.userChallenge.findUnique({
        where: { userId_challengeId: { userId: user.id, challengeId: id } },
      });

      return reply.send({
        challengeId: id,
        current: uc?.current ?? 0,
        target: challenge.target,
        completed: uc?.completedAt != null,
        completedAt: uc?.completedAt?.toISOString() ?? null,
      });
    },
  });

  // ─── Per-challenge leaderboard ──────────────────────────────────────────────

  app.get("/challenges/:id/leaderboard", {
    schema: {
      tags: ["challenges"],
      summary: "Get the leaderboard for a specific challenge (ranked by progress)",
      security: [{ bearerAuth: [] }],
      params: {
        type: "object",
        required: ["id"],
        properties: { id: { type: "string" } },
      },
      querystring: {
        type: "object",
        properties: {
          limit: { type: "integer", minimum: 1, maximum: 100, default: 50 },
        },
      },
      response: {
        200: {
          type: "object",
          required: ["data"],
          properties: {
            data: { type: "array", items: { $ref: "LeaderboardEntry" } },
          },
        },
        401: { $ref: "ApiError" },
        404: { $ref: "ApiError" },
      },
    },
    preHandler: [app.authenticate],
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };
      const { limit = 50 } = request.query as { limit?: number };
      const { sub, email, user_metadata } = request.user;
      const currentUser = await getOrCreateUser(
        sub,
        email,
        user_metadata?.full_name ?? user_metadata?.name
      );

      const challenge = await db.challenge.findUnique({ where: { id } });
      if (!challenge) return reply.notFound("Challenge not found");

      const entries = await db.userChallenge.findMany({
        where: { challengeId: id },
        orderBy: [{ current: "desc" }],
        take: limit,
        include: { user: true },
      });

      const data = entries.map((e, i) => ({
        id: e.user.id,
        rank: i + 1,
        name: e.user.name,
        level: e.user.level,
        levelTitle: e.user.levelTitle,
        books: e.current,
        xp: e.user.xpTotal,
        isYou: e.user.id === currentUser.id,
        avatarHue: e.user.avatarHue,
      }));

      return reply.send({ data });
    },
  });
}
