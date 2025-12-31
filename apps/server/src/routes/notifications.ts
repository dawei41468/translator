import express from "express";
import { db } from "../../../../packages/db/src/index.js";
import { notifications } from "../../../../packages/db/src/schema.js";
import { and, desc, eq } from "drizzle-orm";
import { getRequestContext, logError } from "../logger.js";
import { authenticate } from "../middleware/auth.js";

export const notificationsRouter = express.Router();

notificationsRouter.get("/", authenticate, async (req, res) => {
  try {
    const userNotifications = await db.query.notifications.findMany({
      where: eq(notifications.userId, req.user!.id),
      orderBy: desc(notifications.createdAt),
      limit: 50,
    });

    res.json({ notifications: userNotifications });
  } catch (err) {
    logError("GET /api/notifications error", err as Error, getRequestContext(req));
    res.status(500).json({ error: "Server error" });
  }
});

notificationsRouter.patch("/:id/read", authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await db.query.notifications.findFirst({
      where: and(eq(notifications.id, id), eq(notifications.userId, req.user!.id)),
    });

    if (!existing) {
      return res.status(404).json({ error: "Notification not found" });
    }

    if (existing.read) {
      return res.json({ message: "Notification already read" });
    }

    await db.update(notifications).set({ read: true, updatedAt: new Date() }).where(eq(notifications.id, id));

    res.json({ message: "Notification marked as read" });
  } catch (err) {
    logError("PATCH /api/notifications/:id/read error", err as Error, getRequestContext(req));
    res.status(500).json({ error: "Server error" });
  }
});
