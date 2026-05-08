import { db } from "../lib/db";
import { Prisma } from "../generated/prisma/client";
import { sanitizeHtml } from "../lib/sanitize";
import { toThread, toThreadDetail, toThreadReply } from "../lib/mappers";
import { NotFoundError, ForbiddenError } from "../lib/errors";

/** Build the include clause for a thread list query. */
function threadListInclude(userId: string) {
  return {
    creator: true,
    book: true,
    _count: { select: { replies: { where: { deletedAt: null } } } },
    threadLikes: { where: { userId }, select: { userId: true } },
  } as const;
}

async function unlikeThread(
  tx: Prisma.TransactionClient,
  userId: string,
  threadId: string,
) {
  await tx.threadLike.delete({
    where: { userId_threadId: { userId, threadId } },
  });
  await tx.$queryRaw`UPDATE "Thread" SET likes = GREATEST(0, likes - 1) WHERE id = ${threadId}`;
  return false;
}

async function likeThread(
  tx: Prisma.TransactionClient,
  userId: string,
  threadId: string,
) {
  await tx.threadLike.create({ data: { userId, threadId } });
  await tx.thread.update({
    where: { id: threadId },
    data: { likes: { increment: 1 } },
  });
  return true;
}

/* ─── Exported service functions ─── */

export async function listThreads(
  userId: string,
  filter: "all" | "popular" | "recent" | "mine" = "recent",
  search?: string,
  page = 1,
  limit = 20,
) {
  const where = {
    deletedAt: null,
    ...(filter === "mine" && { creatorId: userId }),
    ...(search && {
      OR: [
        { title: { contains: search, mode: "insensitive" as const } },
        { preview: { contains: search, mode: "insensitive" as const } },
      ],
    }),
  };

  const orderBy =
    filter === "popular"
      ? [{ likes: "desc" as const }, { createdAt: "desc" as const }]
      : [{ createdAt: "desc" as const }];

  const [total, rows] = await Promise.all([
    db.thread.count({ where }),
    db.thread.findMany({
      where,
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
      include: threadListInclude(userId),
    }),
  ]);

  return {
    data: rows.map((t) => toThread(t, userId)),
    pagination: { total, page, limit },
  };
}

export async function createThread(
  userId: string,
  title: string,
  body: string,
  bookId?: string | null,
  spoiler = false,
) {
  if (bookId) {
    const book = await db.book.findUnique({ where: { id: bookId } });
    if (!book) throw new NotFoundError("Book not found");
  }

  const sanitizedBody = sanitizeHtml(body);
  const sanitizedTitle = sanitizeHtml(title);
  const preview = sanitizedBody.slice(0, 140);

  const thread = await db.thread.create({
    data: {
      creatorId: userId,
      bookId: bookId ?? null,
      title: sanitizedTitle,
      body: sanitizedBody,
      preview,
      spoiler,
    },
    include: threadListInclude(userId),
  });

  return toThread(thread, userId);
}

export async function getThread(id: string, userId: string) {
  const thread = await db.thread.findFirst({
    where: { id, deletedAt: null },
    include: {
      creator: true,
      book: true,
      replies: {
        where: { deletedAt: null },
        orderBy: { createdAt: "asc" },
        include: { user: true },
      },
      threadLikes: { where: { userId }, select: { userId: true } },
    },
  });

  if (!thread) throw new NotFoundError("Thread not found");
  return toThreadDetail(thread, userId);
}

export async function postReply(
  userId: string,
  threadId: string,
  body: string,
) {
  const thread = await db.thread.findFirst({
    where: { id: threadId, deletedAt: null },
  });
  if (!thread) throw new NotFoundError("Thread not found");

  const sanitizedBody = sanitizeHtml(body);

  const reply_ = await db.threadReply.create({
    data: { threadId, userId, body: sanitizedBody },
    include: { user: true },
  });

  return toThreadReply(reply_);
}

export async function toggleLike(userId: string, threadId: string) {
  const thread = await db.thread.findFirst({
    where: { id: threadId, deletedAt: null },
  });
  if (!thread) throw new NotFoundError("Thread not found");

  const { liked, likes } = await db.$transaction(async (tx) => {
    const existing = await tx.threadLike.findUnique({
      where: { userId_threadId: { userId, threadId } },
    });

    const liked = existing
      ? await unlikeThread(tx, userId, threadId)
      : await likeThread(tx, userId, threadId);

    const result = (await tx.$queryRaw`
      SELECT likes FROM "Thread" WHERE id = ${threadId}
    `) as [{ likes: number }];
    const [{ likes }] = result;

    return { liked, likes };
  });

  return { liked, likes };
}

export async function updateThread(
  userId: string,
  threadId: string,
  title: string,
  body: string,
) {
  const thread = await db.thread.findFirst({
    where: { id: threadId, deletedAt: null },
  });
  if (!thread) throw new NotFoundError("Thread not found");
  if (thread.creatorId !== userId)
    throw new ForbiddenError("You are not the owner of this thread");

  const sanitizedBody = sanitizeHtml(body);
  const sanitizedTitle = sanitizeHtml(title);
  const preview = sanitizedBody.slice(0, 140);

  const updated = await db.thread.update({
    where: { id: threadId },
    data: { title: sanitizedTitle, body: sanitizedBody, preview },
    include: threadListInclude(userId),
  });

  return toThread(updated, userId);
}

export async function deleteReply(
  userId: string,
  threadId: string,
  replyId: string,
) {
  const reply = await db.threadReply.findFirst({
    where: { id: replyId, threadId, deletedAt: null },
  });
  if (!reply) throw new NotFoundError("Reply not found");
  if (reply.userId !== userId)
    throw new ForbiddenError("You are not the owner of this reply");

  await db.threadReply.update({
    where: { id: replyId },
    data: { deletedAt: new Date() },
  });
}

export async function deleteThread(userId: string, threadId: string) {
  const thread = await db.thread.findFirst({
    where: { id: threadId, deletedAt: null },
  });
  if (!thread) throw new NotFoundError("Thread not found");
  if (thread.creatorId !== userId)
    throw new ForbiddenError("You are not the owner of this thread");

  await db.thread.update({
    where: { id: threadId },
    data: { deletedAt: new Date() },
  });
}
