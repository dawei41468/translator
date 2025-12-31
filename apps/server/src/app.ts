import express from "express";
import cors from "cors";
import { json } from "express";
import path from "path";

import { users } from "../../../packages/db/src/schema.js";

import { requestLogger } from "./middleware/logger.js";
import { apiLimiter, adminLimiter, uploadLimiter } from "./middleware/rateLimiters.js";

import { emailRouter } from "./routes/email.js";
import { adminEmailRouter } from "./routes/admin-email.js";
import { notificationsRouter } from "./routes/notifications.js";
import { projectCommentsRouter } from "./routes/project-comments.js";
import { projectLeadsRouter } from "./routes/project-leads.js";
import { leadsRouter } from "./routes/leads.js";
import { leadDetailRouter } from "./routes/lead-detail.js";
import { filesRouter } from "./routes/files.js";
import { fileUploadRouter } from "./routes/file-upload.js";
import { adminRouter } from "./routes/admin/index.js";
import { authRouter } from "./routes/auth.js";
import { meRouter } from "./routes/me.js";
import { projectsRouter } from "./routes/projects.js";
import { usersRouter } from "./routes/users.js";
import { buUsersRouter } from "./routes/bu-users.js";
import { dashboardRouter } from "./routes/dashboard.js";

declare global {
  namespace Express {
    interface Request {
      user?: typeof users.$inferSelect;
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

app.use(cors({ origin: true, credentials: true }));
app.use(json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: true, limit: "10kb" }));
app.use(requestLogger);

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

// ────── VALIDATION MIDDLEWARE ──────
// Documentation: Input Validation & Sanitization Patterns
//
// Query Parameter Validation:
// - Use validateQuery(schema) middleware for all list endpoints
// - Define Zod schemas for each endpoint's query parameters
// - Schemas include: limit (1-100), offset (0+), search strings, filters
//
// Path Parameter Validation:
// - Use validateUuid("paramName") for all UUID path parameters
// - Validates format: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
//
// Input Sanitization:
// - Use sanitizeInput middleware for all POST/PUT endpoints
// - Trims whitespace from string fields
// - Removes SQL wildcards (%_) from search parameters
//
// Safe SQL Queries:
// - Use sql`%${param}%` instead of string concatenation
// - Prevents SQL injection in LIKE queries
//
// Request Size Limits:
// - JSON payloads: 10kb (express.json limit)
// - URL-encoded: 10kb (express.urlencoded limit)
// - File uploads: 20MB (multer limit)
//
// Error Monitoring:
// - Validation errors are logged with context (endpoint, user, IP)
// - Use logWarn for validation failures

// ────── RATE LIMITING ──────
// Documentation: Rate Limiting for Internal Business Application
//
// Auth Endpoints (Generous Limits):
// - Window: 15 minutes
// - Max attempts: 50 (not 5) - employees may legitimately forget passwords
// - Skip successful requests: Reset counter on successful login
//
// API Endpoints (Per-User Tracking):
// - Window: 1 minute
// - Max requests: 300 (5 requests/second) - reasonable for business use
// - Key: Per-user ID (not IP) - employees may share office IPs
//
// Admin Endpoints (Stricter Limits):
// - Window: 1 minute
// - Max requests: 100 - prevent admin abuse
//
// File Upload (Most Restrictive):
// - Window: 5 minutes
// - Max uploads: 20 - prevent storage abuse
//
// Implementation Notes:
// - Auth routes: Skip successful requests (resets counter on login)
// - All limiters: Per-user tracking (not IP) for internal business app
// - Admin routes: Stricter limits to prevent admin abuse
// - File uploads: Most restrictive to prevent storage exhaustion
// - Headers: Include X-RateLimit-* headers for client visibility

// ────── AUTH ENDPOINTS ──────
app.use("/api/auth", authRouter);

app.use("/api/email", apiLimiter);
app.use("/api/email", emailRouter);

// Admin routes get stricter limiting
app.use("/api/admin", adminLimiter);
app.use("/api/admin", adminEmailRouter);
app.use("/api/admin", adminRouter);

// Apply general API rate limiting to authenticated routes
app.use("/api/projects", apiLimiter);
app.use("/api/projects", projectsRouter);

app.use("/api/leads", apiLimiter);
app.use("/api/leads", leadsRouter);
app.use("/api/leads", leadDetailRouter);

app.use("/api/dashboard", apiLimiter);
app.use("/api/dashboard", dashboardRouter);

app.use("/api/me", apiLimiter);
app.use("/api/me", meRouter);

app.use("/api/users", apiLimiter);
app.use("/api/users", usersRouter);

app.use("/api/bu-users", apiLimiter);
app.use("/api/bu-users", buUsersRouter);

app.use("/api/files", apiLimiter);
app.use("/api/files", filesRouter);

app.use("/api/notifications", apiLimiter);
app.use("/api/notifications", notificationsRouter);

// Mount nested project comments routes
app.use("/api/projects/:projectId/comments", projectCommentsRouter);

// Mount nested project lead routes
app.use("/api/projects/:projectId", projectLeadsRouter);

// File uploads get most restrictive limiting
app.use("/api/files/upload", uploadLimiter);
app.use("/api/files/upload", fileUploadRouter);

app.get("/api/health", (_, res) => res.json({ status: "ok" }));
app.get("/favicon.ico", (_, res) => res.status(204).end());

app.get("*", (_, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.sendFile(path.join(WEB_DIST_DIR, "index.html"));
});
