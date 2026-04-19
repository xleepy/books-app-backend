import { createPrismaClient } from "./lib/prisma";
import { rateLimitedFetch } from "./lib/rate-limit";
import { SEED_SUBJECTS } from "./fetch-subjects";

const prisma = createPrismaClient();

interface OLWork {
  key: string; // "/works/OL123W"
  title: string;
  authors?: Array<{ key: string; name: string }>;
  cover_id?: number;
  first_publish_year?: number;
}

interface OLSubjectWorks {
  works?: OLWork[];
}

function coverUrl(coverId: number): string {
  return `https://covers.openlibrary.org/b/id/${coverId}-L.jpg`;
}

export async function fetchBooks(): Promise<void> {
  const subjects = await prisma.subject.findMany({
    where: { slug: { in: SEED_SUBJECTS } },
    orderBy: { slug: "asc" },
  });

  console.log(`Fetching books for ${subjects.length} subjects (up to 100 each)...`);

  for (const subject of subjects) {
    process.stdout.write(`  → ${subject.slug} ... `);

    const res = await rateLimitedFetch(
      `https://openlibrary.org/subjects/${subject.slug}.json?limit=100`
    );

    if (!res.ok) {
      console.log(`HTTP ${res.status}, skipping`);
      continue;
    }

    const data: OLSubjectWorks = await res.json();
    const works = data.works ?? [];
    let upserted = 0;

    for (const work of works) {
      const openLibraryId = work.key.replace("/works/", "");
      if (!openLibraryId || !work.title) continue;

      const primaryAuthorName = work.authors?.[0]?.name ?? "Unknown";

      const book = await prisma.book.upsert({
        where: { openLibraryId },
        create: {
          openLibraryId,
          title: work.title,
          author: primaryAuthorName,
          coverUrl: work.cover_id ? coverUrl(work.cover_id) : null,
          firstPublishYear: work.first_publish_year ?? null,
        },
        update: {
          // Only fill in fields that are still null — don't overwrite richer data
          ...(work.cover_id ? { coverUrl: coverUrl(work.cover_id) } : {}),
          ...(work.first_publish_year
            ? { firstPublishYear: work.first_publish_year }
            : {}),
        },
        select: { id: true },
      });

      // Upsert authors + book_authors join
      for (const authorData of work.authors ?? []) {
        const authorOLId = authorData.key.replace("/authors/", "");
        if (!authorOLId || !authorData.name) continue;

        const author = await prisma.author.upsert({
          where: { openLibraryId: authorOLId },
          create: { openLibraryId: authorOLId, name: authorData.name },
          update: {},
          select: { id: true },
        });

        await prisma.bookAuthor.upsert({
          where: { bookId_authorId: { bookId: book.id, authorId: author.id } },
          create: { bookId: book.id, authorId: author.id },
          update: {},
        });
      }

      // Book ↔ subject junction
      await prisma.bookSubject.upsert({
        where: { bookId_subjectId: { bookId: book.id, subjectId: subject.id } },
        create: { bookId: book.id, subjectId: subject.id },
        update: {},
      });

      upserted++;
    }

    console.log(`✓ (${upserted} books)`);
  }

  const total = await prisma.book.count();
  console.log(`\nDone — ${total} books in DB.`);
}

if (require.main === module) {
  fetchBooks()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
