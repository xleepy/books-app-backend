import { db } from "./db";
import type { User } from "../generated/prisma/client";
import type { FastifyRequest } from "fastify";

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

export async function resolveUser(request: FastifyRequest): Promise<User> {
  const { sub, email, user_metadata } = request.user;
  return getOrCreateUser(sub, email, user_metadata?.full_name ?? user_metadata?.name);
}
