# Books App Backend

Fastify + TypeScript + Prisma backend for the Books App.

## Prerequisites

- [Node.js](https://nodejs.org/) 20+
- [Docker](https://www.docker.com/) (for local Postgres)

## Getting started

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

The defaults in `.env.example` match the Docker Compose setup, so no edits are needed for local dev.

### 3. Start Postgres

```bash
docker compose up -d postgres
```

### 4. Generate the Prisma client

```bash
npm run db:generate
```

This generates the TypeScript client into `src/generated/prisma/`. Required before running the seed scripts or the dev server.

### 5. Run migrations

```bash
npm run db:migrate
```

Applies the schema to your local Postgres. Also re-runs `db:generate` automatically, but step 4 is still useful to run first for type-checking without a DB connection.

### 6. Seed the database

Pull ~3 000 books from the Open Library API into Postgres:

```bash
npm run seed
```

This runs three steps in order:

1. **Subjects** — fetches ~50 curated genres/subjects and builds the subject relationship graph
2. **Books** — fetches up to 100 books per subject (title, author, cover URL, publish year)
3. **Enrich** — fetches full description and community rating for each book

The pipeline runs at 3 req/s (Open Library rate limit) and takes roughly 45–60 minutes for a full run. You can also run a single step:

```bash
npm run seed subjects   # only step 1
npm run seed books      # only step 2
npm run seed enrich     # only step 3
```

All steps are idempotent — safe to re-run; existing rows are updated, not duplicated.

**Check progress while seeding:**

```bash
docker compose exec postgres psql -U booksapp -d booksapp -c "
  SELECT
    (SELECT COUNT(*) FROM books) AS books,
    (SELECT COUNT(*) FROM subjects) AS subjects,
    (SELECT COUNT(*) FROM authors) AS authors;
"
```

Or open Prisma Studio for a visual view:

```bash
npm run db:studio
```

### 7. Start the dev server

```bash
npm run dev
```

The server starts at `http://localhost:3000`. Verify with:

```bash
curl http://localhost:3000/healthz
```

## Running with Docker Compose (DB + backend together)

Set the required env var, then start everything:

```bash
export SUPABASE_URL=https://your-project-ref.supabase.co
docker compose up --build
```

This builds the app image, starts Postgres, waits for it to be healthy, then starts the backend. Migrations run automatically on startup.

Verify with:

```bash
curl http://localhost:3000/healthz
```

To stop and remove containers:

```bash
docker compose down
```

Add `-v` to also delete the Postgres volume (wipes all data):

```bash
docker compose down -v
```

## Running with Docker (standalone)

Build the image:

```bash
docker build -t books-app-backend .
```

Run the container (requires a running Postgres instance and a `DATABASE_URL`):

```bash
docker run --rm \
  -p 3000:3000 \
  -e DATABASE_URL="postgresql://postgres:postgres@host.docker.internal:5432/booksapp" \
  books-app-backend
```

> On startup the container runs `prisma migrate deploy` then starts the server.
> Swap `host.docker.internal` for your actual Postgres host if not using Docker Desktop.

Verify with:

```bash
curl http://localhost:3000/healthz
```

## Useful scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start dev server with live reload |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm run start` | Run compiled build |
| `npm run typecheck` | Type-check without emitting |
| `npm run lint` | Run ESLint |
| `npm run db:migrate` | Create and apply a new migration |
| `npm run db:migrate:deploy` | Apply pending migrations (production) |
| `npm run db:generate` | Regenerate Prisma client |
| `npm run db:studio` | Open Prisma Studio |
| `npm run seed` | Seed the database (subjects → books → enrich) |
| `npm run seed subjects` | Seed only subjects + subject graph |
| `npm run seed books` | Seed only books per subject |
| `npm run seed enrich` | Enrich books with descriptions + ratings |
| `npm run test` | Run integration tests (requires local Postgres) |
| `npm run test:watch` | Run tests in watch mode |

## Testing

Integration tests use [Vitest](https://vitest.dev/) and run against a dedicated `booksapp_test` database on the local Docker Postgres instance.

### Prerequisites

The main Postgres container must be running:

```bash
docker compose up -d postgres
```

### Run tests

```bash
npm run test
```

The global setup (`tests/global-setup.ts`) creates the `booksapp_test` database, runs `prisma migrate deploy` against it, and drops it again on teardown. Tests use `buildApp({ testUser })` to bypass JWT verification — no real Supabase project is needed to run tests.

### What is tested

- `tests/library.test.ts` — `POST /library`: 201 response shape, DB persistence, auto-user creation on first add, 404 for unknown book, 409 on duplicate, 400 for invalid status.
