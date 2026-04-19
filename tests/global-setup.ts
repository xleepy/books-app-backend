import { Client } from "pg";
import { execSync } from "node:child_process";
import path from "node:path";

const ADMIN_URL = "postgresql://booksapp:booksapp@localhost:5432/booksapp";
const TEST_DB_URL = "postgresql://booksapp:booksapp@localhost:5432/booksapp_test";
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
}

export async function teardown() {
  const client = new Client({ connectionString: ADMIN_URL });
  await client.connect();
  await client.query("DROP DATABASE IF EXISTS booksapp_test WITH (FORCE)");
  await client.end();
}
