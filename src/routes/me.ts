import type { FastifyInstance } from "fastify";
import { db } from "../lib/db";
import { toLibraryBook, toUserProfile, toPreferences, toUserBadge } from "../lib/mappers";
import { getOrCreateUser } from "../lib/getOrCreateUser";

const bookInclude = { bookSubjects: { include: { subject: true } } } as const;

export async function meRoute(app: FastifyInstance) {
  app.get("/me", {
    schema: {
      tags: ["me"],
      summary: "Get authenticated user's profile, reading stats, and preferences",
      security: [{ bearerAuth: [] }],
      response: {
        200: { $ref: "User" },
        401: { $ref: "ApiError" },
      },
    },
    preHandler: [app.authenticate],
    handler: async (request, reply) => {
      const { sub, email, user_metadata } = request.user;
      const user = await getOrCreateUser(sub, email, user_metadata?.full_name ?? user_metadata?.name);
      return reply.send(toUserProfile(user));
    },
  });

  app.patch("/me", {
    schema: {
      tags: ["me"],
      summary: "Update profile fields",
      security: [{ bearerAuth: [] }],
      body: {
        type: "object",
        properties: {
          name: { type: "string", minLength: 1 },
          avatarHue: { type: "integer", minimum: 0, maximum: 360 },
          readingGoal: { type: "integer", minimum: 1 },
        },
      },
      response: {
        200: { $ref: "User" },
        401: { $ref: "ApiError" },
      },
    },
    preHandler: [app.authenticate],
    handler: async (request, reply) => {
      const { sub, email, user_metadata } = request.user;
      const user = await getOrCreateUser(sub, email, user_metadata?.full_name ?? user_metadata?.name);
      const { name, avatarHue, readingGoal } = request.body as {
        name?: string;
        avatarHue?: number;
        readingGoal?: number;
      };

      const updated = await db.user.update({
        where: { id: user.id },
        data: {
          ...(name !== undefined && { name }),
          ...(avatarHue !== undefined && { avatarHue }),
          ...(readingGoal !== undefined && { readingGoal }),
        },
      });

      return reply.send(toUserProfile(updated));
    },
  });

  app.get("/me/preferences", {
    schema: {
      tags: ["me"],
      summary: "Get notification and reading preferences",
      security: [{ bearerAuth: [] }],
      response: {
        200: { $ref: "Preferences" },
        401: { $ref: "ApiError" },
      },
    },
    preHandler: [app.authenticate],
    handler: async (request, reply) => {
      const { sub, email, user_metadata } = request.user;
      const user = await getOrCreateUser(sub, email, user_metadata?.full_name ?? user_metadata?.name);

      let prefs = await db.userPreferences.findUnique({ where: { userId: user.id } });
      if (!prefs) {
        prefs = await db.userPreferences.create({ data: { userId: user.id } });
      }

      return reply.send(toPreferences(prefs));
    },
  });

  app.put("/me/preferences", {
    schema: {
      tags: ["me"],
      summary: "Replace preferences (full update)",
      security: [{ bearerAuth: [] }],
      body: { $ref: "Preferences" },
      response: {
        200: { $ref: "Preferences" },
        401: { $ref: "ApiError" },
      },
    },
    preHandler: [app.authenticate],
    handler: async (request, reply) => {
      const { sub, email, user_metadata } = request.user;
      const user = await getOrCreateUser(sub, email, user_metadata?.full_name ?? user_metadata?.name);
      const body = request.body as {
        readingGoalMinutes: number;
        reminderTime?: string | null;
        reminderEnabled: boolean;
        preferredGenres: string[];
        notifyPush: boolean;
        notifyWeeklyDigest: boolean;
        notifyChallenge: boolean;
        profileVisibility: string;
      };

      const prefs = await db.userPreferences.upsert({
        where: { userId: user.id },
        create: { userId: user.id, ...body },
        update: body,
      });

      return reply.send(toPreferences(prefs));
    },
  });

  app.post("/me/password", {
    schema: {
      tags: ["me"],
      summary: "Change password (email/password users only) — delegates to Supabase client-side",
      security: [{ bearerAuth: [] }],
      body: {
        type: "object",
        required: ["currentPassword", "newPassword"],
        properties: {
          currentPassword: { type: "string" },
          newPassword: { type: "string", minLength: 8 },
        },
      },
      response: {
        200: {
          type: "object",
          required: ["ok"],
          properties: { ok: { type: "boolean" } },
        },
        401: { $ref: "ApiError" },
      },
    },
    preHandler: [app.authenticate],
    handler: async (_req, reply) => reply.notImplemented(),
  });

  app.get("/me/badges", {
    schema: {
      tags: ["me"],
      summary: "Get authenticated user's earned badges",
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          type: "object",
          required: ["data"],
          properties: {
            data: { type: "array", items: { $ref: "UserBadge" } },
          },
        },
        401: { $ref: "ApiError" },
      },
    },
    preHandler: [app.authenticate],
    handler: async (request, reply) => {
      const { sub, email, user_metadata } = request.user;
      const user = await getOrCreateUser(
        sub,
        email,
        user_metadata?.full_name ?? user_metadata?.name
      );

      const badges = await db.userBadge.findMany({
        where: { userId: user.id },
        include: { badge: true },
        orderBy: { awardedAt: "desc" },
      });

      return reply.send({
        data: badges.map(toUserBadge),
      });
    },
  });

  app.get("/me/current-book", {
    schema: {
      tags: ["me"],
      summary: "Get the user's current reading book (the one marked isCurrent)",
      security: [{ bearerAuth: [] }],
      response: {
        200: { $ref: "LibraryBook" },
        204: { type: "null", description: "No current book" },
        401: { $ref: "ApiError" },
      },
    },
    preHandler: [app.authenticate],
    handler: async (request, reply) => {
      const { sub, email, user_metadata } = request.user;
      const user = await getOrCreateUser(sub, email, user_metadata?.full_name ?? user_metadata?.name);

      const item = await db.libraryItem.findFirst({
        where: { userId: user.id, isCurrent: true },
        include: { book: { include: bookInclude } },
      });

      if (!item) return reply.code(204).send();
      return reply.send(toLibraryBook(item));
    },
  });
}
