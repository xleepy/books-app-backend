import type { FastifyReply } from "fastify";

export class NotFoundError extends Error {
  statusCode = 404;
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

export class ConflictError extends Error {
  statusCode = 409;
  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}

export class ForbiddenError extends Error {
  statusCode = 403;
  constructor(message: string) {
    super(message);
    this.name = "ForbiddenError";
  }
}

export class BadRequestError extends Error {
  statusCode = 400;
  constructor(message: string) {
    super(message);
    this.name = "BadRequestError";
  }
}

export class UnauthorizedError extends Error {
  statusCode = 401;
  constructor(message: string) {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export function handleServiceError(reply: FastifyReply, error: unknown) {
  if (error instanceof NotFoundError) return reply.notFound(error.message);
  if (error instanceof ConflictError) return reply.conflict(error.message);
  if (error instanceof ForbiddenError) return reply.forbidden(error.message);
  if (error instanceof BadRequestError) return reply.badRequest(error.message);
  if (error instanceof UnauthorizedError) return reply.unauthorized(error.message);
  throw error;
}
