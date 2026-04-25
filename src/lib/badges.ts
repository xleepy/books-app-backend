import { db } from "./db";
import { sendBadgeAwardedNotification } from "../services/notifications";

export type BadgeTrigger =
  | "book_finished"
  | "review_written"
  | "challenge_completed";

// Maps each trigger to the badge slugs that might be unlocked
type BadgeCheck = (userId: string) => Promise<string[]>;

const BADGE_CHECKS: Record<BadgeTrigger, BadgeCheck> = {
  book_finished: async (userId) => {
    const count = await db.libraryItem.count({
      where: { userId, status: "finished" },
    });
    const slugs: string[] = [];
    if (count === 1) slugs.push("first-chapter");
    if (count >= 100) slugs.push("centurion");
    return slugs;
  },
  review_written: async (userId) => {
    const count = await db.review.count({ where: { userId } });
    if (count >= 5) return ["critic"];
    return [];
  },
  challenge_completed: async () => ["champion"],
};

/**
 * Check whether any badges are earned after a trigger event and award them
 * if not already held. Safe to call multiple times (idempotent via upsert).
 */
export async function checkAndAwardBadges(
  userId: string,
  trigger: BadgeTrigger,
): Promise<void> {
  const slugs = await BADGE_CHECKS[trigger](userId);
  if (!slugs.length) return;

  const badges = await db.badge.findMany({ where: { slug: { in: slugs } } });
  if (!badges.length) return;

  const existing = await db.userBadge.findMany({
    where: { userId, badgeId: { in: badges.map((b) => b.id) } },
    select: { badgeId: true },
  });
  const existingIds = new Set(existing.map((e) => e.badgeId));

  const newBadges = badges.filter((b) => !existingIds.has(b.id));

  await db.userBadge.createMany({
    data: newBadges.map((b) => ({ userId, badgeId: b.id })),
    skipDuplicates: true,
  });

  for (const badge of newBadges) {
    sendBadgeAwardedNotification(userId, badge.name).catch(() => {});
  }
}

/**
 * Award streak badges (called from updateStreak after crossing 7-day mark).
 */
export async function awardStreakBadge(userId: string): Promise<void> {
  const badge = await db.badge.findUnique({ where: { slug: "on-fire" } });
  if (!badge) return;

  const existing = await db.userBadge.findUnique({
    where: { userId_badgeId: { userId, badgeId: badge.id } },
  });
  if (existing) return;

  await db.userBadge.create({
    data: { userId, badgeId: badge.id },
  });

  sendBadgeAwardedNotification(userId, badge.name).catch(() => {});
}
