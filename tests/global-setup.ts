import { Client } from "pg";
import { execSync } from "node:child_process";
import path from "node:path";

const dbUrl = new URL(
  process.env.DATABASE_URL ??
    "postgresql://booksapp:booksapp@localhost:5433/booksapp_test",
);

const ADMIN_URL = `postgresql://${decodeURIComponent(dbUrl.username)}:${decodeURIComponent(dbUrl.password)}@${dbUrl.hostname}:${dbUrl.port}/booksapp`;
const TEST_DB_URL = `postgresql://${decodeURIComponent(dbUrl.username)}:${decodeURIComponent(dbUrl.password)}@${dbUrl.hostname}:${dbUrl.port}/booksapp_test`;
const ROOT = path.resolve(__dirname, "..");

export async function setup() {
  const client = new Client({ connectionString: ADMIN_URL });
  await client.connect();
  await client.query("DROP DATABASE IF EXISTS booksapp_test WITH (FORCE)");
  await client.query("CREATE DATABASE booksapp_test OWNER booksapp");
  await client.end();

  execSync("npx prisma migrate deploy", {
    cwd: ROOT,
    env: { ...process.env, DATABASE_URL: TEST_DB_URL },
    stdio: "inherit",
  });

  // Point the test runner to the freshly migrated test database.
  process.env.DATABASE_URL = TEST_DB_URL;
}

export async function teardown() {
  const client = new Client({ connectionString: ADMIN_URL });
  await client.connect();
  await client.query("DROP DATABASE IF EXISTS booksapp_test WITH (FORCE)");
  await client.end();
}
