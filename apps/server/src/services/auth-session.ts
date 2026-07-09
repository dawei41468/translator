import crypto from "crypto";
import jwt from "jsonwebtoken";
import type { JwtPayload } from "jsonwebtoken";
import { eq, lt } from "drizzle-orm";
import { db } from "../../../../packages/db/src/index.js";
import { sessions, users } from "../../../../packages/db/src/schema.js";

const JWT_SECRET = process.env.JWT_SECRET!;
/** Access token lifetime — sessions table enables earlier revocation. */
export const JWT_EXPIRES_IN = "7d";
export const JWT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const AUTH_COOKIE_NAME = "auth_token";

export interface AuthTokenPayload {
  userId: string;
  sid: string;
}

export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
  displayName: string | null;
  language: string | null;
  isGuest: boolean | null;
  preferences: {
    sttEngine?: string;
    ttsEngine?: string;
    translationEngine?: string;
    ttsVoice?: string;
  } | null;
  createdAt: Date | null;
  updatedAt: Date | null;
  deletedAt: Date | null;
  passwordHash?: string;
}

function getJwtSecret(): string {
  if (!JWT_SECRET) {
    throw new Error("JWT_SECRET is not configured");
  }
  return JWT_SECRET;
}

/**
 * Create a DB-backed session and sign a JWT that embeds the session id.
 */
export async function createUserSession(userId: string): Promise<{
  token: string;
  sessionId: string;
  expiresAt: Date;
}> {
  const sessionId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + JWT_MAX_AGE_MS);
  const token = jwt.sign(
    { userId, sid: sessionId } satisfies AuthTokenPayload,
    getJwtSecret(),
    { expiresIn: JWT_EXPIRES_IN }
  );

  await db.insert(sessions).values({
    id: sessionId,
    userId,
    token,
    expiresAt,
  });

  return { token, sessionId, expiresAt };
}

function parsePayload(verified: string | JwtPayload): AuthTokenPayload | null {
  if (typeof verified === "string") return null;
  const userId = verified["userId"];
  const sid = verified["sid"];
  if (typeof userId !== "string" || typeof sid !== "string") return null;
  return { userId, sid };
}

/**
 * Verify JWT signature, confirm session row is active, load user.
 * Returns null when the token is invalid, expired, or revoked.
 */
export async function verifyAuthToken(token: string): Promise<{
  user: SessionUser;
  sessionId: string;
} | null> {
  let payload: AuthTokenPayload;
  try {
    const verified = jwt.verify(token, getJwtSecret());
    const parsed = parsePayload(verified);
    if (!parsed) return null;
    payload = parsed;
  } catch {
    return null;
  }

  const session = await db.query.sessions.findFirst({
    where: eq(sessions.id, payload.sid),
  });

  if (!session) return null;
  if (session.userId !== payload.userId) return null;
  if (session.expiresAt.getTime() <= Date.now()) {
    // Best-effort cleanup of expired row
    await db.delete(sessions).where(eq(sessions.id, session.id)).catch(() => undefined);
    return null;
  }

  const user = await db.query.users.findFirst({
    where: eq(users.id, payload.userId),
  });
  if (!user) return null;
  // Soft-deleted accounts cannot authenticate
  if (user.deletedAt) return null;

  return { user: user as SessionUser, sessionId: session.id };
}

export async function revokeSession(sessionId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, sessionId));
}

export async function revokeAllUserSessions(userId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

/**
 * Decode session id from a cookie token without DB lookup (for logout best-effort).
 */
export function getSessionIdFromToken(token: string): string | null {
  try {
    const verified = jwt.verify(token, getJwtSecret());
    return parsePayload(verified)?.sid ?? null;
  } catch {
    return null;
  }
}

export async function cleanupExpiredSessions(): Promise<number> {
  const result = await db
    .delete(sessions)
    .where(lt(sessions.expiresAt, new Date()))
    .returning({ id: sessions.id });
  return result.length;
}

export function cookieOptions(isProd: boolean) {
  return {
    httpOnly: true as const,
    secure: isProd,
    sameSite: "lax" as const,
    maxAge: JWT_MAX_AGE_MS,
    path: "/",
  };
}
