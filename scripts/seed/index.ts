import "dotenv/config";
import { fetchSubjects } from "./fetch-subjects";
import { fetchBooks } from "./fetch-books";
import { enrichBooks } from "./enrich";

async function main() {
  console.log("=== Books App — Phase 1 Seed Pipeline ===\n");
  console.log("Prerequisites: npm run db:generate && npm run db:migrate\n");

  const step = process.argv[2]; // optional: 'subjects' | 'books' | 'enrich'

  if (!step || step === "subjects") {
    console.log("[1/3] Fetching subjects + subject graph...");
    await fetchSubjects();
    console.log();
  }

  if (!step || step === "books") {
    console.log("[2/3] Fetching books per subject...");
    await fetchBooks();
    console.log();
  }

  if (!step || step === "enrich") {
    console.log("[3/3] Enriching books with descriptions + ratings...");
    await enrichBooks();
    console.log();
  }

  console.log("=== Seeding complete ===");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
