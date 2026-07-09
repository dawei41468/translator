import express from "express";
import crypto from "crypto";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";
import { z, ZodError } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../../../../packages/db/src/index.js";
import { users } from "../../../../packages/db/src/schema.js";
import { authenticate, parseCookies } from "../middleware/auth.js";
import {
  AUTH_COOKIE_NAME,
  cookieOptions,
  createUserSession,
  getSessionIdFromToken,
  revokeAllUserSessions,
  revokeSession,
} from "../services/auth-session.js";

const router = express.Router();

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(200),
});

// Auth endpoints rate limiter
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30,
  skipSuccessfulRequests: true,
  message: { error: "Too many authentication attempts" },
  standardHeaders: true,
  legacyHeaders: false,
});

router.use(authLimiter);

function setAuthCookie(res: express.Response, token: string) {
  const isProd = process.env.NODE_ENV === "production";
  res.cookie(AUTH_COOKIE_NAME, token, cookieOptions(isProd));
}

function clearAuthCookie(res: express.Response) {
  const isProd = process.env.NODE_ENV === "production";
  res.cookie(AUTH_COOKIE_NAME, "", {
    ...cookieOptions(isProd),
    maxAge: undefined,
    expires: new Date(0),
  });
}

function publicUser(user: {
  id: string;
  name: string | null;
  displayName: string | null;
  email: string;
  language: string | null;
  isGuest?: boolean | null;
}) {
  return {
    id: user.id,
    name: user.name,
    displayName: user.displayName,
    email: user.email,
    language: user.language,
    ...(user.isGuest ? { isGuest: true } : {}),
  };
}

router.post("/login", async (req, res) => {
  const body: unknown = req.body ?? {};
  const email =
    typeof body === "object" && body !== null && typeof (body as { email?: unknown }).email === "string"
      ? (body as { email: string }).email
      : undefined;
  const password =
    typeof body === "object" && body !== null && typeof (body as { password?: unknown }).password === "string"
      ? (body as { password: string }).password
      : undefined;
  if (!email || !password) {
    return res.status(400).json({ error: "Missing fields" });
  }

  try {
    const matchingUsers = await db.query.users.findMany({
      where: eq(users.email, email.toLowerCase()),
    });

    if (matchingUsers.length > 1) {
      return res.status(409).json({ error: "Multiple accounts share this email. Contact an admin." });
    }

    const user = matchingUsers[0];

    if (!user || user.deletedAt || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const { token } = await createUserSession(user.id);
    setAuthCookie(res, token);

    res.json({ user: publicUser(user) });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/register", async (req, res) => {
  const body: unknown = req.body ?? {};
  const email =
    typeof body === "object" && body !== null && typeof (body as { email?: unknown }).email === "string"
      ? (body as { email: string }).email
      : undefined;
  const password =
    typeof body === "object" && body !== null && typeof (body as { password?: unknown }).password === "string"
      ? (body as { password: string }).password
      : undefined;
  const name =
    typeof body === "object" && body !== null && typeof (body as { name?: unknown }).name === "string"
      ? (body as { name: string }).name
      : undefined;

  if (!email || !password || !name) {
    return res.status(400).json({ error: "Missing fields" });
  }

  if (password.length < 8 || password.length > 200) {
    return res.status(400).json({ error: "Password must be between 8 and 200 characters" });
  }

  const trimmedName = name.trim();
  if (trimmedName.length < 1 || trimmedName.length > 100) {
    return res.status(400).json({ error: "Name must be between 1 and 100 characters" });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 255) {
    return res.status(400).json({ error: "Invalid email" });
  }

  try {
    const existingUser = await db.query.users.findFirst({
      where: eq(users.email, email.toLowerCase()),
    });

    if (existingUser) {
      return res.status(409).json({ error: "User already exists" });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const newUser = await db
      .insert(users)
      .values({
        email: email.toLowerCase(),
        name: trimmedName,
        displayName: trimmedName,
        passwordHash,
        language: "en",
      })
      .returning();

    const user = newUser[0];
    const { token } = await createUserSession(user.id);
    setAuthCookie(res, token);

    res.json({ user: publicUser(user) });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/guest-login", async (req, res) => {
  const body: unknown = req.body ?? {};
  const rawName =
    typeof body === "object" && body !== null && typeof (body as { displayName?: unknown }).displayName === "string"
      ? (body as { displayName: string }).displayName.trim()
      : "Guest";
  const displayName = rawName.slice(0, 100) || "Guest";

  try {
    const randomId = crypto.randomUUID();
    const email = `guest_${randomId}@translator.local`;
    const password = crypto.randomUUID();
    const passwordHash = await bcrypt.hash(password, 10);

    const newUser = await db
      .insert(users)
      .values({
        email,
        name: displayName,
        displayName,
        passwordHash,
        language: "en",
        isGuest: true,
      })
      .returning();

    const user = newUser[0];
    const { token } = await createUserSession(user.id);
    setAuthCookie(res, token);

    res.json({ user: publicUser({ ...user, isGuest: true }) });
  } catch (err) {
    res.status(500).json({ error: "Server error during guest login" });
  }
});

router.post("/logout", async (req, res) => {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[AUTH_COOKIE_NAME];
  if (token) {
    const sid = getSessionIdFromToken(token);
    if (sid) {
      await revokeSession(sid).catch(() => undefined);
    }
  }
  clearAuthCookie(res);
  res.json({ message: "Logged out" });
});

router.post("/change-password", authenticate, async (req, res) => {
  try {
    const data = changePasswordSchema.parse(req.body);

    const user = await db.query.users.findFirst({
      where: eq(users.id, req.user!.id),
    });

    if (!user || user.deletedAt) {
      return res.status(404).json({ error: "User not found" });
    }

    const ok = await bcrypt.compare(data.currentPassword, user.passwordHash);
    if (!ok) {
      return res.status(401).json({ error: "Invalid current password" });
    }

    const passwordHash = await bcrypt.hash(data.newPassword, 10);
    await db.update(users).set({ passwordHash }).where(eq(users.id, user.id));

    // Revoke every existing session so other devices must re-login.
    await revokeAllUserSessions(user.id);
    const { token } = await createUserSession(user.id);
    setAuthCookie(res, token);

    return res.json({ message: "Password updated" });
  } catch (err) {
    if (err instanceof ZodError) {
      return res.status(400).json({ error: "Invalid input", details: (err as ZodError).errors });
    }
    return res.status(500).json({ error: "Server error" });
  }
});

export { router as authRouter };
