import "dotenv/config";

async function main() {
  console.log("Seed scripts coming in Phase 1.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
