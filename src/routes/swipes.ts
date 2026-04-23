import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { resolveUser } from "../lib/getOrCreateUser";
import { handleServiceError } from "../lib/errors";
import * as swipesService from "../services/swipes";

/* ─── Type interfaces ─── */

interface SwipeBody {
  bookId: string;
  direction: "left" | "right";
}

/* ─── Route handlers ─── */

async function recordSwipeHandler(request: FastifyRequest, reply: FastifyReply) {
  const { bookId, direction } = request.body as SwipeBody;
  const user = await resolveUser(request);
  try {
    await swipesService.recordSwipe(user.id, bookId, direction);
    return reply.code(204).send();
  } catch (err) {
    return handleServiceError(reply, err);
  }
}

/* ─── Route registration ─── */

export async function swipesRoute(app: FastifyInstance) {
  app.post("/swipes", {
    schema: {
      tags: ["swipes"],
      summary: "Record a swipe on a book (left = pass, right = like)",
      security: [{ bearerAuth: [] }],
      body: {
        type: "object",
        required: ["bookId", "direction"],
        properties: {
          bookId: { type: "string" },
          direction: { type: "string", enum: ["left", "right"] },
        },
      },
      response: {
        204: { type: "null" },
        401: { $ref: "ApiError" },
        404: { $ref: "ApiError" },
      },
    },
    preHandler: [app.authenticate],
    handler: recordSwipeHandler,
  });
}
