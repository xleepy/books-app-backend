import { db } from "../lib/db";
import { generateSlug } from "../lib/slug";
import { toChallenge, toLeaderboardEntry } from "../lib/mappers";
import { NotFoundError, ForbiddenError, BadRequestError } from "../lib/errors";
import { sendChallengeCancelledNotification } from "./notifications";

function startOfDayUTC(d: Date): Date {
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

/* ─── Exported service functions ─── */

export async function getGlobalLeaderboard(
  limit: number,
  currentUserId: string,
) {
  const users = await db.user.findMany({
    orderBy: [{ xpTotal: "desc" }, { booksFinished: "desc" }],
    take: limit,
  });

  return {
    data: users.map((u, i) => toLeaderboardEntry(u, i + 1, currentUserId)),
  };
}

export async function listChallenges(
  userId: string,
  filter: "active" | "monthly" | "yearly" | "weekly" | "custom" = "active",
) {
  const today = startOfDayUTC(new Date());
  const variantFilter =
    filter === "monthly" ||
    filter === "yearly" ||
    filter === "weekly" ||
    filter === "custom"
      ? filter
      : undefined;

  const challenges = await db.challenge.findMany({
    where: {
      activeTo: { gte: today },
      ...(variantFilter ? { variant: variantFilter } : {}),
    },
    include: { badge: true, creator: true },
    orderBy: [{ variant: "asc" }, { activeFrom: "desc" }],
  });

  const userChallenges = await db.userChallenge.findMany({
    where: {
      userId,
      challengeId: { in: challenges.map((c) => c.id) },
    },
  });
  const progressMap = new Map(
    userChallenges.map((uc) => [uc.challengeId, uc.current]),
  );

  const participantCounts = await db.userChallenge.groupBy({
    by: ["challengeId"],
    where: { challengeId: { in: challenges.map((c) => c.id) } },
    _count: { challengeId: true },
  });
  const countMap = new Map(
    participantCounts.map((pc) => [pc.challengeId, pc._count.challengeId]),
  );

  const data = challenges.map((c) =>
    toChallenge(
      c,
      progressMap.get(c.id) ?? 0,
      progressMap.has(c.id),
      c.creatorId === userId,
      countMap.get(c.id) ?? 0,
    ),
  );

  return { data };
}

export async function createChallenge(
  userId: string,
  body: {
    title: string;
    description?: string;
    variant: string;
    metric: string;
    target: number;
    activeFrom: string;
    activeTo: string;
    badgeId?: string;
  },
) {
  if (body.badgeId) {
    const badge = await db.badge.findUnique({ where: { id: body.badgeId } });
    if (!badge) throw new NotFoundError("Badge not found");
  }

  const activeFrom = startOfDayUTC(new Date(body.activeFrom));
  const activeTo = startOfDayUTC(new Date(body.activeTo));
  const today = startOfDayUTC(new Date());

  if (activeFrom < today) {
    throw new BadRequestError("activeFrom must be today or later");
  }
  if (activeTo <= activeFrom) {
    throw new BadRequestError("activeTo must be after activeFrom");
  }

  const challenge = await db.challenge.create({
    data: {
      slug: generateSlug(body.title),
      title: body.title,
      description: body.description ?? null,
      variant: body.variant,
      metric: body.metric,
      target: body.target,
      creatorId: userId,
      badgeId: body.badgeId ?? null,
      activeFrom,
      activeTo,
    },
    include: { badge: true, creator: true },
  });

  await db.userChallenge.create({
    data: {
      userId,
      challengeId: challenge.id,
      current: 0,
    },
  });

  return { data: toChallenge(challenge, 0, true, true, 1) };
}

export async function updateChallenge(
  id: string,
  userId: string,
  body: {
    title?: string;
    description?: string;
  },
) {
  const challenge = await db.challenge.findUnique({ where: { id } });
  if (!challenge) throw new NotFoundError("Challenge not found");
  if (challenge.creatorId !== userId) {
    throw new ForbiddenError("Only the creator can update this challenge");
  }

  const data: { title?: string; description?: string | null } = {};
  if (body.title !== undefined) data.title = body.title;
  if (body.description !== undefined)
    data.description = body.description ?? null;

  const updated = await db.challenge.update({
    where: { id },
    data,
    include: { badge: true, creator: true },
  });

  const uc = await db.userChallenge.findUnique({
    where: { userId_challengeId: { userId, challengeId: id } },
  });

  const participantCount = await db.userChallenge.count({
    where: { challengeId: id },
  });

  return {
    data: toChallenge(
      updated,
      uc?.current ?? 0,
      uc != null,
      updated.creatorId === userId,
      participantCount,
    ),
  };
}

export async function getChallenge(id: string, userId: string) {
  const challenge = await db.challenge.findUnique({
    where: { id },
    include: { badge: true, creator: true },
  });
  if (!challenge) throw new NotFoundError("Challenge not found");

  const uc = await db.userChallenge.findUnique({
    where: { userId_challengeId: { userId, challengeId: id } },
  });

  const participantCount = await db.userChallenge.count({
    where: { challengeId: id },
  });

  return {
    data: toChallenge(
      challenge,
      uc?.current ?? 0,
      uc != null,
      challenge.creatorId === userId,
      participantCount,
    ),
  };
}

export async function deleteChallenge(id: string, userId: string) {
  const challenge = await db.challenge.findUnique({ where: { id } });
  if (!challenge) throw new NotFoundError("Challenge not found");
  if (challenge.creatorId !== userId) {
    throw new ForbiddenError("Only the creator can delete this challenge");
  }

  const participants = await db.userChallenge.findMany({
    where: { challengeId: id },
    select: { userId: true },
  });
  const participantIds = participants
    .map((p) => p.userId)
    .filter((uid) => uid !== userId);

  await db.challenge.delete({ where: { id } });

  if (participantIds.length > 0) {
    sendChallengeCancelledNotification(participantIds, challenge.title).catch(
      () => {},
    );
  }
}

export async function joinChallenge(id: string, userId: string) {
  const challenge = await db.challenge.findUnique({ where: { id } });
  if (!challenge) throw new NotFoundError("Challenge not found");

  const existing = await db.userChallenge.findUnique({
    where: { userId_challengeId: { userId, challengeId: id } },
  });

  if (existing) {
    return {
      data: {
        challengeId: id,
        current: existing.current,
        completed: existing.completedAt != null,
        completedAt: existing.completedAt?.toISOString() ?? null,
      },
    };
  }

  const uc = await db.userChallenge.create({
    data: {
      userId,
      challengeId: id,
      current: 0,
    },
  });

  return {
    data: {
      challengeId: id,
      current: uc.current,
      completed: false,
      completedAt: null,
    },
  };
}

export async function leaveChallenge(id: string, userId: string) {
  const challenge = await db.challenge.findUnique({ where: { id } });
  if (!challenge) throw new NotFoundError("Challenge not found");
  if (challenge.creatorId === userId) {
    throw new ForbiddenError("Creator cannot leave their own challenge");
  }

  await db.userChallenge.delete({
    where: { userId_challengeId: { userId, challengeId: id } },
  });
}

export async function getChallengeProgress(id: string, userId: string) {
  const challenge = await db.challenge.findUnique({ where: { id } });
  if (!challenge) throw new NotFoundError("Challenge not found");

  const uc = await db.userChallenge.findUnique({
    where: { userId_challengeId: { userId, challengeId: id } },
  });

  return {
    challengeId: id,
    current: uc?.current ?? 0,
    target: challenge.target,
    completed: uc?.completedAt != null,
    completedAt: uc?.completedAt?.toISOString() ?? null,
  };
}

export async function getChallengeLeaderboard(
  id: string,
  limit: number,
  currentUserId: string,
) {
  const challenge = await db.challenge.findUnique({ where: { id } });
  if (!challenge) throw new NotFoundError("Challenge not found");

  const entries = await db.userChallenge.findMany({
    where: { challengeId: id },
    orderBy: [{ current: "desc" }],
    take: limit,
    include: { user: true },
  });

  const data = entries.map((e, i) =>
    toLeaderboardEntry(
      {
        id: e.user.id,
        name: e.user.name,
        level: e.user.level,
        levelTitle: e.user.levelTitle,
        booksFinished: e.current,
        xpTotal: e.user.xpTotal,
        avatarHue: e.user.avatarHue,
      },
      i + 1,
      currentUserId,
    ),
  );

  return { data };
}
