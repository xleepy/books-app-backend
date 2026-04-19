import { db } from "./db";
import type { User } from "../generated/prisma/client";

export async function getOrCreateUser(
  authId: string,
  email: string,
  displayName?: string
): Promise<User> {
  const existing = await db.user.findUnique({ where: { authId } });
  if (existing) return existing;

  return db.user.create({
    data: {
      authId,
      email,
      name: displayName || email.split("@")[0],
      avatarHue: Math.floor(Math.random() * 360),
      preferences: { create: {} },
    },
  });
}
