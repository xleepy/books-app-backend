export const BookSchema = {
  $id: "Book",
  type: "object",
  required: [
    "id",
    "title",
    "author",
    "tags",
    "description",
    "rating",
    "reviewCount",
  ],
  properties: {
    id: { type: "string" },
    title: { type: "string" },
    author: { type: "string" },
    coverUrl: { type: "string", nullable: true },
    tags: { type: "array", items: { type: "string" } },
    description: { type: "string" },
    rating: { type: "number", minimum: 0, maximum: 5 },
    reviewCount: { type: "integer" },
    pageCount: { type: "integer", nullable: true },
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
  required: [
    "id",
    "title",
    "bookContext",
    "preview",
    "replies",
    "likes",
    "timeAgo",
    "spoiler",
    "creatorName",
    "creatorAvatarHue",
  ],
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
  required: [
    "id",
    "body",
    "timeAgo",
    "creatorName",
    "creatorAvatarHue",
    "isOwner",
  ],
  properties: {
    id: { type: "string" },
    body: { type: "string" },
    timeAgo: { type: "string" },
    creatorName: { type: "string" },
    creatorAvatarHue: { type: "integer" },
    isOwner: { type: "boolean" },
  },
} as const;

export const ThreadDetailSchema = {
  $id: "ThreadDetail",
  type: "object",
  required: [
    "id",
    "title",
    "body",
    "bookContext",
    "likes",
    "timeAgo",
    "spoiler",
    "creatorName",
    "creatorAvatarHue",
    "isOwner",
    "replies",
  ],
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
  required: [
    "id",
    "slug",
    "title",
    "variant",
    "metric",
    "target",
    "participantCount",
    "isJoined",
    "isCreator",
  ],
  properties: {
    id: { type: "string" },
    slug: { type: "string" },
    title: { type: "string" },
    subtitle: { type: "string", nullable: true },
    description: { type: "string", nullable: true },
    goal: { type: "string", nullable: true },
    variant: { type: "string" },
    metric: { type: "string" },
    target: { type: "integer" },
    creatorId: { type: "string", nullable: true },
    creatorName: { type: "string", nullable: true },
    participantCount: { type: "integer" },
    badgeId: { type: "string", nullable: true },
    badgeText: { type: "string", nullable: true },
    activeFrom: { type: "string", format: "date", nullable: true },
    activeTo: { type: "string", format: "date", nullable: true },
    current: { type: "integer" },
    isJoined: { type: "boolean" },
    isCreator: { type: "boolean" },
  },
} as const;

export const CreateChallengeBodySchema = {
  $id: "CreateChallengeBody",
  type: "object",
  required: ["title", "variant", "metric", "target", "activeFrom", "activeTo"],
  properties: {
    title: { type: "string", minLength: 1, maxLength: 80 },
    description: { type: "string", maxLength: 500 },
    variant: {
      type: "string",
      enum: ["monthly", "yearly", "weekly", "custom"],
    },
    metric: { type: "string", enum: ["books", "pages", "hours", "streak"] },
    target: { type: "integer", minimum: 1, maximum: 9999 },
    activeFrom: { type: "string", format: "date" },
    activeTo: { type: "string", format: "date" },
    badgeId: { type: "string" },
  },
} as const;

export const LeaderboardEntrySchema = {
  $id: "LeaderboardEntry",
  type: "object",
  required: [
    "id",
    "rank",
    "name",
    "level",
    "levelTitle",
    "books",
    "xp",
    "avatarHue",
  ],
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
  required: [
    "id",
    "title",
    "author",
    "tags",
    "description",
    "rating",
    "reviewCount",
    "status",
    "progressPct",
  ],
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
    progressPct: { type: "number", minimum: 0, maximum: 100 },
    currentPage: { type: "integer", nullable: true },
    pageCount: { type: "integer", nullable: true },
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
  required: [
    "id",
    "name",
    "avatarHue",
    "level",
    "levelTitle",
    "xpTotal",
    "xpCurrentLevel",
    "xpToNextLevel",
    "booksFinished",
    "streak",
    "bestStreak",
    "weekDays",
    "readingGoal",
  ],
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
  required: [
    "readingGoalMinutes",
    "reminderEnabled",
    "preferredGenres",
    "notifyPush",
    "notifyWeeklyDigest",
    "notifyChallenge",
    "profileVisibility",
  ],
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
    profileVisibility: {
      type: "string",
      enum: ["public", "friends", "private"],
    },
  },
} as const;

/* ─── Common request schemas ─── */

export const IdParamSchema = {
  $id: "IdParam",
  type: "object",
  required: ["id"],
  properties: {
    id: { type: "string" },
  },
} as const;

export const BookIdParamSchema = {
  $id: "BookIdParam",
  type: "object",
  required: ["bookId"],
  properties: {
    bookId: { type: "string" },
  },
} as const;

export const LimitQuerySchema = {
  $id: "LimitQuery",
  type: "object",
  properties: {
    limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
  },
} as const;

export const PaginationQuerySchema = {
  $id: "PaginationQuery",
  type: "object",
  properties: {
    page: { type: "integer", minimum: 1, default: 1 },
    limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
  },
} as const;

export const CursorQuerySchema = {
  $id: "CursorQuery",
  type: "object",
  properties: {
    cursor: { type: "string", description: "Opaque pagination cursor" },
    limit: { type: "integer", minimum: 1, maximum: 50, default: 20 },
  },
} as const;

export const ThreadFilterQuerySchema = {
  $id: "ThreadFilterQuery",
  type: "object",
  properties: {
    filter: {
      type: "string",
      enum: ["all", "popular", "recent", "mine"],
      default: "recent",
    },
    search: { type: "string" },
    page: { type: "integer", minimum: 1, default: 1 },
    limit: { type: "integer", minimum: 1, maximum: 50, default: 20 },
  },
} as const;

export const ChallengeFilterQuerySchema = {
  $id: "ChallengeFilterQuery",
  type: "object",
  properties: {
    filter: {
      type: "string",
      enum: ["active", "monthly", "yearly", "weekly", "custom"],
      default: "active",
    },
  },
} as const;

/* ─── Pagination ─── */

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

/* ─── Response wrappers ─── */

export const PaginatedBooksSchema = {
  $id: "PaginatedBooks",
  type: "object",
  required: ["data", "pagination"],
  properties: {
    data: { type: "array", items: { $ref: "Book" } },
    pagination: { $ref: "Pagination" },
  },
} as const;

export const BookListSchema = {
  $id: "BookList",
  type: "object",
  required: ["data"],
  properties: {
    data: { type: "array", items: { $ref: "Book" } },
    nextCursor: { type: "string", nullable: true },
  },
} as const;

export const PaginatedReviewsSchema = {
  $id: "PaginatedReviews",
  type: "object",
  required: ["data", "pagination"],
  properties: {
    data: { type: "array", items: { $ref: "Review" } },
    pagination: { $ref: "Pagination" },
  },
} as const;

export const PaginatedThreadsSchema = {
  $id: "PaginatedThreads",
  type: "object",
  required: ["data", "pagination"],
  properties: {
    data: { type: "array", items: { $ref: "Thread" } },
    pagination: { $ref: "Pagination" },
  },
} as const;

export const PaginatedLibraryBooksSchema = {
  $id: "PaginatedLibraryBooks",
  type: "object",
  required: ["data", "pagination"],
  properties: {
    data: { type: "array", items: { $ref: "LibraryBook" } },
    pagination: { $ref: "Pagination" },
  },
} as const;

export const ChallengeDetailSchema = {
  $id: "ChallengeDetail",
  type: "object",
  required: ["data"],
  properties: {
    data: { $ref: "Challenge" },
  },
} as const;

export const ChallengeListSchema = {
  $id: "ChallengeList",
  type: "object",
  required: ["data"],
  properties: {
    data: { type: "array", items: { $ref: "Challenge" } },
  },
} as const;

export const ChallengeProgressSchema = {
  $id: "ChallengeProgress",
  type: "object",
  required: ["challengeId", "current", "target", "completed"],
  properties: {
    challengeId: { type: "string" },
    current: { type: "integer" },
    target: { type: "integer" },
    completed: { type: "boolean" },
    completedAt: { type: "string", nullable: true },
  },
} as const;

export const LeaderboardListSchema = {
  $id: "LeaderboardList",
  type: "object",
  required: ["data"],
  properties: {
    data: { type: "array", items: { $ref: "LeaderboardEntry" } },
  },
} as const;

export const UserBadgeListSchema = {
  $id: "UserBadgeList",
  type: "object",
  required: ["data"],
  properties: {
    data: { type: "array", items: { $ref: "UserBadge" } },
  },
} as const;

export const LikeResultSchema = {
  $id: "LikeResult",
  type: "object",
  required: ["liked", "likes"],
  properties: {
    liked: { type: "boolean" },
    likes: { type: "integer" },
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

// ─── Friends ──────────────────────────────────────────────────────────────────

export const FriendSchema = {
  $id: "Friend",
  type: "object",
  required: [
    "id",
    "userId",
    "username",
    "avatarHue",
    "level",
    "levelTitle",
    "friendsSince",
    "mutualCount",
  ],
  properties: {
    id: { type: "string" },
    userId: { type: "string" },
    username: { type: "string" },
    avatarHue: { type: "integer", minimum: 0, maximum: 360 },
    level: { type: "integer" },
    levelTitle: { type: "string" },
    friendsSince: { type: "string", format: "date-time" },
    mutualCount: { type: "integer" },
  },
} as const;

export const FriendRequestSchema = {
  $id: "FriendRequest",
  type: "object",
  required: [
    "id",
    "userId",
    "username",
    "avatarHue",
    "level",
    "levelTitle",
    "direction",
    "sentAt",
  ],
  properties: {
    id: { type: "string" },
    userId: { type: "string" },
    username: { type: "string" },
    avatarHue: { type: "integer", minimum: 0, maximum: 360 },
    level: { type: "integer" },
    levelTitle: { type: "string" },
    direction: { type: "string", enum: ["incoming", "outgoing"] },
    sentAt: { type: "string", format: "date-time" },
  },
} as const;

export const FriendsListSchema = {
  $id: "FriendsList",
  type: "object",
  required: ["data", "total"],
  properties: {
    data: { type: "array", items: { $ref: "Friend" } },
    total: { type: "integer" },
  },
} as const;

export const PendingRequestsSchema = {
  $id: "PendingRequests",
  type: "object",
  required: ["data"],
  properties: {
    data: {
      type: "object",
      required: ["incoming", "outgoing"],
      properties: {
        incoming: {
          type: "array",
          items: { $ref: "FriendRequest" },
        },
        outgoing: {
          type: "array",
          items: { $ref: "FriendRequest" },
        },
      },
    },
  },
} as const;

export const SendFriendRequestBodySchema = {
  $id: "SendFriendRequestBody",
  type: "object",
  required: ["userId"],
  properties: {
    userId: { type: "string" },
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

export const SubjectListSchema = {
  $id: "SubjectList",
  type: "object",
  required: ["data"],
  properties: {
    data: {
      type: "array",
      items: {
        type: "object",
        required: ["id", "name", "slug"],
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          slug: { type: "string" },
        },
      },
    },
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
  CreateChallengeBodySchema,
  LeaderboardEntrySchema,
  UserBadgeSchema,
  PaginationSchema,
  ErrorSchema,
  AuthTokensSchema,
  // Common request schemas
  IdParamSchema,
  BookIdParamSchema,
  LimitQuerySchema,
  PaginationQuerySchema,
  CursorQuerySchema,
  ThreadFilterQuerySchema,
  ChallengeFilterQuerySchema,
  // Response wrappers
  PaginatedBooksSchema,
  BookListSchema,
  PaginatedReviewsSchema,
  PaginatedThreadsSchema,
  PaginatedLibraryBooksSchema,
  ChallengeDetailSchema,
  ChallengeListSchema,
  ChallengeProgressSchema,
  LeaderboardListSchema,
  UserBadgeListSchema,
  LikeResultSchema,
  SubjectListSchema,
  // Friends
  FriendSchema,
  FriendRequestSchema,
  FriendsListSchema,
  PendingRequestsSchema,
  SendFriendRequestBodySchema,
];
