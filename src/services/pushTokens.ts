import { Expo } from "expo-server-sdk";
import { db } from "../lib/db";

export async function registerPushToken(
  userId: string,
  token: string,
  platform: string
) {
  if (!Expo.isExpoPushToken(token)) {
    throw new Error("Invalid Expo push token");
  }

  // Upsert: delete old same-token rows first (handles reinstalls), then create
  await db.pushToken.deleteMany({ where: { token } });

  const record = await db.pushToken.create({
    data: { userId, token, platform },
  });

  return { id: record.id, token: record.token, platform: record.platform };
}

export async function unregisterPushToken(userId: string, token: string) {
  const deleted = await db.pushToken.deleteMany({
    where: { userId, token },
  });

  return { deleted: deleted.count };
}

export async function getUserPushTokens(userId: string): Promise<string[]> {
  const rows = await db.pushToken.findMany({
    where: { userId },
    select: { token: true },
  });
  return rows.map((r) => r.token);
}

export async function deleteAllUserPushTokens(userId: string) {
  const deleted = await db.pushToken.deleteMany({
    where: { userId },
  });
  return { deleted: deleted.count };
}
