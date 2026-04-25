import { Expo, ExpoPushMessage } from "expo-server-sdk";
import { db } from "../lib/db";

const expo = new Expo();

interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

/* ─── Token management ─────────────────────────────────────────────────────── */

export async function registerPushToken(
  userId: string,
  token: string,
  platform: string
): Promise<void> {
  if (!Expo.isExpoPushToken(token)) {
    throw new Error("Invalid Expo push token");
  }

  // Upsert: delete existing same-token rows (handles reinstalls)
  await db.pushToken.deleteMany({ where: { token } });
  await db.pushToken.create({
    data: { userId, token, platform },
  });
}

export async function unregisterPushToken(token: string): Promise<void> {
  await db.pushToken.deleteMany({ where: { token } });
}

export async function removeUserPushTokens(userId: string): Promise<void> {
  await db.pushToken.deleteMany({ where: { userId } });
}

/* ─── Sending ──────────────────────────────────────────────────────────────── */

export async function sendPushToUser(
  userId: string,
  payload: PushPayload
): Promise<void> {
  const tokens = await db.pushToken.findMany({
    where: { userId },
    select: { token: true },
  });

  if (!tokens.length) return;

  await sendToTokens(
    tokens.map((t) => t.token),
    payload
  );
}

export async function sendChallengeCompleteNotification(
  userId: string,
  challengeTitle: string
): Promise<void> {
  const prefs = await db.userPreferences.findUnique({
    where: { userId },
    select: { notifyPush: true, notifyChallenge: true },
  });

  if (!prefs?.notifyPush || !prefs?.notifyChallenge) return;

  await sendPushToUser(userId, {
    title: "Challenge Completed! 🏆",
    body: `You completed "${challengeTitle}"!`,
    data: { screen: "Compete" },
  });
}

export async function sendBadgeAwardedNotification(
  userId: string,
  badgeName: string
): Promise<void> {
  const prefs = await db.userPreferences.findUnique({
    where: { userId },
    select: { notifyPush: true },
  });

  if (!prefs?.notifyPush) return;

  await sendPushToUser(userId, {
    title: "Badge Earned! 🎖️",
    body: `You earned the "${badgeName}" badge!`,
    data: { screen: "Progress" },
  });
}

/* ─── Internal delivery ────────────────────────────────────────────────────── */

async function sendToTokens(
  tokens: string[],
  { title, body, data }: PushPayload
): Promise<void> {
  const messages: ExpoPushMessage[] = tokens
    .filter(Expo.isExpoPushToken)
    .map((token) => ({
      to: token,
      sound: "default",
      title,
      body,
      data: data ?? {},
    }));

  const chunks = expo.chunkPushNotifications(messages);

  for (const chunk of chunks) {
    try {
      const tickets = await expo.sendPushNotificationsAsync(chunk);
      // Filter out tokens that Expo reports as invalid
      const invalidTokens: string[] = [];
      tickets.forEach((ticket, i) => {
        if (ticket.status === "error") {
          if (
            ticket.details?.error === "DeviceNotRegistered" ||
            ticket.details?.error === "InvalidCredentials"
          ) {
            invalidTokens.push(chunk[i].to as string);
          }
        }
      });
      if (invalidTokens.length) {
        await db.pushToken.deleteMany({
          where: { token: { in: invalidTokens } },
        });
      }
    } catch {
      // Silently fail individual chunks; don't crash the request
    }
  }
}
