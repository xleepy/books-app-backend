import type { FastifyInstance } from "fastify";
import { db } from "../lib/db";
import { toReview } from "../lib/mappers";
import { getOrCreateUser } from "../lib/getOrCreateUser";

export async function reviewsRoute(app: FastifyInstance) {
  app.get("/books/:id/reviews", {
    schema: {
      tags: ["reviews"],
      summary: "List reviews for a book",
      params: {
        type: "object",
        required: ["id"],
        properties: { id: { type: "string" } },
      },
      querystring: {
        type: "object",
        properties: {
          page: { type: "integer", minimum: 1, default: 1 },
          limit: { type: "integer", minimum: 1, maximum: 50, default: 20 },
        },
      },
      response: {
        200: {
          type: "object",
          required: ["data", "pagination"],
          properties: {
            data: { type: "array", items: { $ref: "Review" } },
            pagination: { $ref: "Pagination" },
          },
        },
        404: { $ref: "ApiError" },
      },
    },
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };
      const { page = 1, limit = 20 } = request.query as { page?: number; limit?: number };

      const book = await db.book.findUnique({ where: { id } });
      if (!book) return reply.notFound("Book not found");

      const [total, rows] = await Promise.all([
        db.review.count({ where: { bookId: id } }),
        db.review.findMany({
          where: { bookId: id },
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * limit,
          take: limit,
          include: { user: true },
        }),
      ]);

      return reply.send({
        data: rows.map(toReview),
        pagination: { total, page, limit },
      });
    },
  });

  app.post("/books/:id/reviews", {
    schema: {
      tags: ["reviews"],
      summary: "Submit a review for a book",
      security: [{ bearerAuth: [] }],
      params: {
        type: "object",
        required: ["id"],
        properties: { id: { type: "string" } },
      },
      body: {
        type: "object",
        required: ["rating", "text"],
        properties: {
          rating: { type: "integer", minimum: 1, maximum: 5 },
          text: { type: "string", minLength: 1 },
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
    handler: async (request, reply) => {
      const { id: bookId } = request.params as { id: string };
      const { rating, text } = request.body as { rating: number; text: string };
      const { sub, email, user_metadata } = request.user;

      const book = await db.book.findUnique({ where: { id: bookId } });
      if (!book) return reply.notFound("Book not found");

      const user = await getOrCreateUser(sub, email, user_metadata?.full_name ?? user_metadata?.name);

      const existing = await db.review.findFirst({ where: { bookId, userId: user.id } });
      if (existing) return reply.conflict("You have already reviewed this book");

      const review = await db.review.create({
        data: { bookId, userId: user.id, rating, text },
        include: { user: true },
      });

      return reply.code(201).send(toReview(review));
    },
  });
}
