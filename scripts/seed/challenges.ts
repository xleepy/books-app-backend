import { db } from "../../src/lib/db";

// ─── Badge definitions ────────────────────────────────────────────────────────

const BADGES = [
  {
    slug: "first-chapter",
    name: "First Chapter",
    description: "Finish your first book",
  },
  {
    slug: "on-fire",
    name: "On Fire",
    description: "Maintain a 7-day reading streak",
  },
  {
    slug: "critic",
    name: "Critic",
    description: "Write at least 5 book reviews",
  },
  {
    slug: "centurion",
    name: "Centurion",
    description: "Finish 100 books",
  },
  {
    slug: "champion",
    name: "Champion",
    description: "Complete any reading challenge",
  },
];

// ─── Challenge definitions ────────────────────────────────────────────────────

const YEAR = 2026;

const MONTHLY_CHALLENGES = [
  { month: 1, title: "January Reads", subtitle: "Start the new year reading", target: 2 },
  { month: 2, title: "February Reads", subtitle: "Love books this month", target: 2 },
  { month: 3, title: "March Reads", subtitle: "Spring into reading", target: 3 },
  { month: 4, title: "April Reads", subtitle: "Read a book a week", target: 4 },
  { month: 5, title: "May Reads", subtitle: "May the pages be with you", target: 4 },
  { month: 6, title: "June Reads", subtitle: "Summer reading starts now", target: 4 },
  { month: 7, title: "July Reads", subtitle: "Beat the summer heat with a book", target: 5 },
  { month: 8, title: "August Reads", subtitle: "August book marathon", target: 5 },
  { month: 9, title: "September Reads", subtitle: "Back-to-school reading season", target: 4 },
  { month: 10, title: "October Reads", subtitle: "Read something spooky", target: 3 },
  { month: 11, title: "November Reads", subtitle: "Autumn page-turner season", target: 3 },
  { month: 12, title: "December Reads", subtitle: "End the year with great books", target: 2 },
];

const YEARLY_CHALLENGES = [
  {
    slug: `year-of-books-${YEAR}`,
    title: "Year of Books",
    subtitle: `Read 24 books in ${YEAR}`,
    goal: "Read 24 books",
    target: 24,
  },
  {
    slug: `century-reader-${YEAR}`,
    title: "Century Reader",
    subtitle: `Finish 100 books in ${YEAR}`,
    goal: "Read 100 books",
    target: 100,
  },
];

// ─── Seed function ────────────────────────────────────────────────────────────

export async function seedChallenges(): Promise<void> {
  // 1. Seed badges
  for (const badge of BADGES) {
    await db.badge.upsert({
      where: { slug: badge.slug },
      update: badge,
      create: badge,
    });
  }
  console.log(`  ✓ ${BADGES.length} badges seeded`);

  // Look up the "champion" badge id for challenge rewards
  const championBadge = await db.badge.findUnique({ where: { slug: "champion" } });

  // 2. Seed monthly challenges
  let monthCount = 0;
  for (const c of MONTHLY_CHALLENGES) {
    const paddedMonth = String(c.month).padStart(2, "0");
    const lastDay = new Date(YEAR, c.month, 0).getDate();
    const slug = `${YEAR}-${paddedMonth}-reads`;

    await db.challenge.upsert({
      where: { slug },
      update: {
        title: c.title,
        subtitle: c.subtitle,
        goal: `Read ${c.target} book${c.target > 1 ? "s" : ""} in ${new Date(YEAR, c.month - 1).toLocaleString("en-US", { month: "long" })}`,
        variant: "monthly",
        target: c.target,
        badgeId: championBadge?.id ?? null,
        activeFrom: new Date(`${YEAR}-${paddedMonth}-01`),
        activeTo: new Date(`${YEAR}-${paddedMonth}-${lastDay}`),
      },
      create: {
        slug,
        title: c.title,
        subtitle: c.subtitle,
        goal: `Read ${c.target} book${c.target > 1 ? "s" : ""} in ${new Date(YEAR, c.month - 1).toLocaleString("en-US", { month: "long" })}`,
        variant: "monthly",
        target: c.target,
        badgeId: championBadge?.id ?? null,
        activeFrom: new Date(`${YEAR}-${paddedMonth}-01`),
        activeTo: new Date(`${YEAR}-${paddedMonth}-${lastDay}`),
      },
    });
    monthCount++;
  }
  console.log(`  ✓ ${monthCount} monthly challenges seeded`);

  // 3. Seed yearly challenges
  for (const c of YEARLY_CHALLENGES) {
    await db.challenge.upsert({
      where: { slug: c.slug },
      update: {
        title: c.title,
        subtitle: c.subtitle,
        goal: c.goal,
        variant: "yearly",
        target: c.target,
        badgeId: championBadge?.id ?? null,
        activeFrom: new Date(`${YEAR}-01-01`),
        activeTo: new Date(`${YEAR}-12-31`),
      },
      create: {
        slug: c.slug,
        title: c.title,
        subtitle: c.subtitle,
        goal: c.goal,
        variant: "yearly",
        target: c.target,
        badgeId: championBadge?.id ?? null,
        activeFrom: new Date(`${YEAR}-01-01`),
        activeTo: new Date(`${YEAR}-12-31`),
      },
    });
  }
  console.log(`  ✓ ${YEARLY_CHALLENGES.length} yearly challenges seeded`);
}
