# AGENTS.md — books-app-backend

This file is for AI coding agents working on the books-app Fastify + Prisma backend. It links all project guides and provides quick orientation.

---

## Project Overview

Fastify 5.x + TypeScript backend with Prisma 7 ORM and PostgreSQL. JWT auth via Supabase, auto-generated OpenAPI/Swagger docs, gamification pipeline (XP, levels, streaks, badges, challenges).

**Stack**: Fastify 5.8, Prisma 7.7, PostgreSQL, TypeScript, Vitest

---

## Guides

| Guide | Purpose |
|-------|---------|
| [Backend Guide](./docs/BACKEND_GUIDE.md) | Prisma schema conventions, Fastify routes, JSON Schemas, mappers, testing patterns |

## Feature Docs

When implementing a new feature, create a feature document under `docs/features/<feature-name>.md`. This serves as the single source of truth for:

- UI/UX design decisions (Pencil frames, interaction flows)
- Backend API contract (routes, request/response shapes)
- Authorization rules
- Notification behavior
- Frontend state management (RTK Query tags, cache invalidation)
- Testing notes

After a feature is completed, refine the feature doc to reflect the final implementation. Do not delete it — it becomes living documentation.

When updating a feature doc, revisit **other feature docs** that mention this feature (by name, route, or shared schema) and update any stale references so all docs stay consistent. If the frontend has a corresponding feature doc for the same capability, keep the API contracts and status labels in sync.

| Feature | Doc |
|---------|-----|
| User-Created Challenges | [docs/features/challenges.md](./docs/features/challenges.md) |

## Additional Reference Docs

The `docs/` folder contains implementation specs and design references beyond the core guide:

| Document | Purpose |
|----------|---------|
| [Implementation Plan](./docs/PLAN.md) | Phased milestones, API contract, schema decisions |
| [Challenges Spec](./docs/challenges-spec.md) | User-created challenges: API contract, schema changes, mapper updates |
| [Auth Providers Guide](./docs/auth-providers-guide.md) | Supabase Auth setup: Google OAuth, email/password, Apple Sign-In |
| [Architecture Ideas](./docs/architecture-ideas.md) | Research notes on recommendation engine approaches |
| [Infrastructure Risk Analysis](./docs/infrastructure-risk-analysis.md) | Hosting, backup, and scaling considerations |

Consult these for context on specific features or design decisions.

Read the Backend Guide before making changes to:
- **Database schema** → Prisma conventions, migrations, indexes
- **API routes** → Fastify route structure, schema validation, auth
- **Services** → Business logic separation, domain errors
- **Response shapes** → Mappers, shared JSON Schemas
- **Tests** → Integration test patterns with `app.inject()`

---

## Quick Commands

```bash
npm run dev               # Dev server (requires Postgres)
npm run typecheck         # TypeScript check
npm run lint              # ESLint check
npm run db:migrate        # Create + apply migration + regenerate client
```
npm run db:generate       # Regenerate Prisma client only
npm run db:studio         # Prisma Studio GUI
npm run test              # Integration tests (requires Postgres)
npm run seed              # Seed database from Open Library API
```

---

## Architecture at a Glance

```
src/
├── app.ts              # Fastify app factory (buildApp)
├── index.ts            # Entry point (listen)
├── generated/prisma/   # Generated Prisma client
├── lib/
│   ├── db.ts           # PrismaClient singleton
│   ├── mappers.ts      # DB → API response transformers
│   ├── errors.ts       # Domain error classes (NotFoundError, ConflictError, ...)
│   ├── includes.ts     # Shared Prisma include fragments
│   ├── getOrCreateUser.ts
│   ├── xp.ts           # XP/level calculations
│   ├── badges.ts       # Badge award logic
│   └── sanitize.ts     # HTML sanitization
├── routes/             # One file per domain — thin HTTP adapters
├── services/           # Business logic per domain — pure functions, no HTTP
├── schemas/index.ts    # Shared JSON Schemas ($ref definitions)
└── types/fastify.d.ts  # JWT type augmentation
```

---

## Key Conventions

1. **Never edit generated files manually.** Files in `src/generated/prisma/` (Prisma client) or any file with a `.generated.` suffix are produced by codegen tools. Always regenerate them via the appropriate command (`npm run db:generate`, `npx prisma generate`, etc.). Manual edits will be lost on the next regeneration and can introduce type mismatches.
2. **Prisma schema**: `snake_case` columns via `@map()`, `@@map()` for tables, UUID IDs, explicit relations
3. **Routes are thin HTTP adapters** — extract business logic into `src/services/<domain>.ts`. Handlers validate input, call services, and map errors to replies.
4. **Always use mappers** — never return raw Prisma objects from handlers or services
5. **Define JSON Schemas** for all route request/response shapes; register in `allSchemas`
6. **Use shared schemas** via `$ref` for reusable shapes (common params, querystrings, response wrappers). Register them in `src/schemas/index.ts` and add to `allSchemas`. Keep route-specific request schemas inline.
7. **Use domain errors in services** (`NotFoundError`, `ConflictError`, `ForbiddenError`, `BadRequestError`). Routes catch them via `handleServiceError(reply, err)` and translate to `@fastify/sensible` helpers.
8. **Wrap multi-step ops** in `db.$transaction()` for consistency
9. **Run `Promise.all([count, findMany])`** for pagination
10. **Sanitize user input** with `sanitizeHtml()` before storing
11. **If your change touches logic covered by integration tests, review and run those tests.** Before finishing, inspect the relevant test file(s) in `tests/` to ensure your changes don't break existing assertions or data setup/teardown, and run `npm run test` to confirm everything passes.
12. **Run `npm run lint` before finishing** — Ensure ESLint passes with no errors or warnings after making changes.
13. **When in doubt, ask the user.** If you are uncertain about requirements, design decisions, or the best approach to a problem, do not guess. Present your uncertainty clearly, explain the options you see, and ask the user for guidance before proceeding.


---

## Database Changes Checklist

1. Edit `prisma/schema.prisma`
2. Run `npm run db:migrate` (creates migration + applies + regenerates client)
3. Update mapper in `src/lib/mappers.ts` if response shape changed
4. Update/add service in `src/services/` if business logic changed
5. Update/add JSON Schema in `src/schemas/index.ts`
6. **Regenerate frontend API**: Ensure backend is running, then `cd ../books-app && npm run codegen`
7. Add/update integration tests in `tests/`

---

## OpenAPI / Frontend Codegen

The backend auto-generates OpenAPI docs at `GET /docs/json`. The frontend uses this to generate RTK Query API clients.

When you change routes, schemas, or response shapes:
1. The backend must be running
2. Frontend runs `npm run codegen` which fetches `http://localhost:3000/docs/json`
3. Frontend API files in `books-app/src/shared/api/*.generated.ts` update automatically

See `../books-app/AGENTS.md` for frontend conventions.

---

## Related

- Frontend project: `../books-app/`
- Frontend guides: See `../books-app/AGENTS.md` and its linked guides (FSD, Redux, React Patterns)
