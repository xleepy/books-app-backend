export const BookSchema = {
  $id: "Book",
  type: "object",
  required: ["id", "title", "author", "tags", "description", "rating", "reviewCount"],
  properties: {
    id: { type: "string" },
    title: { type: "string" },
    author: { type: "string" },
    coverUrl: { type: "string", nullable: true },
    tags: { type: "array", items: { type: "string" } },
    description: { type: "string" },
    rating: { type: "number", minimum: 0, maximum: 5 },
    reviewCount: { type: "integer" },
  },
} as const;

export const ReviewSchema = {
  $id: "Review",
  type: "object",
  required: ["id", "reviewer", "date", "rating", "text", "avatarHue"],
  properties: {
    id: { type: "string" },
    reviewer: { type: "string" },
    date: { type: "string", format: "date" },
    rating: { type: "number", minimum: 0, maximum: 5 },
    text: { type: "string" },
    avatarHue: { type: "integer", minimum: 0, maximum: 360 },
  },
} as const;

export const ThreadSchema = {
  $id: "Thread",
  type: "object",
  required: ["id", "title", "bookContext", "preview", "replies", "likes", "timeAgo", "spoiler", "creatorName", "creatorAvatarHue"],
  properties: {
    id: { type: "string" },
    title: { type: "string" },
    bookContext: { type: "string" },
    preview: { type: "string" },
    coverUrl: { type: "string", nullable: true },
    replies: { type: "integer" },
    likes: { type: "integer" },
    timeAgo: { type: "string" },
    spoiler: { type: "boolean" },
    liked: { type: "boolean" },
    creatorName: { type: "string" },
    creatorAvatarHue: { type: "integer" },
  },
} as const;

export const ThreadReplySchema = {
  $id: "ThreadReply",
  type: "object",
  required: ["id", "body", "timeAgo", "creatorName", "creatorAvatarHue"],
  properties: {
    id: { type: "string" },
    body: { type: "string" },
    timeAgo: { type: "string" },
    creatorName: { type: "string" },
    creatorAvatarHue: { type: "integer" },
  },
} as const;

export const ThreadDetailSchema = {
  $id: "ThreadDetail",
  type: "object",
  required: ["id", "title", "body", "bookContext", "likes", "timeAgo", "spoiler", "creatorName", "creatorAvatarHue", "isOwner", "replies"],
  properties: {
    id: { type: "string" },
    title: { type: "string" },
    body: { type: "string" },
    bookContext: { type: "string" },
    coverUrl: { type: "string", nullable: true },
    likes: { type: "integer" },
    timeAgo: { type: "string" },
    spoiler: { type: "boolean" },
    liked: { type: "boolean" },
    creatorName: { type: "string" },
    creatorAvatarHue: { type: "integer" },
    /** True when the authenticated user is the thread creator */
    isOwner: { type: "boolean" },
    replies: { type: "array", items: { $ref: "ThreadReply" } },
  },
} as const;

export const ChallengeSchema = {
  $id: "Challenge",
  type: "object",
  required: ["id", "title", "subtitle", "goal", "current", "target", "badgeText", "variant"],
  properties: {
    id: { type: "string" },
    title: { type: "string" },
    subtitle: { type: "string" },
    goal: { type: "string" },
    current: { type: "integer" },
    target: { type: "integer" },
    badgeText: { type: "string" },
    variant: { type: "string", enum: ["monthly", "yearly"] },
  },
} as const;

export const LeaderboardEntrySchema = {
  $id: "LeaderboardEntry",
  type: "object",
  required: ["id", "rank", "name", "level", "levelTitle", "books", "xp", "avatarHue"],
  properties: {
    id: { type: "string" },
    rank: { type: "integer" },
    name: { type: "string" },
    level: { type: "integer" },
    levelTitle: { type: "string" },
    books: { type: "integer" },
    xp: { type: "integer" },
    isYou: { type: "boolean" },
    avatarHue: { type: "integer", minimum: 0, maximum: 360 },
  },
} as const;

export const LibraryBookSchema = {
  $id: "LibraryBook",
  type: "object",
  required: ["id", "title", "author", "tags", "description", "rating", "reviewCount", "status", "progressPct", "isCurrent"],
  properties: {
    id: { type: "string" },
    title: { type: "string" },
    author: { type: "string" },
    coverUrl: { type: "string", nullable: true },
    tags: { type: "array", items: { type: "string" } },
    description: { type: "string" },
    rating: { type: "number", minimum: 0, maximum: 5 },
    reviewCount: { type: "integer" },
    status: { type: "string", enum: ["want", "reading", "finished"] },
    isCurrent: { type: "boolean" },
    progressPct: { type: "number", minimum: 0, maximum: 100 },
    timeLeftMin: { type: "integer", nullable: true },
  },
} as const;

export const LibraryStatsSchema = {
  $id: "LibraryStats",
  type: "object",
  required: ["finished", "reading", "saved"],
  properties: {
    finished: { type: "integer" },
    reading: { type: "integer" },
    saved: { type: "integer" },
  },
} as const;

export const UserSchema = {
  $id: "User",
  type: "object",
  required: ["id", "name", "avatarHue", "level", "levelTitle", "xpTotal", "xpCurrentLevel", "xpToNextLevel", "booksFinished", "streak", "bestStreak", "weekDays", "readingGoal"],
  properties: {
    id: { type: "string" },
    name: { type: "string" },
    email: { type: "string" },
    avatarHue: { type: "integer", minimum: 0, maximum: 360 },
    level: { type: "integer" },
    levelTitle: { type: "string" },
    xpTotal: { type: "integer" },
    /** XP earned within the current level (progress toward next level) */
    xpCurrentLevel: { type: "integer" },
    /** XP required to advance from current level to next */
    xpToNextLevel: { type: "integer" },
    booksFinished: { type: "integer" },
    pagesRead: { type: "integer" },
    hoursRead: { type: "number" },
    streak: { type: "integer" },
    bestStreak: { type: "integer" },
    weekDays: { type: "array", items: { type: "boolean" } },
    readingGoal: { type: "integer" },
  },
} as const;

export const PreferencesSchema = {
  $id: "Preferences",
  type: "object",
  required: ["readingGoalMinutes", "reminderEnabled", "preferredGenres", "notifyPush", "notifyWeeklyDigest", "notifyChallenge", "profileVisibility"],
  properties: {
    readingGoalMinutes: { type: "integer" },
    reminderTime: { type: "string", nullable: true },
    reminderEnabled: { type: "boolean" },
    preferredGenres: { type: "array", items: { type: "string" } },
    notifyPush: { type: "boolean" },
    notifyWeeklyDigest: { type: "boolean" },
    notifyChallenge: { type: "boolean" },
    // "friends" is accepted by the API but privacy filtering is not yet implemented;
    // it is treated the same as "public" until enforcement logic is added.
    profileVisibility: { type: "string", enum: ["public", "friends", "private"] },
  },
} as const;

export const PaginationSchema = {
  $id: "Pagination",
  type: "object",
  required: ["total", "page", "limit"],
  properties: {
    total: { type: "integer" },
    page: { type: "integer" },
    limit: { type: "integer" },
  },
} as const;

export const ErrorSchema = {
  $id: "ApiError",
  type: "object",
  required: ["error", "message"],
  properties: {
    error: { type: "string" },
    message: { type: "string" },
  },
} as const;

export const UserBadgeSchema = {
  $id: "UserBadge",
  type: "object",
  required: ["slug", "name", "awardedAt"],
  properties: {
    slug: { type: "string" },
    name: { type: "string" },
    description: { type: "string", nullable: true },
    iconUrl: { type: "string", nullable: true },
    awardedAt: { type: "string", format: "date-time" },
  },
} as const;

export const AuthTokensSchema = {
  $id: "AuthTokens",
  type: "object",
  required: ["accessToken"],
  properties: {
    accessToken: { type: "string" },
  },
} as const;

export const allSchemas = [
  BookSchema,
  LibraryBookSchema,
  LibraryStatsSchema,
  UserSchema,
  PreferencesSchema,
  ReviewSchema,
  ThreadSchema,
  ThreadReplySchema,
  ThreadDetailSchema,
  ChallengeSchema,
  LeaderboardEntrySchema,
  UserBadgeSchema,
  PaginationSchema,
  ErrorSchema,
  AuthTokensSchema,
];
