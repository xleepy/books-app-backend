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

Read the Backend Guide before making changes to:
- **Database schema** → Prisma conventions, migrations, indexes
- **API routes** → Fastify route structure, schema validation, auth
- **Response shapes** → Mappers, shared JSON Schemas
- **Tests** → Integration test patterns with `app.inject()`

---

## Quick Commands

```bash
npm run dev               # Dev server (requires Postgres)
npm run typecheck         # TypeScript check
npm run db:migrate        # Create + apply migration + regenerate client
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
│   ├── getOrCreateUser.ts
│   ├── xp.ts           # XP/level calculations
│   ├── badges.ts       # Badge award logic
│   └── sanitize.ts     # HTML sanitization
├── routes/             # One file per domain (library.ts, books.ts, etc.)
├── schemas/index.ts    # Shared JSON Schemas ($ref definitions)
└── types/fastify.d.ts  # JWT type augmentation
```

---

## Key Conventions

1. **Never edit generated files manually.** Files in `src/generated/prisma/` (Prisma client) or any file with a `.generated.` suffix are produced by codegen tools. Always regenerate them via the appropriate command (`npm run db:generate`, `npx prisma generate`, etc.). Manual edits will be lost on the next regeneration and can introduce type mismatches.
2. **Prisma schema**: `snake_case` columns via `@map()`, `@@map()` for tables, UUID IDs, explicit relations
3. **Always use mappers** — never return raw Prisma objects from handlers
4. **Define JSON Schemas** for all route request/response shapes; register in `allSchemas`
5. **Use `@fastify/sensible` helpers** (`reply.notFound()`, `reply.conflict()`) — don't throw
6. **Wrap multi-step ops** in `db.$transaction()` for consistency
7. **Run `Promise.all([count, findMany])`** for pagination
8. **Sanitize user input** with `sanitizeHtml()` before storing
9. **If your change touches logic covered by integration tests, review and run those tests.** Before finishing, inspect the relevant test file(s) in `tests/` to ensure your changes don't break existing assertions or data setup/teardown, and run `npm run test` to confirm everything passes.

---

## Database Changes Checklist

1. Edit `prisma/schema.prisma`
2. Run `npm run db:migrate` (creates migration + applies + regenerates client)
3. Update mapper in `src/lib/mappers.ts` if response shape changed
4. Update/add JSON Schema in `src/schemas/index.ts`
5. **Regenerate frontend API**: Ensure backend is running, then `cd ../books-app && npm run codegen`
6. Add/update integration tests in `tests/`

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
