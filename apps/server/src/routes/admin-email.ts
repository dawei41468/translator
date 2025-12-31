import express from "express";
import { z, ZodError } from "zod";
import { getRequestContext, logError, logInfo } from "../logger.js";
import { authenticate } from "../middleware/auth.js";
import { sendTestCommentEmail, sendTestConflictEmail } from "../notifications.js";

export const adminEmailRouter = express.Router();

const sendTestEmailSchema = z.object({
  emailAddress: z.string().email(),
});

adminEmailRouter.post("/send-test-email", authenticate, async (req, res) => {
  const context = getRequestContext(req);
  try {
    if (req.user!.role !== "admin") {
      return res.status(403).json({ error: "Admin access required" });
    }

    const data = sendTestEmailSchema.parse(req.body);
    const success = await sendTestConflictEmail(data.emailAddress);

    if (success) {
      logInfo("Admin sent test conflict email", { ...context, emailAddress: data.emailAddress });
      res.json({ success: true, message: "Test conflict email sent successfully" });
    } else {
      res.status(500).json({ error: "Failed to send test conflict email" });
    }
  } catch (err) {
    if (err instanceof ZodError) {
      return res.status(400).json({ error: "Invalid email address", details: (err as ZodError).errors });
    }
    logError("Send test conflict email error", err as Error, context);
    res.status(500).json({ error: "Server error" });
  }
});

adminEmailRouter.post("/send-test-comment-email", authenticate, async (req, res) => {
  const context = getRequestContext(req);
  try {
    if (req.user!.role !== "admin") {
      return res.status(403).json({ error: "Admin access required" });
    }

    const data = sendTestEmailSchema.parse(req.body);
    const success = await sendTestCommentEmail(data.emailAddress);

    if (success) {
      logInfo("Admin sent test comment email", { ...context, emailAddress: data.emailAddress });
      res.json({ success: true, message: "Test comment email sent successfully" });
    } else {
      res.status(500).json({ error: "Failed to send test comment email" });
    }
  } catch (err) {
    if (err instanceof ZodError) {
      return res.status(400).json({ error: "Invalid email address", details: (err as ZodError).errors });
    }
    logError("Send test comment email error", err as Error, context);
    res.status(500).json({ error: "Server error" });
  }
});
