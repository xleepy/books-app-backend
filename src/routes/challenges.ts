import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { resolveUser } from "../lib/getOrCreateUser";
import { handleServiceError } from "../lib/errors";
import * as challengesService from "../services/challenges";

/* ─── Type interfaces ─── */

interface CreateChallengeBody {
  title: string;
  description?: string;
  variant: string;
  metric: string;
  target: number;
  activeFrom: string;
  activeTo: string;
  badgeId?: string;
}

/* ─── Route handlers ─── */

async function getGlobalLeaderboardHandler(request: FastifyRequest, reply: FastifyReply) {
  const { limit = 20 } = request.query as { limit?: number };
  const currentUser = await resolveUser(request);
  try {
    const result = await challengesService.getGlobalLeaderboard(limit, currentUser.id);
    return reply.send(result);
  } catch (err) {
    return handleServiceError(reply, err);
  }
}

async function listChallengesHandler(request: FastifyRequest, reply: FastifyReply) {
  const { filter = "active" } = request.query as { filter?: "active" | "monthly" | "yearly" | "weekly" | "custom" };
  const user = await resolveUser(request);
  try {
    const result = await challengesService.listChallenges(user.id, filter);
    return reply.send(result);
  } catch (err) {
    return handleServiceError(reply, err);
  }
}

async function createChallengeHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = request.body as CreateChallengeBody;
  const user = await resolveUser(request);
  try {
    const result = await challengesService.createChallenge(user.id, body);
    return reply.status(201).send(result);
  } catch (err) {
    return handleServiceError(reply, err);
  }
}

async function getChallengeHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };
  const user = await resolveUser(request);
  try {
    const result = await challengesService.getChallenge(id, user.id);
    return reply.send(result);
  } catch (err) {
    return handleServiceError(reply, err);
  }
}

async function deleteChallengeHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };
  const user = await resolveUser(request);
  try {
    await challengesService.deleteChallenge(id, user.id);
    return reply.status(204).send();
  } catch (err) {
    return handleServiceError(reply, err);
  }
}

async function joinChallengeHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };
  const user = await resolveUser(request);
  try {
    const result = await challengesService.joinChallenge(id, user.id);
    return reply.send(result);
  } catch (err) {
    return handleServiceError(reply, err);
  }
}

async function leaveChallengeHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };
  const user = await resolveUser(request);
  try {
    await challengesService.leaveChallenge(id, user.id);
    return reply.status(204).send();
  } catch (err) {
    return handleServiceError(reply, err);
  }
}

async function getChallengeProgressHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };
  const user = await resolveUser(request);
  try {
    const result = await challengesService.getChallengeProgress(id, user.id);
    return reply.send(result);
  } catch (err) {
    return handleServiceError(reply, err);
  }
}

async function getChallengeLeaderboardHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };
  const { limit = 50 } = request.query as { limit?: number };
  const currentUser = await resolveUser(request);
  try {
    const result = await challengesService.getChallengeLeaderboard(id, limit, currentUser.id);
    return reply.send(result);
  } catch (err) {
    return handleServiceError(reply, err);
  }
}

/* ─── Route registration ─── */

export async function challengesRoute(app: FastifyInstance) {
  app.get("/leaderboard", {
    schema: {
      tags: ["challenges"],
      summary: "Global leaderboard ranked by XP",
      security: [{ bearerAuth: [] }],
      querystring: { $ref: "LimitQuery" },
      response: {
        200: { $ref: "LeaderboardList" },
        401: { $ref: "ApiError" },
      },
    },
    preHandler: [app.authenticate],
    handler: getGlobalLeaderboardHandler,
  });

  app.get("/challenges", {
    schema: {
      tags: ["challenges"],
      summary: "List active reading challenges with user progress",
      security: [{ bearerAuth: [] }],
      querystring: { $ref: "ChallengeFilterQuery" },
      response: {
        200: { $ref: "ChallengeList" },
        401: { $ref: "ApiError" },
      },
    },
    preHandler: [app.authenticate],
    handler: listChallengesHandler,
  });

  app.post("/challenges", {
    schema: {
      tags: ["challenges"],
      summary: "Create a new reading challenge",
      security: [{ bearerAuth: [] }],
      body: { $ref: "CreateChallengeBody" },
      response: {
        201: { $ref: "ChallengeDetail" },
        400: { $ref: "ApiError" },
        401: { $ref: "ApiError" },
        404: { $ref: "ApiError" },
      },
    },
    preHandler: [app.authenticate],
    handler: createChallengeHandler,
  });

  app.get("/challenges/:id", {
    schema: {
      tags: ["challenges"],
      summary: "Get challenge details by ID",
      security: [{ bearerAuth: [] }],
      params: { $ref: "IdParam" },
      response: {
        200: { $ref: "ChallengeDetail" },
        401: { $ref: "ApiError" },
        404: { $ref: "ApiError" },
      },
    },
    preHandler: [app.authenticate],
    handler: getChallengeHandler,
  });

  app.delete("/challenges/:id", {
    schema: {
      tags: ["challenges"],
      summary: "Delete a challenge (creator only)",
      security: [{ bearerAuth: [] }],
      params: { $ref: "IdParam" },
      response: {
        204: { type: "null" },
        401: { $ref: "ApiError" },
        403: { $ref: "ApiError" },
        404: { $ref: "ApiError" },
      },
    },
    preHandler: [app.authenticate],
    handler: deleteChallengeHandler,
  });

  app.post("/challenges/:id/join", {
    schema: {
      tags: ["challenges"],
      summary: "Join a challenge",
      security: [{ bearerAuth: [] }],
      params: { $ref: "IdParam" },
      response: {
        200: { $ref: "ChallengeProgress" },
        401: { $ref: "ApiError" },
        404: { $ref: "ApiError" },
      },
    },
    preHandler: [app.authenticate],
    handler: joinChallengeHandler,
  });

  app.post("/challenges/:id/leave", {
    schema: {
      tags: ["challenges"],
      summary: "Leave a challenge",
      security: [{ bearerAuth: [] }],
      params: { $ref: "IdParam" },
      response: {
        204: { type: "null" },
        401: { $ref: "ApiError" },
        403: { $ref: "ApiError" },
        404: { $ref: "ApiError" },
      },
    },
    preHandler: [app.authenticate],
    handler: leaveChallengeHandler,
  });

  app.get("/challenges/:id/progress", {
    schema: {
      tags: ["challenges"],
      summary: "Get authenticated user's progress for a specific challenge",
      security: [{ bearerAuth: [] }],
      params: { $ref: "IdParam" },
      response: {
        200: { $ref: "ChallengeProgress" },
        401: { $ref: "ApiError" },
        404: { $ref: "ApiError" },
      },
    },
    preHandler: [app.authenticate],
    handler: getChallengeProgressHandler,
  });

  app.get("/challenges/:id/leaderboard", {
    schema: {
      tags: ["challenges"],
      summary: "Get the leaderboard for a specific challenge (ranked by progress)",
      security: [{ bearerAuth: [] }],
      params: { $ref: "IdParam" },
      querystring: { $ref: "LimitQuery" },
      response: {
        200: { $ref: "LeaderboardList" },
        401: { $ref: "ApiError" },
        404: { $ref: "ApiError" },
      },
    },
    preHandler: [app.authenticate],
    handler: getChallengeLeaderboardHandler,
  });
}
