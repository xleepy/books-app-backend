import { createPrismaClient } from "./lib/prisma";
import { rateLimitedFetch } from "./lib/rate-limit";

const prisma = createPrismaClient();

// ~50 well-populated Open Library subject slugs covering the app's genre range
export const SEED_SUBJECTS = [
  "fiction",
  "fantasy",
  "science_fiction",
  "mystery",
  "thriller",
  "romance",
  "historical_fiction",
  "horror",
  "adventure",
  "literary_fiction",
  "dystopian_fiction",
  "magic_realism",
  "crime",
  "classics",
  "short_stories",
  "young_adult_fiction",
  "juvenile_fiction",
  "biography",
  "autobiography",
  "memoir",
  "history",
  "science",
  "philosophy",
  "psychology",
  "self_improvement",
  "politics",
  "economics",
  "technology",
  "nature",
  "travel",
  "cooking",
  "art",
  "music",
  "sports",
  "religion",
  "mythology",
  "folklore",
  "social_science",
  "health",
  "true_crime",
  "essays",
  "satire",
  "war",
  "poetry",
  "drama",
  "graphic_novels",
  "spy_stories",
  "space",
  "time_travel",
];

interface OLSubjectDetail {
  name: string;
  subjects?: Array<{ name: string; count: number }>;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/['']/g, "")
    .replace(/[\s\-&/]+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

export async function fetchSubjects(): Promise<void> {
  console.log(`Fetching ${SEED_SUBJECTS.length} seed subjects...`);

  for (const slug of SEED_SUBJECTS) {
    process.stdout.write(`  → ${slug} ... `);

    const res = await rateLimitedFetch(
      `https://openlibrary.org/subjects/${slug}.json?limit=1&details=true`
    );

    if (!res.ok) {
      console.log(`HTTP ${res.status}, skipping`);
      continue;
    }

    const data: OLSubjectDetail = await res.json();
    const name = data.name || slug.replace(/_/g, " ");

    const subject = await prisma.subject.upsert({
      where: { slug },
      create: { name, slug },
      update: { name },
    });

    const related = data.subjects?.slice(0, 20) ?? [];

    for (const rel of related) {
      const relSlug = slugify(rel.name);
      if (!relSlug || relSlug === slug) continue;

      const relSubject = await prisma.subject.upsert({
        where: { slug: relSlug },
        create: { name: rel.name, slug: relSlug },
        update: {},
      });

      // Normalise weight: count relative to 1000, capped at 1.0
      const weight = Math.min(1.0, rel.count / 1000);

      await prisma.subjectEdge.upsert({
        where: { fromId_toId: { fromId: subject.id, toId: relSubject.id } },
        create: { fromId: subject.id, toId: relSubject.id, weight },
        update: { weight },
      });
    }

    console.log(`✓ (${related.length} related subjects)`);
  }

  const total = await prisma.subject.count();
  console.log(`\nDone — ${total} subjects in DB.`);
}

if (require.main === module) {
  fetchSubjects()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
