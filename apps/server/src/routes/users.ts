import express from "express";
import { eq } from "drizzle-orm";
import { db } from "../../../../packages/db/src/index.js";
import { users } from "../../../../packages/db/src/schema.js";
import { authenticate } from "../middleware/auth.js";
import { getRequestContext, logError } from "../logger.js";

const router = express.Router();

router.get("/:id/contact", authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    const user = await db.query.users.findFirst({
      where: eq(users.id, id),
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({
      contact: {
        name: user.name,
        email: user.email,
        businessUnit: user.businessUnit,
      },
    });
  } catch (err) {
    logError("GET /api/users/:id/contact error", err as Error, getRequestContext(req));
    res.status(500).json({ error: "Server error" });
  }
});

export { router as usersRouter };
