import type { Book, BookSubject, Subject, Review, User, LibraryItem, Thread, ThreadReply, UserPreferences, UserBadge, Challenge } from "../generated/prisma/client";
import { computeLevelInfo } from "./xp";

type BookWithSubjects = Book & {
  bookSubjects: (BookSubject & { subject: Subject })[];
};

type ReviewWithUser = Review & { user: User };

type LibraryItemWithBook = LibraryItem & {
  book: BookWithSubjects;
};

export function toBook(b: BookWithSubjects) {
  return {
    id: b.id,
    title: b.title,
    author: b.author,
    coverUrl: b.coverUrl ?? null,
    tags: b.bookSubjects.map((bs) => bs.subject.name),
    description: b.description ?? "",
    rating: b.ratingAvg ? Number(b.ratingAvg) : 0,
    reviewCount: b.ratingCount ?? 0,
    pageCount: b.pageCount ?? null,
  };
}

export function toReview(r: ReviewWithUser) {
  return {
    id: r.id,
    reviewer: r.user.name,
    date: r.createdAt.toISOString().split("T")[0],
    rating: r.rating,
    text: r.text ?? "",
    avatarHue: r.user.avatarHue,
  };
}

export function toLibraryBook(item: LibraryItemWithBook) {
  return {
    ...toBook(item.book),
    status: item.status,
    progressPct: Number(item.progressPct),
    currentPage: item.currentPage ?? null,
    timeLeftMin: item.timeLeftMin ?? null,
  };
}

// ─── Thread mappers ────────────────────────────────────────────────────────────

/** Human-readable relative time string ("2h ago", "3d ago", etc.) */
export function toTimeAgo(date: Date): string {
  const secs = Math.floor((Date.now() - date.getTime()) / 1000);
  if (secs < 0) return "just now";
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

type UserForProfile = {
  id: string;
  name: string;
  email: string;
  avatarHue: number;
  level: number;
  levelTitle: string;
  xpTotal: number;
  booksFinished: number;
  pagesRead: number;
  hoursRead: unknown;
  streak: number;
  bestStreak: number;
  weekDays: unknown;
  readingGoal: number;
};

export function toUserProfile(user: UserForProfile) {
  const levelInfo = computeLevelInfo(user.xpTotal);
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    avatarHue: user.avatarHue,
    level: user.level,
    levelTitle: user.levelTitle,
    xpTotal: user.xpTotal,
    xpCurrentLevel: levelInfo.xpCurrentLevel,
    xpToNextLevel: levelInfo.xpToNextLevel,
    booksFinished: user.booksFinished,
    pagesRead: user.pagesRead,
    hoursRead: Number(user.hoursRead),
    streak: user.streak,
    bestStreak: user.bestStreak,
    weekDays: user.weekDays,
    readingGoal: user.readingGoal,
  };
}

type ThreadWithRelations = Thread & {
  creator: User;
  book: Book | null;
  _count: { replies: number };
  threadLikes?: { userId: string }[];
};

type ThreadReplyWithUser = ThreadReply & { user: User };

/** Builds the `bookContext` label shown in thread cards ("Title · Author" or "General") */
function bookContext(book: Book | null): string {
  if (!book) return "General";
  return `${book.title} · ${book.author}`;
}

export function toThread(t: ThreadWithRelations, currentUserId?: string) {
  return {
    id: t.id,
    title: t.title,
    bookContext: bookContext(t.book),
    preview: t.preview ?? "",
    coverUrl: t.book?.coverUrl ?? null,
    replies: t._count.replies,
    likes: t.likes,
    timeAgo: toTimeAgo(t.createdAt),
    spoiler: t.spoiler,
    liked: currentUserId
      ? (t.threadLikes ?? []).some((l) => l.userId === currentUserId)
      : false,
    creatorName: t.creator.name,
    creatorAvatarHue: t.creator.avatarHue,
  };
}

export function toThreadReply(r: ThreadReplyWithUser) {
  return {
    id: r.id,
    body: r.body,
    timeAgo: toTimeAgo(r.createdAt),
    creatorName: r.user.name,
    creatorAvatarHue: r.user.avatarHue,
  };
}

type ThreadDetailWithRelations = Thread & {
  creator: User;
  book: Book | null;
  replies: ThreadReplyWithUser[];
  threadLikes?: { userId: string }[];
};

export function toThreadDetail(t: ThreadDetailWithRelations, currentUserId?: string) {
  return {
    id: t.id,
    title: t.title,
    body: t.body ?? "",
    bookContext: bookContext(t.book),
    coverUrl: t.book?.coverUrl ?? null,
    likes: t.likes,
    timeAgo: toTimeAgo(t.createdAt),
    spoiler: t.spoiler,
    liked: currentUserId
      ? (t.threadLikes ?? []).some((l) => l.userId === currentUserId)
      : false,
    creatorName: t.creator.name,
    creatorAvatarHue: t.creator.avatarHue,
    isOwner: currentUserId ? t.creatorId === currentUserId : false,
    replies: t.replies
      .filter((r) => r.deletedAt == null)
      .map(toThreadReply),
  };
}

// ─── Preferences mapper ────────────────────────────────────────────────────────

export function toPreferences(p: UserPreferences) {
  return {
    readingGoalMinutes: p.readingGoalMinutes,
    reminderTime: p.reminderTime ?? null,
    reminderEnabled: p.reminderEnabled,
    preferredGenres: p.preferredGenres,
    notifyPush: p.notifyPush,
    notifyWeeklyDigest: p.notifyWeeklyDigest,
    notifyChallenge: p.notifyChallenge,
    profileVisibility: p.profileVisibility,
  };
}

// ─── Badge mapper ──────────────────────────────────────────────────────────────

type UserBadgeWithBadge = UserBadge & { badge: { slug: string; name: string; description: string | null; iconUrl: string | null } };

export function toUserBadge(ub: UserBadgeWithBadge) {
  return {
    slug: ub.badge.slug,
    name: ub.badge.name,
    description: ub.badge.description ?? null,
    iconUrl: ub.badge.iconUrl ?? null,
    awardedAt: ub.awardedAt.toISOString(),
  };
}

// ─── Challenge mapper ──────────────────────────────────────────────────────────

type ChallengeWithBadge = Challenge & { badge: { name: string } | null; creator: { name: string } | null };

export function toChallenge(
  c: ChallengeWithBadge,
  current: number,
  isJoined: boolean,
  isCreator: boolean,
  participantCount: number,
) {
  const today = new Date();
  const activeFrom = c.activeFrom;
  const activeTo = c.activeTo;

  let badgeText: string | null = null;
  if (activeFrom && activeTo) {
    if (today < activeFrom) {
      const days = Math.ceil((activeFrom.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      badgeText = `Starts in ${days} days`;
    } else if (today > activeTo) {
      badgeText = "Ended";
    } else {
      const daysLeft = Math.ceil((activeTo.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      badgeText = `${daysLeft} days left`;
    }
  }

  return {
    id: c.id,
    slug: c.slug,
    title: c.title,
    subtitle: c.subtitle ?? "",
    description: c.description ?? null,
    goal: c.goal ?? "",
    variant: c.variant,
    metric: c.metric,
    target: c.target,
    creatorId: c.creatorId,
    creatorName: c.creator?.name ?? null,
    participantCount,
    badgeId: c.badgeId,
    badgeText,
    activeFrom: c.activeFrom?.toISOString().split("T")[0] ?? null,
    activeTo: c.activeTo?.toISOString().split("T")[0] ?? null,
    current,
    isJoined,
    isCreator,
  };
}

// ─── Leaderboard entry mapper ──────────────────────────────────────────────────

type UserForLeaderboard = {
  id: string;
  name: string;
  level: number;
  levelTitle: string;
  booksFinished: number;
  xpTotal: number;
  avatarHue: number;
};

export function toLeaderboardEntry(u: UserForLeaderboard, rank: number, currentUserId: string) {
  return {
    id: u.id,
    rank,
    name: u.name,
    level: u.level,
    levelTitle: u.levelTitle,
    books: u.booksFinished,
    xp: u.xpTotal,
    isYou: u.id === currentUserId,
    avatarHue: u.avatarHue,
  };
}
