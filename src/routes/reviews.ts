import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { resolveUser } from "../lib/getOrCreateUser";
import { handleServiceError } from "../lib/errors";
import * as reviewsService from "../services/reviews";

/* ─── Type interfaces ─── */

interface CreateReviewBody {
  rating: number;
  text: string;
}

/* ─── Route handlers ─── */

async function listReviewsHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };
  const { page = 1, limit = 20 } = request.query as { page?: number; limit?: number };
  try {
    const result = await reviewsService.listReviews(id, page, limit);
    return reply.send(result);
  } catch (err) {
    return handleServiceError(reply, err);
  }
}

async function createReviewHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id: bookId } = request.params as { id: string };
  const { rating, text } = request.body as CreateReviewBody;
  const user = await resolveUser(request);
  try {
    const result = await reviewsService.createReview(user.id, bookId, rating, text);
    return reply.code(201).send(result);
  } catch (err) {
    return handleServiceError(reply, err);
  }
}

/* ─── Route registration ─── */

export async function reviewsRoute(app: FastifyInstance) {
  app.get("/books/:id/reviews", {
    schema: {
      operationId: "getBooksByIdReviews",
      tags: ["reviews"],
      summary: "List reviews for a book",
      params: { $ref: "IdParam" },
      querystring: { $ref: "PaginationQuery" },
      response: {
        200: { $ref: "PaginatedReviews" },
        404: { $ref: "ApiError" },
      },
    },
    handler: listReviewsHandler,
  });

  app.post("/books/:id/reviews", {
    schema: {
      operationId: "postBooksByIdReviews",
      tags: ["reviews"],
      summary: "Submit a review for a book",
      security: [{ bearerAuth: [] }],
      params: { $ref: "IdParam" },
      body: {
        type: "object",
        required: ["rating", "text"],
        properties: {
          rating: { type: "integer", minimum: 1, maximum: 5 },
          text: { type: "string", minLength: 1, maxLength: 5000 },
        },
      },
      response: {
        201: { $ref: "Review" },
        401: { $ref: "ApiError" },
        404: { $ref: "ApiError" },
        409: { $ref: "ApiError", description: "Already reviewed" },
      },
    },
    preHandler: [app.authenticate],
    handler: createReviewHandler,
  });
}
