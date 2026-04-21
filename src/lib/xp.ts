import { db } from "./db";

// ─── XP rules ─────────────────────────────────────────────────────────────────

export const XP_VALUES = {
  book_finished: 100,
  first_book: 50, // bonus on top of book_finished for the very first book
  review: 25,
  streak_milestone: 50, // awarded at 7-day streak
  challenge: 150,
} as const;

// ─── Level system ─────────────────────────────────────────────────────────────

// Level titles (1-indexed; level 5+ uses "Sage")
export const LEVEL_TITLES: Record<number, string> = {
  1: "Newcomer",
  2: "Reader",
  3: "Bookworm",
  4: "Scholar",
  5: "Sage",
};

export const MAX_LEVEL = 5;

/**
 * XP required to advance from level n to level n+1.
 * Formula: n * 100 + (n - 1) * 50  =  150n - 50
 */
export function xpPerLevel(n: number): number {
  return n * 100 + (n - 1) * 50;
}

/**
 * Cumulative XP needed to complete all of level n (i.e. arrive at the start of level n+1).
 * Closed-form: 25 * n * (3n + 1)
 *
 * Verification:
 *   n=1 → 25*1*4 = 100  (level 1 costs 100 XP)
 *   n=2 → 25*2*7 = 350  (level 2 costs 250 XP; 100+250=350)
 *   n=3 → 25*3*10 = 750 (level 3 costs 400 XP; 350+400=750)
 */
export function cumulativeXpToEndLevel(n: number): number {
  return 25 * n * (3 * n + 1);
}

export interface LevelInfo {
  level: number;
  levelTitle: string;
  /** XP earned within the current level (progress toward next level) */
  xpCurrentLevel: number;
  /** XP required to advance from current level to next */
  xpToNextLevel: number;
}

/** Derive level, title, and within-level progress from a raw xp_total. */
export function computeLevelInfo(xpTotal: number): LevelInfo {
  let level = 1;
  while (level < MAX_LEVEL && cumulativeXpToEndLevel(level) <= xpTotal) {
    level++;
  }
  // level is now current (capped at MAX_LEVEL)
  const xpAtLevelStart = level > 1 ? cumulativeXpToEndLevel(level - 1) : 0;
  const xpCurrentLevel = xpTotal - xpAtLevelStart;
  const xpToNextLevel = xpPerLevel(level);
  const levelTitle = LEVEL_TITLES[level] ?? LEVEL_TITLES[MAX_LEVEL];
  return { level, levelTitle, xpCurrentLevel, xpToNextLevel };
}

// ─── Award XP ─────────────────────────────────────────────────────────────────

/**
 * Award XP to a user, record an XP event, and recompute level/title.
 * Mutates the `users` row in-place; returns the new xp_total and level info.
 */
export async function awardXp(
  userId: string,
  source: string,
  xp: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  meta?: Record<string, any>
): Promise<LevelInfo & { newXpTotal: number }> {
  return db.$transaction(async (tx) => {
    await tx.xpEvent.create({ data: { userId, source, xp, meta: meta ?? {} } });

    const updated = await tx.user.update({
      where: { id: userId },
      data: { xpTotal: { increment: xp } },
      select: { xpTotal: true, level: true, levelTitle: true },
    });

    const levelInfo = computeLevelInfo(updated.xpTotal);

    if (updated.level !== levelInfo.level || updated.levelTitle !== levelInfo.levelTitle) {
      await tx.user.update({
        where: { id: userId },
        data: { level: levelInfo.level, levelTitle: levelInfo.levelTitle },
      });
    }

    return { newXpTotal: updated.xpTotal, ...levelInfo };
  });
}
