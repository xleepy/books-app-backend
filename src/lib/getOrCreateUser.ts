import { db } from "./db";
import type { User } from "../generated/prisma/client";

export async function getOrCreateUser(
  authId: string,
  email: string,
  displayName?: string
): Promise<User> {
  return db.user.upsert({
    where: { authId },
    update: {},
    create: {
      authId,
      email,
      name: displayName || email.split("@")[0],
      avatarHue: Math.floor(Math.random() * 360),
      preferences: { create: {} },
    },
  });
}
