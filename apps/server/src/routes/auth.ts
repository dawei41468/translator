import express from "express";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z, ZodError } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../../../../packages/db/src/index.js";
import { users } from "../../../../packages/db/src/schema.js";
import { logInfo, logWarn, logError, getRequestContext } from "../logger.js";
import { authenticate } from "../middleware/auth.js";

const router = express.Router();

const AUTH_COOKIE_NAME = "auth_token";
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(200),
});

// Auth endpoints rate limiter - more lenient for internal apps
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // 50 attempts (not 5) - employees may legitimately forget passwords
  skipSuccessfulRequests: true, // Reset counter on successful login
  message: { error: 'Too many authentication attempts' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.use(authLimiter);

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
  const context = getRequestContext(req);

  if (!email || !password) {
    const passwordLength = typeof password === "string" ? password.length : null;
    logWarn("Login attempt with missing fields", {
      ...context,
      email,
      contentType: req.headers["content-type"],
      bodyKeys: typeof body === "object" && body !== null ? Object.keys(body as Record<string, unknown>) : null,
      passwordType: typeof password,
      passwordLength,
    });
    return res.status(400).json({ error: "Missing fields" });
  }

  try {
    const matchingUsers = await db.query.users.findMany({
      where: eq(users.email, email.toLowerCase()),
    });

    if (matchingUsers.length > 1) {
      logError(
        "Duplicate email detected during login",
        new Error("Duplicate email"),
        { ...context, email }
      );
      return res.status(409).json({ error: "Multiple accounts share this email. Contact an admin." });
    }

    const user = matchingUsers[0];

    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      logWarn("Failed login attempt", { ...context, email });
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        name: user.name,
        language: user.language,
      },
      JWT_SECRET,
      { expiresIn: "30d" }
    );

    const isProd = process.env.NODE_ENV === "production";
    res.cookie(AUTH_COOKIE_NAME, token, {
      httpOnly: true,
      secure: isProd,
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60 * 1000,
      path: "/",
    });

    logInfo("User logged in successfully", { ...context, userId: user.id });

    res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        language: user.language,
      },
    });
  } catch (err) {
    logError("Login error", err as Error, context);
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/logout", (req, res) => {
  const isProd = process.env.NODE_ENV === "production";
  res.cookie(AUTH_COOKIE_NAME, "", {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    expires: new Date(0),
    path: "/",
  });
  res.json({ message: "Logged out" });
});

router.post("/change-password", authenticate, async (req, res) => {
  const context = getRequestContext(req);
  try {
    const data = changePasswordSchema.parse(req.body);

    const user = await db.query.users.findFirst({
      where: eq(users.id, req.user!.id),
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const ok = await bcrypt.compare(data.currentPassword, user.passwordHash);
    if (!ok) {
      return res.status(401).json({ error: "Invalid current password" });
    }

    const passwordHash = await bcrypt.hash(data.newPassword, 10);
    await db.update(users).set({ passwordHash }).where(eq(users.id, user.id));

    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        name: user.name,
        language: user.language,
      },
      JWT_SECRET,
      { expiresIn: "30d" }
    );

    const isProd = process.env.NODE_ENV === "production";
    res.cookie(AUTH_COOKIE_NAME, token, {
      httpOnly: true,
      secure: isProd,
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60 * 1000,
      path: "/",
    });

    logInfo("User changed password", { ...context, userId: user.id });
    return res.json({ message: "Password updated" });
  } catch (err) {
    if (err instanceof ZodError) {
      return res.status(400).json({ error: "Invalid input", details: (err as ZodError).errors });
    }
    logError("Change password error", err as Error, context);
    return res.status(500).json({ error: "Server error" });
  }
});

export { router as authRouter };