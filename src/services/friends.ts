import { db } from "../lib/db";
import { toFriend, toFriendRequest } from "../lib/mappers";
import {
  NotFoundError,
  ConflictError,
  ForbiddenError,
  BadRequestError,
} from "../lib/errors";

export async function getFriends(userId: string) {
  const friendships = await db.friendship.findMany({
    where: {
      OR: [{ requesterId: userId }, { addresseeId: userId }],
      status: "accepted",
    },
    include: {
      requester: true,
      addressee: true,
    },
    orderBy: { createdAt: "desc" },
  });

  const friends = friendships.map((f) => {
    const otherUser =
      f.requesterId === userId ? f.addressee : f.requester;
    return { friendship: f, otherUser };
  });

  const friendIds = friends.map((f) => f.otherUser.id);

  const mutualCounts = new Map<string, number>();

  if (friendIds.length > 0) {
    const allAdjacent = await db.friendship.findMany({
      where: {
        status: "accepted",
        OR: [
          { requesterId: { in: friendIds } },
          { addresseeId: { in: friendIds } },
        ],
      },
      select: { requesterId: true, addresseeId: true },
    });

    const friendSets = new Map<string, Set<string>>();
    for (const row of allAdjacent) {
      if (!friendSets.has(row.requesterId))
        friendSets.set(row.requesterId, new Set());
      friendSets.get(row.requesterId)!.add(row.addresseeId);

      if (!friendSets.has(row.addresseeId))
        friendSets.set(row.addresseeId, new Set());
      friendSets.get(row.addresseeId)!.add(row.requesterId);
    }

    const myFriendSet = new Set(friendIds);
    for (const fid of friendIds) {
      const theirSet = friendSets.get(fid) ?? new Set();
      let count = 0;
      for (const id of myFriendSet) {
        if (id !== fid && theirSet.has(id)) count++;
      }
      mutualCounts.set(fid, count);
    }
  }

  return {
    data: friends.map(({ friendship, otherUser }) =>
      toFriend(
        friendship,
        otherUser,
        mutualCounts.get(otherUser.id) ?? 0,
      ),
    ),
    total: friends.length,
  };
}

export async function getPendingRequests(userId: string) {
  const [incoming, outgoing] = await Promise.all([
    db.friendship.findMany({
      where: { addresseeId: userId, status: "pending" },
      include: { requester: true },
      orderBy: { createdAt: "desc" },
    }),
    db.friendship.findMany({
      where: { requesterId: userId, status: "pending" },
      include: { addressee: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return {
    data: {
      incoming: incoming.map((f) =>
        toFriendRequest(f, f.requester, "incoming"),
      ),
      outgoing: outgoing.map((f) =>
        toFriendRequest(f, f.addressee, "outgoing"),
      ),
    },
  };
}

export async function sendFriendRequest(
  requesterId: string,
  addresseeId: string,
) {
  if (requesterId === addresseeId) {
    throw new BadRequestError("Cannot friend yourself");
  }

  const targetUser = await db.user.findUnique({
    where: { id: addresseeId },
  });
  if (!targetUser) throw new NotFoundError("User not found");

  const existing = await db.friendship.findFirst({
    where: {
      OR: [
        { requesterId, addresseeId },
        { requesterId: addresseeId, addresseeId: requesterId },
      ],
    },
    include: { requester: true, addressee: true },
  });

  if (existing) {
    if (existing.status === "accepted") {
      throw new ConflictError("Already friends");
    }
    if (existing.status === "pending") {
      throw new ConflictError("Friend request already exists");
    }

    if (existing.status === "rejected") {
      const updated = await db.friendship.update({
        where: { id: existing.id },
        data: { status: "pending", requesterId, addresseeId },
        include: { addressee: true },
      });
      return toFriendRequest(updated, updated.addressee, "outgoing");
    }
  }

  const created = await db.friendship.create({
    data: { requesterId, addresseeId, status: "pending" },
    include: { addressee: true },
  });

  return toFriendRequest(created, created.addressee, "outgoing");
}

export async function acceptFriendRequest(
  requestId: string,
  userId: string,
) {
  const friendship = await db.friendship.findUnique({
    where: { id: requestId },
    include: { requester: true, addressee: true },
  });

  if (!friendship) throw new NotFoundError("Friend request not found");
  if (friendship.addresseeId !== userId) {
    throw new ForbiddenError("Not the recipient of this pending request");
  }
  if (friendship.status !== "pending") {
    throw new ConflictError("Request is no longer pending");
  }

  const updated = await db.friendship.update({
    where: { id: requestId },
    data: { status: "accepted" },
  });

  const mutualCount = await getMutualCount(userId, friendship.requesterId);

  return toFriend(updated, friendship.requester, mutualCount);
}

export async function rejectFriendRequest(
  requestId: string,
  userId: string,
) {
  const friendship = await db.friendship.findUnique({
    where: { id: requestId },
  });

  if (!friendship) throw new NotFoundError("Friend request not found");
  if (friendship.addresseeId !== userId) {
    throw new ForbiddenError("Not the recipient of this pending request");
  }
  if (friendship.status !== "pending") {
    throw new ConflictError("Request is no longer pending");
  }

  await db.friendship.update({
    where: { id: requestId },
    data: { status: "rejected" },
  });
}

export async function removeFriend(
  friendshipId: string,
  userId: string,
) {
  const friendship = await db.friendship.findUnique({
    where: { id: friendshipId },
  });

  if (!friendship) throw new NotFoundError("Friendship not found");

  if (friendship.status === "pending") {
    if (friendship.requesterId !== userId) {
      throw new ForbiddenError(
        "Only the sender can cancel this request",
      );
    }
  } else {
    if (
      friendship.requesterId !== userId &&
      friendship.addresseeId !== userId
    ) {
      throw new ForbiddenError("Not your friendship");
    }
  }

  await db.friendship.delete({ where: { id: friendshipId } });
}

async function getMutualCount(userIdA: string, userIdB: string) {
  const [friendsA, friendsB] = await Promise.all([
    db.friendship.findMany({
      where: {
        status: "accepted",
        OR: [{ requesterId: userIdA }, { addresseeId: userIdA }],
      },
      select: { requesterId: true, addresseeId: true },
    }),
    db.friendship.findMany({
      where: {
        status: "accepted",
        OR: [{ requesterId: userIdB }, { addresseeId: userIdB }],
      },
      select: { requesterId: true, addresseeId: true },
    }),
  ]);

  const setA = new Set(
    friendsA.map((f) => (f.requesterId === userIdA ? f.addresseeId : f.requesterId)),
  );
  const setB = new Set(
    friendsB.map((f) => (f.requesterId === userIdB ? f.addresseeId : f.requesterId)),
  );

  setA.delete(userIdB);
  setB.delete(userIdA);

  let count = 0;
  for (const id of setA) {
    if (setB.has(id)) count++;
  }
  return count;
}
