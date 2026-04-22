import "dotenv/config";
import { Cron } from "croner";
import { db } from "./lib/db";

const nightlyJob = async () => {
  const start = Date.now();
  console.log(`[nightly:${new Date().toISOString()}] Starting...`);

  try {
    // Phase 4: refresh co-liked matrix materialized view
    await db.$executeRaw`REFRESH MATERIALIZED VIEW CONCURRENTLY book_co_like_matrix`;
    console.log(`[nightly] Refreshed book_co_like_matrix.`);

    // Future: precompute recommendation_cache, send digests, etc.
    // await db.$executeRaw`...`;
  } catch (err) {
    console.error("[nightly] Job failed:", err);
    // Re-throw so croner can handle it based on options if needed
    throw err;
  }

  console.log(`[nightly] Done in ${Date.now() - start}ms.`);
};

// Schedule: 03:00 daily, with overrun protection
const job = new Cron("0 3 * * *", { protect: true }, nightlyJob);

console.log(`[worker] Nightly scheduler registered. Next run at: ${job.nextRun()?.toISOString()}`);

// Graceful shutdown
const shutdown = async () => {
  console.log("[worker] Shutting down...");
  job.stop();
  await db.$disconnect();
  process.exit(0);
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
