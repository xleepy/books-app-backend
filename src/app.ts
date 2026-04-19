import Fastify, { type FastifyRequest, type FastifyReply } from "fastify";
import cors from "@fastify/cors";
import sensible from "@fastify/sensible";
import fastifyJwt from "@fastify/jwt";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import JwksRsa from "jwks-rsa";
import type { DecodedJwt } from "fast-jwt";
import { allSchemas } from "./schemas";
import { healthRoute } from "./routes/health";
import { authRoute } from "./routes/auth";
import { booksRoute } from "./routes/books";
import { reviewsRoute } from "./routes/reviews";
import { libraryRoute } from "./routes/library";
import { discussionsRoute } from "./routes/discussions";
import { challengesRoute } from "./routes/challenges";
import { meRoute } from "./routes/me";
import { swipesRoute } from "./routes/swipes";

const supabaseUrl = process.env.SUPABASE_URL ?? "";

const jwksClient = JwksRsa({
  jwksUri: `${supabaseUrl}/auth/v1/.well-known/jwks.json`,
  cache: true,
  cacheMaxEntries: 5,
  cacheMaxAge: 600_000, // 10 min
  rateLimit: true,
});

export type TestUser = {
  sub: string;
  email: string;
  role?: string;
  user_metadata?: { name?: string; full_name?: string };
};

export function buildApp(opts?: { testUser?: TestUser }) {
  const app = Fastify({ logger: !process.env.VITEST && !opts?.testUser });

  app.register(cors, { origin: true });
  app.register(sensible);

  app.register(fastifyJwt, {
    verify: { algorithms: ["ES256"] },
    secret: async (decoded: DecodedJwt) => {
      const kid = decoded?.header?.kid as string | undefined;
      if (kid) {
        return new Promise<string>((resolve, reject) => {
          jwksClient.getSigningKey(kid, (err, key) => {
            if (err) return reject(err);
            resolve(key!.getPublicKey());
          });
        });
      }
      // Supabase JWTs may omit kid — fall back to the first available key
      const keys = await jwksClient.getSigningKeys();
      if (!keys.length) throw new Error("No JWKS signing keys available");
      return keys[0].getPublicKey();
    },
  });

  app.decorate(
    "authenticate",
    opts?.testUser
      ? async (request: FastifyRequest) => {
          request.user = { role: "authenticated", ...opts.testUser! };
        }
      : async (request: FastifyRequest, reply: FastifyReply) => {
          try {
            await request.jwtVerify();
          } catch (err) {
            reply.send(err);
          }
        }
  );

  app.register(swagger, {
    openapi: {
      info: {
        title: "Books App API",
        description:
          "Backend API for Books App — books, reviews, discussions, challenges, user library, and swipe-based recommendations.",
        version: "1.0.0",
      },
      servers: [
        { url: "http://localhost:3000", description: "Local development" },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "JWT",
          },
        },
      },
      tags: [
        { name: "health", description: "Service health" },
        { name: "auth", description: "Authentication" },
        { name: "books", description: "Book catalogue and recommendations" },
        { name: "reviews", description: "Book reviews" },
        { name: "library", description: "User's personal book library" },
        { name: "me", description: "Authenticated user profile and preferences" },
        { name: "discussions", description: "Discussion threads" },
        { name: "challenges", description: "Reading challenges and leaderboards" },
        { name: "swipes", description: "Swipe events for feed personalization" },
      ],
    },
  });

  app.register(swaggerUi, {
    routePrefix: "/docs",
    uiConfig: { docExpansion: "list" },
  });

  for (const schema of allSchemas) {
    app.addSchema(schema);
  }

  app.register(healthRoute);
  app.register(authRoute);
  app.register(booksRoute);
  app.register(reviewsRoute);
  app.register(libraryRoute);
  app.register(meRoute);
  app.register(discussionsRoute);
  app.register(challengesRoute);
  app.register(swipesRoute);

  return app;
}
