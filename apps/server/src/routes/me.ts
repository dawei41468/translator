import express from "express";
import jwt from "jsonwebtoken";
import type { JwtPayload } from "jsonwebtoken";
import { eq } from "drizzle-orm";
import { db } from "../../../../packages/db/src/index.js";
import { users } from "../../../../packages/db/src/schema.js";
import { authenticate, parseCookies } from "../middleware/auth.js";
// import { logError, logInfo, getRequestContext } from "../logger.js";

const router = express.Router();

const AUTH_COOKIE_NAME = "auth_token";
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";

function getUserIdFromJwtPayload(payload: string | JwtPayload): string | null {
  if (typeof payload === "string") return null;
  const userId = payload["userId"];
  return typeof userId === "string" ? userId : null;
}

router.get("/", async (req, res) => {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[AUTH_COOKIE_NAME];
  if (!token) {
    return res.json({ user: null });
  }

  try {
    const verified = jwt.verify(token, JWT_SECRET);
    const userId = getUserIdFromJwtPayload(verified as string | JwtPayload);
    if (!userId) {
      return res.json({ user: null });
    }

    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!user) {
      return res.json({ user: null });
    }

    // if (!user.isActive) {
    //   return res.json({ user: null });
    // }

    return res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        // businessUnit: user.businessUnit,
        // role: user.role,
        language: user.language,
      },
    });
  } catch {
    return res.json({ user: null });
  }
});

router.put("/language", authenticate, async (req, res) => {
  // const context = getRequestContext(req);
  try {
    const { language } = req.body;
    if (!language || typeof language !== "string" || !["en", "zh", "it", "de", "nl"].includes(language)) {
      return res.status(400).json({ error: "Invalid language" });
    }

    await db.update(users).set({ language }).where(eq(users.id, req.user!.id));

    // logInfo("User updated language", { ...context, language });

    res.json({ message: "Language updated" });
  } catch (err) {
    // logError("Update language error", err as Error, context);
    res.status(500).json({ error: "Server error" });
  }
});

export { router as meRouter };
