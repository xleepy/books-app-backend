import type { FastifyInstance } from "fastify";

export async function authRoute(app: FastifyInstance) {
  app.post("/auth/register", {
    schema: {
      tags: ["auth"],
      summary: "Register a new user",
      body: {
        type: "object",
        required: ["email", "password", "name"],
        properties: {
          email: { type: "string", format: "email" },
          password: { type: "string", minLength: 8 },
          name: { type: "string", minLength: 1 },
        },
      },
      response: {
        201: { $ref: "AuthTokens" },
        409: { $ref: "ApiError", description: "Email already registered" },
      },
    },
    handler: async (_req, reply) => reply.notImplemented(),
  });

  app.post("/auth/login", {
    schema: {
      tags: ["auth"],
      summary: "Log in and receive a JWT",
      body: {
        type: "object",
        required: ["email", "password"],
        properties: {
          email: { type: "string", format: "email" },
          password: { type: "string" },
        },
      },
      response: {
        200: { $ref: "AuthTokens" },
        401: { $ref: "ApiError", description: "Invalid credentials" },
      },
    },
    handler: async (_req, reply) => reply.notImplemented(),
  });
}
