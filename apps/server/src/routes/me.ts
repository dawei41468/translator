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

function normalizeEnginePreferences(preferences: any): any {
  if (!preferences || typeof preferences !== "object") return preferences;

  const next = { ...preferences };

  if (next.sttEngine === "web-speech-api") {
    next.sttEngine = "google-cloud-stt";
  }
  if (next.ttsEngine === "web-speech-api") {
    next.ttsEngine = "google-cloud";
  }

  return next;
}

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
        displayName: user.displayName,
        language: user.language,
        isGuest: user.isGuest,
        preferences: normalizeEnginePreferences(user.preferences),
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
    if (!language || typeof language !== "string" || !["en", "zh", "ko", "es", "ja", "it", "de", "nl"].includes(language)) {
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

router.patch("/", authenticate, async (req, res) => {
  // const context = getRequestContext(req);
  try {
    const { displayName, language, preferences } = req.body;

    // Validate displayName
    if (displayName !== undefined && (typeof displayName !== "string" || displayName.length > 255)) {
      return res.status(400).json({ error: "Invalid display name" });
    }

    // Validate language
    if (language !== undefined && (!language || typeof language !== "string" || !["en", "zh", "ko", "es", "ja", "it", "de", "nl"].includes(language))) {
      return res.status(400).json({ error: "Invalid language" });
    }

    // Validate preferences
    if (preferences !== undefined) {
      if (typeof preferences !== "object" || preferences === null) {
        return res.status(400).json({ error: "Invalid preferences format" });
      }

      const normalizedPreferences = normalizeEnginePreferences(preferences);

      // Validate specific preference fields
      const validSttEngines = ["google-cloud-stt"];
      const validTtsEngines = ["google-cloud"];
      const validTranslationEngines = ["google-translate", "grok-translate"];

      if (normalizedPreferences.sttEngine && !validSttEngines.includes(normalizedPreferences.sttEngine)) {
        return res.status(400).json({ error: "Invalid STT engine" });
      }
      if (normalizedPreferences.ttsEngine && !validTtsEngines.includes(normalizedPreferences.ttsEngine)) {
        return res.status(400).json({ error: "Invalid TTS engine" });
      }
      if (normalizedPreferences.translationEngine && !validTranslationEngines.includes(normalizedPreferences.translationEngine)) {
        return res.status(400).json({ error: "Invalid translation engine" });
      }

      // Always persist normalized preferences
      preferences.sttEngine = normalizedPreferences.sttEngine;
      preferences.ttsEngine = normalizedPreferences.ttsEngine;
      preferences.translationEngine = normalizedPreferences.translationEngine;
    }

    const updateData: any = {};
    if (displayName !== undefined) updateData.displayName = displayName;
    if (language !== undefined) updateData.language = language;
    if (preferences !== undefined) updateData.preferences = preferences;

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: "No valid fields to update" });
    }

    await db.update(users).set(updateData).where(eq(users.id, req.user!.id));

    // logInfo("User updated profile", { ...context, updateData });

    res.json({ message: "Profile updated" });
  } catch (err) {
    // logError("Update profile error", err as Error, context);
    res.status(500).json({ error: "Server error" });
  }
});

export { router as meRouter };
