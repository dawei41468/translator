import express from "express";
import { and, asc, eq } from "drizzle-orm";
import { db } from "../../../../packages/db/src/index.js";
import { users } from "../../../../packages/db/src/schema.js";
import { authenticate } from "../middleware/auth.js";
import { sanitizeInput } from "../middleware/sanitizeInput.js";
import { getRequestContext, logError } from "../logger.js";

const router = express.Router();

router.get("/", authenticate, sanitizeInput, async (req, res) => {
  try {
    const userList = await db.query.users.findMany({
      columns: {
        id: true,
        name: true,
      },
      where: and(eq(users.businessUnit, req.user!.businessUnit), eq(users.isActive, true)),
      orderBy: asc(users.name),
    });

    res.json({ users: userList });
  } catch (err) {
    logError("GET /api/bu-users error", err as Error, getRequestContext(req));
    res.status(500).json({ error: "Server error" });
  }
});

export { router as buUsersRouter };
