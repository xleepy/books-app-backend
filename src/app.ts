import Fastify from "fastify";
import cors from "@fastify/cors";
import sensible from "@fastify/sensible";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { allSchemas } from "./schemas";
import { healthRoute } from "./routes/health";
import { authRoute } from "./routes/auth";
import { booksRoute } from "./routes/books";
import { reviewsRoute } from "./routes/reviews";
import { libraryRoute } from "./routes/library";
import { swipesRoute } from "./routes/swipes";
import { discussionsRoute } from "./routes/discussions";
import { challengesRoute } from "./routes/challenges";

export function buildApp() {
  const app = Fastify({ logger: true });

  app.register(cors, { origin: true });
  app.register(sensible);

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
        { name: "auth", description: "Authentication — register and log in" },
        { name: "books", description: "Book catalogue and recommendations" },
        { name: "reviews", description: "Book reviews" },
        { name: "library", description: "User's personal book library" },
        { name: "swipes", description: "Swipe actions (feeds recommendation engine)" },
        { name: "discussions", description: "Discussion threads" },
        { name: "challenges", description: "Reading challenges and leaderboards" },
      ],
    },
  });

  app.register(swaggerUi, {
    routePrefix: "/docs",
    uiConfig: { docExpansion: "list" },
  });

  // Register shared schemas so routes can use $ref
  for (const schema of allSchemas) {
    app.addSchema(schema);
  }

  app.register(healthRoute);
  app.register(authRoute);
  app.register(booksRoute);
  app.register(reviewsRoute);
  app.register(libraryRoute);
  app.register(swipesRoute);
  app.register(discussionsRoute);
  app.register(challengesRoute);

  return app;
}
