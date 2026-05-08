import { db } from "../lib/db";
import type { User } from "../generated/prisma/client";
import { bookInclude } from "../lib/includes";
import { toLibraryBook, toUserProfile, toPreferences, toUserBadge } from "../lib/mappers";

/* ─── Exported service functions ─── */

export async function getProfile(user: User) {
  return toUserProfile(user);
}

export async function updateProfile(
  userId: string,
  name?: string,
  avatarHue?: number,
  readingGoal?: number
) {
  const updated = await db.user.update({
    where: { id: userId },
    data: {
      ...(name !== undefined && { name }),
      ...(avatarHue !== undefined && { avatarHue }),
      ...(readingGoal !== undefined && { readingGoal }),
    },
  });

  return toUserProfile(updated);
}

export async function getPreferences(userId: string) {
  let prefs = await db.userPreferences.findUnique({ where: { userId } });
  if (!prefs) {
    prefs = await db.userPreferences.create({ data: { userId } });
  }

  return toPreferences(prefs);
}

export async function updatePreferences(
  userId: string,
  body: {
    readingGoalMinutes: number;
    reminderTime?: string | null;
    reminderEnabled: boolean;
    preferredGenres: string[];
    notifyPush: boolean;
    notifyWeeklyDigest: boolean;
    notifyChallenge: boolean;
    profileVisibility: string;
  }
) {
  const {
    readingGoalMinutes,
    reminderTime,
    reminderEnabled,
    preferredGenres,
    notifyPush,
    notifyWeeklyDigest,
    notifyChallenge,
    profileVisibility,
  } = body;

  const prefs = await db.userPreferences.upsert({
    where: { userId },
    create: {
      userId,
      readingGoalMinutes,
      reminderTime: reminderTime ?? null,
      reminderEnabled,
      preferredGenres,
      notifyPush,
      notifyWeeklyDigest,
      notifyChallenge,
      profileVisibility,
    },
    update: {
      readingGoalMinutes,
      reminderTime: reminderTime ?? null,
      reminderEnabled,
      preferredGenres,
      notifyPush,
      notifyWeeklyDigest,
      notifyChallenge,
      profileVisibility,
    },
  });

  return toPreferences(prefs);
}

export async function getBadges(userId: string) {
  const badges = await db.userBadge.findMany({
    where: { userId },
    include: { badge: true },
    orderBy: { awardedAt: "desc" },
  });

  return { data: badges.map(toUserBadge) };
}

export async function getCurrentBook(userId: string) {
  const item = await db.libraryItem.findFirst({
    where: { userId, status: "reading" },
    orderBy: { addedAt: "desc" },
    include: { book: { include: bookInclude } },
  });

  if (!item) return null;
  return toLibraryBook(item);
}
