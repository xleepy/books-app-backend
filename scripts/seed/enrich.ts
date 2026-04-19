import { createPrismaClient } from "./lib/prisma";
import { rateLimitedFetch } from "./lib/rate-limit";

const prisma = createPrismaClient();

interface OLWork {
  description?: string | { value: string };
  number_of_pages?: number;
}

interface OLRatings {
  summary?: { average?: number; count?: number };
}

function extractDescription(raw: OLWork["description"]): string | null {
  if (!raw) return null;
  if (typeof raw === "string") return raw;
  if (typeof raw === "object" && "value" in raw) return raw.value;
  return null;
}

export async function enrichBooks(): Promise<void> {
  // Only enrich books that are missing description OR rating — idempotent
  const books = await prisma.book.findMany({
    where: { OR: [{ description: null }, { ratingAvg: null }] },
    select: { id: true, openLibraryId: true },
    orderBy: { createdAt: "asc" },
  });

  console.log(`Enriching ${books.length} books with descriptions + ratings...`);

  let enriched = 0;

  for (const book of books) {
    process.stdout.write(
      `  [${enriched + 1}/${books.length}] ${book.openLibraryId} ... `
    );

    let description: string | null = null;
    let ratingAvg: number | null = null;
    let ratingCount: number | null = null;

    // Work detail (description)
    const workRes = await rateLimitedFetch(
      `https://openlibrary.org/works/${book.openLibraryId}.json`
    );

    if (workRes.ok) {
      const work: OLWork = await workRes.json();
      description = extractDescription(work.description);
    }

    // Ratings
    const ratingsRes = await rateLimitedFetch(
      `https://openlibrary.org/works/${book.openLibraryId}/ratings.json`
    );

    if (ratingsRes.ok) {
      const ratings: OLRatings = await ratingsRes.json();
      ratingAvg = ratings.summary?.average ?? null;
      ratingCount = ratings.summary?.count ?? null;
    }

    const patch = {
      ...(description !== null ? { description } : {}),
      ...(ratingAvg !== null ? { ratingAvg } : {}),
      ...(ratingCount !== null ? { ratingCount } : {}),
    };

    if (Object.keys(patch).length > 0) {
      await prisma.book.update({ where: { id: book.id }, data: patch });
    }

    enriched++;
    const parts = [];
    if (description) parts.push("desc");
    if (ratingAvg) parts.push(`★${ratingAvg.toFixed(1)}`);
    console.log(`✓ (${parts.join(", ") || "no new data"})`);
  }

  console.log(`\nDone — ${enriched} books enriched.`);
}

if (require.main === module) {
  enrichBooks()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
