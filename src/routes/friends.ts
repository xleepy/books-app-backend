import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { resolveUser } from "../lib/getOrCreateUser";
import { handleServiceError } from "../lib/errors";
import * as friendsService from "../services/friends";

async function getFriendsHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const user = await resolveUser(request);
  try {
    const result = await friendsService.getFriends(user.id);
    return reply.send(result);
  } catch (err) {
    return handleServiceError(reply, err);
  }
}

async function getPendingRequestsHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const user = await resolveUser(request);
  try {
    const result = await friendsService.getPendingRequests(user.id);
    return reply.send(result);
  } catch (err) {
    return handleServiceError(reply, err);
  }
}

async function sendFriendRequestHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const { userId } = request.body as { userId: string };
  const user = await resolveUser(request);
  try {
    const result = await friendsService.sendFriendRequest(user.id, userId);
    return reply.status(201).send(result);
  } catch (err) {
    return handleServiceError(reply, err);
  }
}

async function acceptFriendRequestHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const { requestId } = request.params as { requestId: string };
  const user = await resolveUser(request);
  try {
    const result = await friendsService.acceptFriendRequest(
      requestId,
      user.id,
    );
    return reply.send(result);
  } catch (err) {
    return handleServiceError(reply, err);
  }
}

async function rejectFriendRequestHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const { requestId } = request.params as { requestId: string };
  const user = await resolveUser(request);
  try {
    await friendsService.rejectFriendRequest(requestId, user.id);
    return reply.status(204).send();
  } catch (err) {
    return handleServiceError(reply, err);
  }
}

async function removeFriendHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const { friendshipId } = request.params as { friendshipId: string };
  const user = await resolveUser(request);
  try {
    await friendsService.removeFriend(friendshipId, user.id);
    return reply.status(204).send();
  } catch (err) {
    return handleServiceError(reply, err);
  }
}

export async function friendsRoute(app: FastifyInstance) {
  app.get("/friends", {
    schema: {
      operationId: "getFriends",
      tags: ["friends"],
      summary: "Get accepted friends list",
      security: [{ bearerAuth: [] }],
      response: {
        200: { $ref: "FriendsList" },
        401: { $ref: "ApiError" },
      },
    },
    preHandler: [app.authenticate],
    handler: getFriendsHandler,
  });

  app.get("/friends/pending", {
    schema: {
      operationId: "getPendingRequests",
      tags: ["friends"],
      summary: "Get incoming and outgoing pending requests",
      security: [{ bearerAuth: [] }],
      response: {
        200: { $ref: "PendingRequests" },
        401: { $ref: "ApiError" },
      },
    },
    preHandler: [app.authenticate],
    handler: getPendingRequestsHandler,
  });

  app.post("/friends/request", {
    schema: {
      operationId: "sendFriendRequest",
      tags: ["friends"],
      summary: "Send a friend request",
      security: [{ bearerAuth: [] }],
      body: { $ref: "SendFriendRequestBody" },
      response: {
        201: { $ref: "FriendRequest" },
        400: { $ref: "ApiError" },
        401: { $ref: "ApiError" },
        404: { $ref: "ApiError" },
        409: { $ref: "ApiError" },
      },
    },
    preHandler: [app.authenticate],
    handler: sendFriendRequestHandler,
  });

  app.post("/friends/accept/:requestId", {
    schema: {
      operationId: "acceptFriendRequest",
      tags: ["friends"],
      summary: "Accept an incoming friend request",
      security: [{ bearerAuth: [] }],
      params: {
        type: "object",
        required: ["requestId"],
        properties: { requestId: { type: "string" } },
      },
      response: {
        200: { $ref: "Friend" },
        401: { $ref: "ApiError" },
        403: { $ref: "ApiError" },
        404: { $ref: "ApiError" },
        409: { $ref: "ApiError" },
      },
    },
    preHandler: [app.authenticate],
    handler: acceptFriendRequestHandler,
  });

  app.post("/friends/reject/:requestId", {
    schema: {
      operationId: "rejectFriendRequest",
      tags: ["friends"],
      summary: "Reject an incoming friend request",
      security: [{ bearerAuth: [] }],
      params: {
        type: "object",
        required: ["requestId"],
        properties: { requestId: { type: "string" } },
      },
      response: {
        204: { type: "null" },
        401: { $ref: "ApiError" },
        403: { $ref: "ApiError" },
        404: { $ref: "ApiError" },
        409: { $ref: "ApiError" },
      },
    },
    preHandler: [app.authenticate],
    handler: rejectFriendRequestHandler,
  });

  app.delete("/friends/:friendshipId", {
    schema: {
      operationId: "removeFriend",
      tags: ["friends"],
      summary: "Remove a friend or cancel a pending request",
      security: [{ bearerAuth: [] }],
      params: {
        type: "object",
        required: ["friendshipId"],
        properties: { friendshipId: { type: "string" } },
      },
      response: {
        204: { type: "null" },
        401: { $ref: "ApiError" },
        403: { $ref: "ApiError" },
        404: { $ref: "ApiError" },
      },
    },
    preHandler: [app.authenticate],
    handler: removeFriendHandler,
  });
}
