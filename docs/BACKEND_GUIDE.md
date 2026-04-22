# Prisma & Fastify Backend Guide

This guide covers conventions, patterns, and best practices for working with Prisma ORM and Fastify in this project. Follow these when adding models, routes, or modifying the database.

---

## Project Structure

```
books-app-backend/
├── prisma/
│   ├── schema.prisma              # Data model (18 models)
│   └── migrations/                # Prisma Migrate history
├── scripts/seed/                  # Idempotent seed scripts
├── src/
│   ├── app.ts                     # Fastify app factory (buildApp)
│   ├── index.ts                   # Entry point (listen, shutdown)
│   ├── generated/prisma/          # Generated Prisma client output
│   ├── lib/
│   │   ├── db.ts                  # PrismaClient singleton
│   │   ├── getOrCreateUser.ts     # JWT-sub → User upsert helper
│   │   ├── mappers.ts            # DB → API response mappers
│   │   ├── sanitize.ts           # HTML sanitization
│   │   ├── streaks.ts            # Reading streak tracking
│   │   ├── xp.ts                 # XP/level system
│   │   └── badges.ts             # Badge check + award logic
│   ├── routes/                    # One file per domain
│   ├── schemas/index.ts           # Shared JSON Schemas ($ref)
│   └── types/fastify.d.ts         # FastifyJWT type augmentation
└── tests/                         # Vitest integration tests
```

---

## Prisma

### Schema Conventions

**IDs**: All models use `@id @default(uuid())` — UUID strings, never auto-increment integers.

**Column naming**: All column names use `snake_case` via `@map()`. Table names use `@@map("snake_case_plural")`:

```prisma
model Book {
  id            String   @id @default(uuid())
  openLibraryId String   @unique @map("open_library_id")
  coverUrl      String?  @map("cover_url")
  createdAt     DateTime @default(now()) @map("created_at")

  @@map("books")
}
```

**Composite IDs** for join tables — use the two FK columns:

```prisma
model LibraryItem {
  userId String @map("user_id")
  bookId String @map("book_id")

  @@id([userId, bookId])
  @@map("library_items")
}
```

**Always add indexes** for columns used in `where`, `orderBy`, or `filter` clauses. Composite indexes for common query patterns:

```prisma
@@index([createdAt(sort: Desc)])                         # recency sort
@@index([likes(sort: Desc), createdAt(sort: Desc)])      # popularity sort
@@index([userId, createdAt(sort: Desc)])                  # user-scoped recency
```

**Soft delete**: Use `deletedAt DateTime?` with `@map("deleted_at")`. Always filter with `where: { deletedAt: null }` in queries and `_count`.

**Relations**: Always declare both sides. Use `onDelete: Cascade` only for true parent-child (e.g. ThreadReply → Thread). Use `@relation(fields: [...], references: [...])` explicitly — never rely on convention.

**Enums**: Define at the top level when a field has a fixed set of values:

```prisma
enum LibraryItemStatus {
  want
  reading
  finished
}
```

**Decimals**: Use `@db.Decimal(precision, scale)` for ratings, scores, and monetary values. Never use `Float`. Integer types are acceptable for discrete rating scales (e.g. `Int` for 1–5 star ratings).

**Adding a new model**:

1. Add the model to `prisma/schema.prisma` following the conventions above
2. Run `npx prisma migrate dev --name descriptive_name`
3. Add a mapper in `src/lib/mappers.ts` if the model has an API response shape
4. Add a shared JSON Schema in `src/schemas/index.ts` and register it in `allSchemas`
5. Regenerate the frontend API client: `cd ../books-app && npm run codegen`

### Database Client

The singleton `db` is exported from `src/lib/db.ts`:

```typescript
import "dotenv/config";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
export const db = new PrismaClient({ adapter });
```

**Always import `db` from `../lib/db`** — never create your own PrismaClient instance in route files.

The generated client is in `src/generated/prisma/` (custom output path). Import types from there when you need Prisma result types for mappers.

### Query Patterns

**findUnique** — by unique field or composite key:

```typescript
db.book.findUnique({ where: { id } })
db.libraryItem.findUnique({ where: { userId_bookId: { userId, bookId } } })
```

**findFirst** — when filtering soft-deleted rows or conditional lookups:

```typescript
db.thread.findFirst({ where: { id, deletedAt: null } })
```

**findMany** — list queries with pagination:

```typescript
const [total, rows] = await Promise.all([
  db.book.count({ where }),
  db.book.findMany({ where, orderBy, skip: (page - 1) * limit, take: limit, include }),
]);
```

Always run `count` + `findMany` in parallel with `Promise.all` for pagination.

**upsert** — idempotent create-or-update. Use for seed scripts and "get or create" patterns:

```typescript
db.swipe.upsert({
  where: { userId_bookId: { userId, bookId } },
  create: { userId, bookId, direction },
  update: { direction },
})
```

**$transaction** — wrap multi-step operations that need read-after-write consistency:

```typescript
await db.$transaction(async (tx) => {
  await tx.user.update({ where: { id: userId }, data: { xpTotal: { increment: 100 } } });
  const updated = await tx.user.findUnique({ where: { id: userId } });
  // ... use updated data
});
```

Use the **batch form** `db.$transaction([...])` for atomic multi-statement operations where you don't need intermediate reads.

**$queryRaw** — only for operations Prisma can't express (like `GREATEST`):

```typescript
await db.$queryRaw`UPDATE "Thread" SET likes = GREATEST(0, likes - 1) WHERE id = ${threadId}`;
```

Always use tagged template literals for parameterized queries — never string concatenation.

### Include/Select Patterns

**Define reusable includes at module top-level**:

```typescript
const bookInclude = {
  bookSubjects: { include: { subject: true } },
} as const;
```

**Use `select` when you only need specific fields** (e.g. existence checks, ID-only lookups):

```typescript
db.book.findUnique({ where: { id: bookId }, select: { id: true } })
```

**Filtered `_count`** for counting relations with conditions (e.g. non-deleted replies):

```typescript
_count: { select: { replies: { where: { deletedAt: null } } } }
```

### Mappers

All DB-to-API transformations live in `src/lib/mappers.ts`. These are **pure functions** that:

- Strip internal fields (e.g. `authId`, `deletedAt`)
- Convert `Decimal` to `number`
- Format dates to ISO strings
- Compute derived fields (`timeAgo`, `bookContext`, `isOwner`)

**When adding a new route response**:

1. Create a mapper function in `mappers.ts`
2. Define a local type alias for the Prisma include result
3. Add a shared JSON Schema in `schemas/index.ts` matching the mapper output
4. Use the mapper in the handler: `reply.send(toNewThing(data))`

Never return raw Prisma objects from handlers — always go through a mapper.

### Deriving fields in handlers

When a request body contains a value that implies another field (e.g., `currentPage` implies `progressPct`), derive the dependent field in the handler before passing to Prisma:

```typescript
let resolvedProgressPct = progressPct;
let resolvedCurrentPage = currentPage;
const pageCount = existing.book.pageCount ?? 0;
if (currentPage !== undefined && pageCount > 0) {
  resolvedCurrentPage = Math.max(0, Math.min(pageCount, currentPage));
  resolvedProgressPct = Math.round((resolvedCurrentPage / pageCount) * 100);
}
```

This keeps the database as the source of truth while allowing clients to send the more natural `currentPage` value.

### Migrations

```bash
npm run db:migrate          # dev: creates migration, applies it, regenerates client
npm run db:migrate:deploy   # prod: applies pending migrations without prompting
```

Docker entrypoint runs `npx prisma migrate deploy` before starting the app.

**Migration naming**: Use descriptive names like `soft_delete_threads`, `add_current_page_to_library_item`, not `init` or `update`.

---

## Fastify

### App Factory

The app is created via `buildApp()` — never starts listening inside the factory. This enables testing with `app.inject()`:

```typescript
export function buildApp(opts?: { testUser?: TestUser }) {
  const app = Fastify({ logger: !process.env.VITEST && !opts?.testUser });
  // ... register plugins, schemas, routes
  return app;
}
```

### Route File Convention

Each route file exports a single async function:

```typescript
import type { FastifyInstance } from "fastify";
import { db } from "../lib/db";
import { toReview } from "../lib/mappers";

export async function reviewsRoute(app: FastifyInstance) {
  app.get("/books/:id/reviews", {
    schema: { ... },
    preHandler: [app.authenticate],
    handler: async (request, reply) => { ... },
  });
}
```

**Rules**:
- Named export: `async function <domain>Route(app: FastifyInstance)`
- Full paths — no prefix encapsulation (`/books/:id/reviews`, not `/:id/reviews`)
- All routes for a domain in one file
- Import `db` from `../lib/db`, mappers from `../lib/mappers`

### Schema Validation

Every route **must** define an inline JSON Schema with these keys:

```typescript
app.post("/library", {
  schema: {
    tags: ["library"],                      // Swagger tag grouping
    summary: "Add a book to the library",   // Swagger description
    security: [{ bearerAuth: [] }],         // Only on protected routes
    body: {                                 // Request body validation
      type: "object",
      required: ["bookId", "status"],
      properties: {
        bookId: { type: "string" },
        status: { type: "string", enum: ["want", "reading", "finished"] },
      },
    },
    response: {                             // Response validation
      201: { $ref: "LibraryBook" },         // Use $ref for shared schemas
      401: { $ref: "ApiError" },
      404: { $ref: "ApiError", description: "Book not found" },
      409: { $ref: "ApiError", description: "Already in library" },
    },
  },
  ...
});
```

**`params`** and **`querystring`** schemas follow the same pattern.

**Always define `response` schemas** — Fastify uses them for serialization optimization and to prevent data leaks. Reference shared schemas with `$ref` — never inline complex response shapes.

### Shared JSON Schemas (`src/schemas/index.ts`)

All reusable schemas are defined with `$id` and registered in `app.ts`:

```typescript
export const BookSchema = {
  $id: "Book",
  type: "object",
  required: ["id", "title", "author", "tags", "description", "rating", "reviewCount"],
  properties: { ... },
} as const;
```

**When adding a new shared schema**:

1. Add the schema object with a unique `$id` in `schemas/index.ts`
2. Add it to the `allSchemas` export array
3. Reference it in route schemas: `{ $ref: "MyNewThing" }`
4. Nested refs work too: `items: { $ref: "ThreadReply" }`

### Authentication

Protected routes use `preHandler: [app.authenticate]`, then extract the user:

```typescript
const { sub, email, user_metadata } = request.user;
const user = await getOrCreateUser(sub, email, user_metadata?.full_name ?? user_metadata?.name);
```

`getOrCreateUser` is imported from `../lib/getOrCreateUser` and handles the JWT-sub → User upsert pattern used across all authenticated handlers.

### Error Handling

Use `@fastify/sensible` helpers — never throw or manually construct error responses:

```typescript
reply.notFound("Book not found")          // 404
reply.conflict("Already in library")       // 409
reply.forbidden("Not the owner")           // 403
reply.notImplemented()                     // 501 (for stub routes)
```

For success responses:

```typescript
reply.send({ data, pagination })           // 200
reply.code(201).send(mapper(result))       // 201 Created
reply.code(204).send()                     // 204 No Content
```

### Pagination

**Offset pagination** (standard list endpoints):

```typescript
const [total, rows] = await Promise.all([
  db.model.count({ where }),
  db.model.findMany({ where, skip: (page - 1) * limit, take: limit }),
]);
return reply.send({ data: rows.map(mapper), pagination: { total, page, limit } });
```

**Cursor pagination** (feed endpoint with large datasets):

```typescript
const offset = cursor ? parseInt(Buffer.from(cursor, "base64url").toString(), 10) : 0;
// ... fetch offset + limit + 1 rows
const nextCursor = hasMore ? Buffer.from(String(offset + limit)).toString("base64url") : null;
return reply.send({ data, nextCursor });
```

### Sanitization

Always sanitize user-submitted HTML with `sanitizeHtml()`:

```typescript
import { sanitizeHtml } from "../lib/sanitize";

const sanitizedBody = sanitizeHtml(body);
const sanitizedTitle = sanitizeHtml(title);
```

This strips all tags except `b`, `i`, `em`, `strong` and removes all attributes. Apply to all user-submitted text that will be rendered as HTML.

---

## Testing

### Framework

Vitest with `app.inject()` for HTTP-level integration tests. No real HTTP server is started.

### App Injection

```typescript
const app = buildApp({ testUser: { sub: "test-auth-id", email: "test@example.com" } });
await app.ready();

const res = await app.inject({
  method: "POST",
  url: "/library",
  payload: { bookId, status: "want" },
});

expect(res.statusCode).toBe(201);
expect(res.json()).toMatchObject({ id: expect.any(String) });
```

### Test DB

Tests use a separate `booksapp_test` database. The global setup drops/recreates it and runs migrations before each test run.

### Direct DB for Setup/Teardown

```typescript
beforeAll(async () => {
  const book = await db.book.create({ data: { ... } });
  bookId = book.id;
});

afterEach(async () => {
  await db.libraryItem.deleteMany({ where: { userId: user.id } });
});

afterAll(async () => {
  await db.book.delete({ where: { id: bookId } });
  await db.$disconnect();
});
```

Delete dependent records first (child → parent order).

### Unit Tests

For pure functions (mappers, sanitizers, XP calculations), test without DB:

```typescript
import { sanitizeHtml } from "../src/lib/sanitize";
test("strips script tags", () => {
  expect(sanitizeHtml("<script>alert('xss')</script>hello")).toBe("hello");
});
```

---

## Adding a New Feature Checklist

1. **Prisma model** — Add to `schema.prisma`, run `prisma migrate dev`
2. **Mapper** — Add `toNewThing()` in `src/lib/mappers.ts`
3. **Shared schema** — Add JSON Schema with `$id` in `src/schemas/index.ts`, add to `allSchemas`
4. **Route file** — Create `src/routes/newThing.ts`, follow route conventions
5. **Register route** — Import and `app.register(newThingRoute)` in `src/app.ts`
6. **Swagger tag** — Add entry to `tags` array in `app.ts` swagger config
7. **Tests** — Add integration test in `tests/`
8. **Frontend codegen** — Update `openapi-config.js` in `books-app`, run `npm run codegen`

---

## Quick Reference

| Do | Don't |
|---|---|
| `@map("snake_case")` on every column | Use camelCase DB column names |
| `@@map("plural_snake")` on every model | Leave table names as Prisma defaults |
| `@id @default(uuid())` for all IDs | Use `@default(autoincrement())` |
| Mappers for all API responses | Return raw Prisma objects from handlers |
| `$ref` for shared response schemas | Inline complex response shapes |
| `Promise.all([count, findMany])` for pagination | Run count + findMany sequentially |
| `$transaction` for multi-step read-write | Allow race conditions in concurrent updates |
| `sanitizeHtml()` on user text | Trust user input |
| `reply.notFound()` / `reply.conflict()` | Throw errors or manually construct responses |
| `app.inject()` for tests | Start a real HTTP server in tests |
| `buildApp({ testUser })` for auth bypass | Mock JWT in tests |
