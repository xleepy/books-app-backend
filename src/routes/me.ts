import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { resolveUser } from "../lib/getOrCreateUser";
import { handleServiceError } from "../lib/errors";
import * as meService from "../services/me";

/* ─── Type interfaces ─── */

interface PatchMeBody {
  name?: string;
  avatarHue?: number;
  readingGoal?: number;
}

interface PreferencesBody {
  readingGoalMinutes: number;
  reminderTime?: string | null;
  reminderEnabled: boolean;
  preferredGenres: string[];
  notifyPush: boolean;
  notifyWeeklyDigest: boolean;
  notifyChallenge: boolean;
  profileVisibility: string;
}

/* ─── Route handlers ─── */

async function getMeHandler(request: FastifyRequest, reply: FastifyReply) {
  const user = await resolveUser(request);
  const result = await meService.getProfile(user);
  return reply.send(result);
}

async function patchMeHandler(request: FastifyRequest, reply: FastifyReply) {
  const user = await resolveUser(request);
  const { name, avatarHue, readingGoal } = request.body as PatchMeBody;
  try {
    const result = await meService.updateProfile(user.id, name, avatarHue, readingGoal);
    return reply.send(result);
  } catch (err) {
    return handleServiceError(reply, err);
  }
}

async function getPreferencesHandler(request: FastifyRequest, reply: FastifyReply) {
  const user = await resolveUser(request);
  try {
    const result = await meService.getPreferences(user.id);
    return reply.send(result);
  } catch (err) {
    return handleServiceError(reply, err);
  }
}

async function putPreferencesHandler(request: FastifyRequest, reply: FastifyReply) {
  const user = await resolveUser(request);
  const body = request.body as PreferencesBody;
  try {
    const result = await meService.updatePreferences(user.id, body);
    return reply.send(result);
  } catch (err) {
    return handleServiceError(reply, err);
  }
}

async function changePasswordHandler(_request: FastifyRequest, reply: FastifyReply) {
  return reply.notImplemented();
}

async function getBadgesHandler(request: FastifyRequest, reply: FastifyReply) {
  const user = await resolveUser(request);
  try {
    const result = await meService.getBadges(user.id);
    return reply.send(result);
  } catch (err) {
    return handleServiceError(reply, err);
  }
}

async function getCurrentBookHandler(request: FastifyRequest, reply: FastifyReply) {
  const user = await resolveUser(request);
  try {
    const result = await meService.getCurrentBook(user.id);
    if (!result) return reply.code(204).send();
    return reply.send(result);
  } catch (err) {
    return handleServiceError(reply, err);
  }
}

/* ─── Route registration ─── */

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
    handler: getMeHandler,
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
    handler: patchMeHandler,
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
    handler: getPreferencesHandler,
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
    handler: putPreferencesHandler,
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
    handler: changePasswordHandler,
  });

  app.get("/me/badges", {
    schema: {
      tags: ["me"],
      summary: "Get authenticated user's earned badges",
      security: [{ bearerAuth: [] }],
      response: {
        200: { $ref: "UserBadgeList" },
        401: { $ref: "ApiError" },
      },
    },
    preHandler: [app.authenticate],
    handler: getBadgesHandler,
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
    handler: getCurrentBookHandler,
  });
}
