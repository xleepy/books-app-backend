import "dotenv/config";
import { fetchSubjects } from "./fetch-subjects";
import { fetchBooks } from "./fetch-books";
import { enrichBooks } from "./enrich";
import { seedChallenges } from "./challenges";

async function main() {
  console.log("=== Books App — Seed Pipeline ===\n");
  console.log("Prerequisites: npm run db:generate && npm run db:migrate\n");

  const step = process.argv[2]; // optional: 'subjects' | 'books' | 'enrich' | 'challenges'

  if (!step || step === "subjects") {
    console.log("[1/4] Fetching subjects + subject graph...");
    await fetchSubjects();
    console.log();
  }

  if (!step || step === "books") {
    console.log("[2/4] Fetching books per subject...");
    await fetchBooks();
    console.log();
  }

  if (!step || step === "enrich") {
    console.log("[3/4] Enriching books with descriptions + ratings...");
    await enrichBooks();
    console.log();
  }

  if (!step || step === "challenges") {
    console.log("[4/4] Seeding badges + challenges...");
    await seedChallenges();
    console.log();
  }

  console.log("=== Seeding complete ===");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
