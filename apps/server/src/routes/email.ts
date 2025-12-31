import express from "express";
import { z, ZodError } from "zod";
import { db } from "../../../../packages/db/src/index.js";
import { users } from "../../../../packages/db/src/schema.js";
import { eq } from "drizzle-orm";
import { logInfo, logError, getRequestContext } from "../logger.js";
import { testEmailConnection } from "../notifications.js";
import { authenticate } from "../middleware/auth.js";

export const emailRouter = express.Router();

const emailPreferencesSchema = z.object({
  enableConflictEmails: z.boolean().optional(),
  enableCommentEmails: z.boolean().optional(),
  enableQuoteExpiringEmails: z.boolean().optional(),
});

emailRouter.get("/preferences", authenticate, async (req, res) => {
  const context = getRequestContext(req);
  try {
    const user = await db.query.users.findFirst({
      where: eq(users.id, req.user!.id),
      columns: {
        enableConflictEmails: true,
        enableCommentEmails: true,
        enableQuoteExpiringEmails: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    logInfo("User retrieved email preferences", { ...context });
    res.json({
      enableConflictEmails: user.enableConflictEmails,
      enableCommentEmails: user.enableCommentEmails,
      enableQuoteExpiringEmails: user.enableQuoteExpiringEmails,
    });
  } catch (err) {
    logError("Get email preferences error", err as Error, context);
    res.status(500).json({ error: "Server error" });
  }
});

emailRouter.put("/preferences", authenticate, async (req, res) => {
  const context = getRequestContext(req);
  try {
    const data = emailPreferencesSchema.parse(req.body);

    const updateData: Partial<typeof users.$inferInsert> = {};
    if (data.enableConflictEmails !== undefined) {
      updateData.enableConflictEmails = data.enableConflictEmails;
    }
    if (data.enableCommentEmails !== undefined) {
      updateData.enableCommentEmails = data.enableCommentEmails;
    }
    if (data.enableQuoteExpiringEmails !== undefined) {
      updateData.enableQuoteExpiringEmails = data.enableQuoteExpiringEmails;
    }

    await db.update(users).set(updateData).where(eq(users.id, req.user!.id));

    logInfo("User updated email preferences", { ...context, ...data });
    res.json({ message: "Email preferences updated" });
  } catch (err) {
    if (err instanceof ZodError) {
      return res.status(400).json({ error: "Invalid input", details: (err as ZodError).errors });
    }
    logError("Update email preferences error", err as Error, context);
    res.status(500).json({ error: "Server error" });
  }
});

emailRouter.post("/test", authenticate, async (req, res) => {
  const context = getRequestContext(req);
  try {
    const success = await testEmailConnection();
    res.json({ success });
  } catch (err) {
    logError("Email test error", err as Error, context);
    res.status(500).json({ error: "Server error" });
  }
});
