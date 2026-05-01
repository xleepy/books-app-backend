import { db } from "./db";
import { awardXp } from "./xp";
import { awardStreakBadge } from "./badges";

function toDateOnly(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function daysBetween(a: Date, b: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((b.getTime() - a.getTime()) / msPerDay);
}

function getIsoWeekStart(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + mondayOffset);
  date.setHours(0, 0, 0, 0);
  return date;
}

/**
 * Call whenever the user logs a reading activity (e.g. book finished, progress updated).
 *
 * - Same calendar day as last activity → no-op (streak already counted today).
 * - Next calendar day → streak increments; bestStreak updated if exceeded.
 * - Gap > 1 day → streak resets to 1.
 * - weekDays[i] (Mon=0 … Sun=6) is set true for today's ISO weekday.
 * - Awards 50 XP at 7-day streak milestone (once per streak run).
 */
export async function updateStreak(userId: string): Promise<void> {
  await db.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user) return;

    const today = toDateOnly(new Date());
    // ISO weekday: Mon=0, Tue=1, …, Sun=6
    const isoDow = today.getDay() === 0 ? 6 : today.getDay() - 1;

    let newStreak = user.streak;
    const prevDate = user.streakLastDate;

    if (prevDate) {
      const prevDay = toDateOnly(prevDate);
      const diff = daysBetween(prevDay, today);
      if (diff === 0) {
        // Already counted today — nothing to do
        return;
      } else if (diff === 1) {
        // Consecutive day
        newStreak = user.streak + 1;
      } else {
        // Gap; reset
        newStreak = 1;
      }
    } else {
      newStreak = 1;
    }

    const crossedSevenDay = user.streak < 7 && newStreak >= 7;
    const newBestStreak = Math.max(newStreak, user.bestStreak);

    let weekDays = [...user.weekDays] as boolean[];
    const weekStart = getIsoWeekStart(today);
    if (user.streakLastDate) {
      const prevWeekStart = getIsoWeekStart(
        toDateOnly(user.streakLastDate),
      );
      if (weekStart > prevWeekStart) {
        weekDays = weekDays.map(() => false);
      }
    }
    weekDays[isoDow] = true;

    await tx.user.update({
      where: { id: userId },
      data: {
        streak: newStreak,
        bestStreak: newBestStreak,
        streakLastDate: today,
        weekDays,
      },
    });

    // Award streak milestone XP + badge (7-day)
    if (crossedSevenDay) {
      await awardXp(userId, "streak_milestone", 50, { streakDays: 7 });
      await awardStreakBadge(userId);
    }
  });
}
