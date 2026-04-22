import type { FastifyInstance } from "fastify";
import { db } from "../lib/db";
import { getOrCreateUser } from "../lib/getOrCreateUser";
import { toChallenge, toLeaderboardEntry } from "../lib/mappers";

function startOfDayUTC(d: Date): Date {
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

function generateSlug(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const suffix = Math.random().toString(36).substring(2, 8);
  return `${base}-${suffix}`;
}

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

      const data = users.map((u, i) => toLeaderboardEntry(u, i + 1, currentUser.id));

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
            enum: ["active", "monthly", "yearly", "weekly", "custom"],
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
        filter?: "active" | "monthly" | "yearly" | "weekly" | "custom";
      };
      const { sub, email, user_metadata } = request.user;
      const user = await getOrCreateUser(
        sub,
        email,
        user_metadata?.full_name ?? user_metadata?.name
      );

      const today = startOfDayUTC(new Date());
      const variantFilter =
        filter === "monthly" || filter === "yearly" || filter === "weekly" || filter === "custom"
          ? filter
          : undefined;

      const challenges = await db.challenge.findMany({
        where: {
          activeTo: { gte: today },
          ...(variantFilter ? { variant: variantFilter } : {}),
        },
        include: { badge: true, creator: true },
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

      // Load participant counts
      const participantCounts = await db.userChallenge.groupBy({
        by: ["challengeId"],
        where: { challengeId: { in: challenges.map((c) => c.id) } },
        _count: { challengeId: true },
      });
      const countMap = new Map(
        participantCounts.map((pc) => [pc.challengeId, pc._count.challengeId])
      );

      const data = challenges.map((c) =>
        toChallenge(
          c,
          progressMap.get(c.id) ?? 0,
          progressMap.has(c.id),
          c.creatorId === user.id,
          countMap.get(c.id) ?? 0,
        ),
      );

      return reply.send({ data });
    },
  });

  // ─── Create challenge ──────────────────────────────────────────────────────

  app.post("/challenges", {
    schema: {
      tags: ["challenges"],
      summary: "Create a new reading challenge",
      security: [{ bearerAuth: [] }],
      body: { $ref: "CreateChallengeBody" },
      response: {
        201: {
          type: "object",
          required: ["data"],
          properties: {
            data: { $ref: "Challenge" },
          },
        },
        400: { $ref: "ApiError" },
        401: { $ref: "ApiError" },
        404: { $ref: "ApiError" },
      },
    },
    preHandler: [app.authenticate],
    handler: async (request, reply) => {
      const body = request.body as {
        title: string;
        description?: string;
        variant: string;
        metric: string;
        target: number;
        activeFrom: string;
        activeTo: string;
        badgeId?: string;
      };

      const { sub, email, user_metadata } = request.user;
      const user = await getOrCreateUser(
        sub,
        email,
        user_metadata?.full_name ?? user_metadata?.name
      );

      if (body.badgeId) {
        const badge = await db.badge.findUnique({ where: { id: body.badgeId } });
        if (!badge) return reply.notFound("Badge not found");
      }

      const activeFrom = startOfDayUTC(new Date(body.activeFrom));
      const activeTo = startOfDayUTC(new Date(body.activeTo));
      const today = startOfDayUTC(new Date());

      if (activeFrom < today) {
        return reply.badRequest("activeFrom must be today or later");
      }
      if (activeTo <= activeFrom) {
        return reply.badRequest("activeTo must be after activeFrom");
      }

      const challenge = await db.challenge.create({
        data: {
          slug: generateSlug(body.title),
          title: body.title,
          description: body.description ?? null,
          variant: body.variant,
          metric: body.metric,
          target: body.target,
          creatorId: user.id,
          badgeId: body.badgeId ?? null,
          activeFrom,
          activeTo,
        },
        include: { badge: true, creator: true },
      });

      // Auto-join creator
      await db.userChallenge.create({
        data: {
          userId: user.id,
          challengeId: challenge.id,
          current: 0,
        },
      });

      const data = toChallenge(challenge, 0, true, true, 1);
      return reply.status(201).send({ data });
    },
  });

  // ─── Get challenge by id ───────────────────────────────────────────────────

  app.get("/challenges/:id", {
    schema: {
      tags: ["challenges"],
      summary: "Get challenge details by ID",
      security: [{ bearerAuth: [] }],
      params: {
        type: "object",
        required: ["id"],
        properties: { id: { type: "string" } },
      },
      response: {
        200: {
          type: "object",
          required: ["data"],
          properties: {
            data: { $ref: "Challenge" },
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

      const challenge = await db.challenge.findUnique({
        where: { id },
        include: { badge: true, creator: true },
      });
      if (!challenge) return reply.notFound("Challenge not found");

      const uc = await db.userChallenge.findUnique({
        where: { userId_challengeId: { userId: user.id, challengeId: id } },
      });

      const participantCount = await db.userChallenge.count({
        where: { challengeId: id },
      });

      const data = toChallenge(
        challenge,
        uc?.current ?? 0,
        uc != null,
        challenge.creatorId === user.id,
        participantCount,
      );

      return reply.send({ data });
    },
  });

  // ─── Delete challenge ──────────────────────────────────────────────────────

  app.delete("/challenges/:id", {
    schema: {
      tags: ["challenges"],
      summary: "Delete a challenge (creator only)",
      security: [{ bearerAuth: [] }],
      params: {
        type: "object",
        required: ["id"],
        properties: { id: { type: "string" } },
      },
      response: {
        204: { type: "null" },
        401: { $ref: "ApiError" },
        403: { $ref: "ApiError" },
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
      if (challenge.creatorId !== user.id) {
        return reply.forbidden("Only the creator can delete this challenge");
      }

      await db.challenge.delete({ where: { id } });
      return reply.status(204).send();
    },
  });

  // ─── Join challenge ────────────────────────────────────────────────────────

  app.post("/challenges/:id/join", {
    schema: {
      tags: ["challenges"],
      summary: "Join a challenge",
      security: [{ bearerAuth: [] }],
      params: {
        type: "object",
        required: ["id"],
        properties: { id: { type: "string" } },
      },
      response: {
        200: {
          type: "object",
          required: ["data"],
          properties: {
            data: {
              type: "object",
              required: ["challengeId", "current", "completed"],
              properties: {
                challengeId: { type: "string" },
                current: { type: "integer" },
                completed: { type: "boolean" },
                completedAt: { type: "string", nullable: true },
              },
            },
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

      const existing = await db.userChallenge.findUnique({
        where: { userId_challengeId: { userId: user.id, challengeId: id } },
      });

      if (existing) {
        return reply.send({
          data: {
            challengeId: id,
            current: existing.current,
            completed: existing.completedAt != null,
            completedAt: existing.completedAt?.toISOString() ?? null,
          },
        });
      }

      const uc = await db.userChallenge.create({
        data: {
          userId: user.id,
          challengeId: id,
          current: 0,
        },
      });

      return reply.send({
        data: {
          challengeId: id,
          current: uc.current,
          completed: false,
          completedAt: null,
        },
      });
    },
  });

  // ─── Leave challenge ───────────────────────────────────────────────────────

  app.post("/challenges/:id/leave", {
    schema: {
      tags: ["challenges"],
      summary: "Leave a challenge",
      security: [{ bearerAuth: [] }],
      params: {
        type: "object",
        required: ["id"],
        properties: { id: { type: "string" } },
      },
      response: {
        204: { type: "null" },
        401: { $ref: "ApiError" },
        403: { $ref: "ApiError" },
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
      if (challenge.creatorId === user.id) {
        return reply.forbidden("Creator cannot leave their own challenge");
      }

      await db.userChallenge.delete({
        where: { userId_challengeId: { userId: user.id, challengeId: id } },
      });

      return reply.status(204).send();
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

      const data = entries.map((e, i) =>
        toLeaderboardEntry(
          { id: e.user.id, name: e.user.name, level: e.user.level, levelTitle: e.user.levelTitle, booksFinished: e.current, xpTotal: e.user.xpTotal, avatarHue: e.user.avatarHue },
          i + 1,
          currentUser.id,
        ),
      );

      return reply.send({ data });
    },
  });
}
