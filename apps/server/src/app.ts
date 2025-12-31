import express from "express";
import cors from "cors";
import { json } from "express";
import path from "path";
import rateLimit from "express-rate-limit";

import { authRouter } from "./routes/auth.js";
import { meRouter } from "./routes/me.js";
import { roomsRouter } from "./routes/rooms.js";
import { authenticate } from "./middleware/auth.js";
import { requestLogger } from "./middleware/logger.js";

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        name: string | null;
        language: string | null;
        createdAt: Date | null;
        updatedAt: Date | null;
        deletedAt: Date | null;
      };
    }
  }
}

function getRepoRootFromCwd(): string {
  const cwd = process.cwd();
  const base = path.basename(cwd);
  const parent = path.basename(path.dirname(cwd));
  if (base === "server" && parent === "apps") {
    return path.resolve(cwd, "../..");
  }
  return cwd;
}

const WEB_DIST_DIR = path.resolve(getRepoRootFromCwd(), "apps/web/dist");

export const app = express();

app.use(requestLogger);
app.use(cors({ origin: true, credentials: true }));
app.use(json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: true, limit: "10kb" }));

// Rate limiting
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // limit each IP to 10 requests per windowMs
  message: "Too many authentication attempts, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
});

const roomLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // limit each IP to 30 room operations per minute
  message: "Too many room operations, please slow down.",
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(
  "/assets",
  express.static(path.join(WEB_DIST_DIR, "assets"), {
    immutable: true,
    maxAge: "1y",
  })
);

app.use(
  express.static(WEB_DIST_DIR, {
    setHeaders(res, filePath) {
      if (filePath.endsWith("index.html")) {
        res.setHeader("Cache-Control", "no-store");
      }
    },
  })
);

// ────── AUTHENTICATION MIDDLEWARE ──────
// authenticate moved to middleware/auth.ts


// ────── AUTH ENDPOINTS ──────
app.use("/api/auth", authLimiter, authRouter);

app.use("/api/me", meRouter);

app.use("/api/rooms", roomLimiter, authenticate, roomsRouter);

app.get("/api/health", (_, res) => res.json({ status: "ok" }));
app.get("/favicon.ico", (_, res) => res.status(204).end());

app.get("*", (_, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.sendFile(path.join(WEB_DIST_DIR, "index.html"));
});
