import express from "express";
import { z, ZodError } from "zod";
import { db } from "../../../../packages/db/src/index.js";
import { comments, projects, users } from "../../../../packages/db/src/schema.js";
import { and, desc, eq, inArray, isNull, like, not } from "drizzle-orm";
import { authenticate } from "../middleware/auth.js";
import { getRequestContext, logError, logInfo, logWarn } from "../logger.js";
import { createAuditLog } from "../utils/audit.js";
import { createCommentNotifications, createMentionNotifications, sendCommentEmail } from "../notifications.js";

export const projectCommentsRouter = express.Router({ mergeParams: true });

type CommentRow = typeof comments.$inferSelect;

function unwrapReturningRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (typeof result !== "object" || result === null) return [];
  if (!("rows" in result)) return [];
  const rows = (result as { rows?: unknown }).rows;
  return Array.isArray(rows) ? (rows as T[]) : [];
}

const querySchema = z.object({
  limit: z.string().regex(/^\d+$/).optional().default("10"),
  offset: z.string().regex(/^\d+$/).optional().default("0"),
});

const createCommentSchema = z.object({
  content: z.string().min(1).max(1000),
  parentId: z.string().uuid().optional(),
});

const updateCommentSchema = z.object({
  content: z.string().min(1).max(1000),
});

// GET /api/projects/:projectId/comments - List comments with threading
projectCommentsRouter.get("/", authenticate, async (req, res) => {
  try {
    const { projectId } = req.params;
    const query = querySchema.parse(req.query);
    const limit = parseInt(query.limit);
    const offset = parseInt(query.offset);

    const project = await db.query.projects.findFirst({
      where: and(eq(projects.id, projectId), isNull(projects.deletedAt)),
    });

    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    const commentList = await db.query.comments.findMany({
      where: and(eq(comments.projectId, projectId), isNull(comments.deletedAt)),
      with: {
        author: true,
      },
      orderBy: comments.path,
      limit,
      offset,
    });

    res.json({ comments: commentList });
  } catch (err) {
    if (err instanceof ZodError) {
      return res.status(400).json({ error: "Invalid query parameters", details: (err as ZodError).errors });
    }
    logError("GET /api/projects/:projectId/comments error", err as Error, getRequestContext(req));
    res.status(500).json({ error: "Server error" });
  }
});

// POST /api/projects/:projectId/comments - Create comment
projectCommentsRouter.post("/", authenticate, async (req, res) => {
  const context = getRequestContext(req);
  try {
    const { projectId } = req.params;
    const data = createCommentSchema.parse(req.body);

    const project = await db.query.projects.findFirst({
      where: and(eq(projects.id, projectId), isNull(projects.deletedAt)),
    });

    if (!project) {
      logWarn("Comment creation attempted for non-existent project", { ...context, projectId });
      return res.status(404).json({ error: "Project not found" });
    }

    let parentComment: CommentRow | null = null;
    if (data.parentId) {
      const foundParent = (await db.query.comments.findFirst({
        where: and(eq(comments.id, data.parentId), eq(comments.projectId, projectId), isNull(comments.deletedAt)),
      })) as CommentRow | undefined;
      parentComment = foundParent ?? null;
      if (!parentComment) {
        logWarn("Comment creation with invalid parentId", { ...context, projectId, parentId: data.parentId });
        return res.status(400).json({ error: "Invalid parentId" });
      }
    }

    let commentPath: string;
    if (parentComment) {
      const siblings = await db.query.comments.findMany({
        where: and(
          eq(comments.projectId, projectId),
          like(comments.path, `${parentComment.path}.%`),
          isNull(comments.deletedAt)
        ),
        orderBy: desc(comments.path),
        limit: 1,
      });

      const lastSiblingPath = siblings[0]?.path;
      if (lastSiblingPath) {
        const parts = lastSiblingPath.split(".");
        const lastPart = parseInt(parts[parts.length - 1]);
        commentPath = `${parentComment.path}.${lastPart + 1}`;
      } else {
        commentPath = `${parentComment.path}.1`;
      }
    } else {
      const rootComments = await db.query.comments.findMany({
        where: and(
          eq(comments.projectId, projectId),
          not(like(comments.path, "%.%")),
          isNull(comments.deletedAt)
        ),
        orderBy: desc(comments.path),
        limit: 1,
      });

      const lastRootPath = rootComments[0]?.path;
      if (lastRootPath) {
        const nextNum = parseInt(lastRootPath) + 1;
        commentPath = nextNum.toString();
      } else {
        commentPath = "1";
      }
    }

    const insertResult = await db
      .insert(comments)
      .values({
        projectId,
        authorId: req.user!.id,
        content: data.content,
        parentId: data.parentId || null,
        path: commentPath,
      })
      .returning();

    const insertedComments = unwrapReturningRows<CommentRow>(insertResult);
    const comment = insertedComments[0];
    if (!comment) {
      logError("Comment creation error - missing inserted row", new Error("Insert returned no rows"), {
        ...context,
        projectId,
      });
      return res.status(500).json({ error: "Server error" });
    }

    logInfo("Comment created successfully", {
      ...context,
      commentId: comment.id,
      projectId,
      parentId: data.parentId,
      path: commentPath,
    });

    await createAuditLog({
      userId: req.user!.id,
      userBusinessUnit: req.user!.businessUnit,
      userRole: req.user!.role,
      action: "COMMENT_CREATE",
      targetType: "project",
      targetId: projectId,
      ipAddress: getRequestContext(req).ip,
      userAgent: getRequestContext(req).userAgent,
      endpoint: req.path,
      metadata: {
        commentId: comment.id,
        content: data.content,
        parentId: data.parentId,
        path: commentPath,
      },
      newValues: {
        content: data.content,
        parentId: data.parentId,
        path: commentPath,
      },
    });

    res.status(201).json({ comment });

    void createCommentNotifications(projectId, project.projectName, req.user!.id, data.content).catch((err) => {
      logError("Comment notifications error", err as Error, { ...context, projectId, commentId: comment.id });
    });

    void sendCommentEmail(projectId, data.content, req.user!.name, req.user!.id).catch((err) => {
      logError("Comment email error", err as Error, { ...context, projectId, commentId: comment.id });
    });

    const emailMatches = Array.from(
      new Set((data.content.match(/@([\w.+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g) || []).map((m) => m.slice(1)))
    );
    if (emailMatches.length) {
      const mentionedUsers = await db.query.users.findMany({
        columns: { id: true, email: true },
        where: inArray(users.email, emailMatches),
      });
      const mentionedIds = mentionedUsers.map((u) => u.id);
      void createMentionNotifications(projectId, project.projectName, req.user!.id, mentionedIds).catch((err) => {
        logError("Mention notifications error", err as Error, { ...context, projectId, commentId: comment.id, mentioned: emailMatches });
      });
    }
  } catch (err) {
    if (err instanceof ZodError) {
      logWarn("Comment creation failed - invalid input", {
        ...context,
        projectId: req.params.projectId,
        errors: (err as ZodError).errors,
      });
      return res.status(400).json({ error: "Invalid input", details: (err as ZodError).errors });
    }
    logError("Comment creation error", err as Error, { ...context, projectId: req.params.projectId });
    res.status(500).json({ error: "Server error" });
  }
});

// PUT /api/projects/:projectId/comments/:commentId - Update comment
projectCommentsRouter.put("/:commentId", authenticate, async (req, res) => {
  const context = getRequestContext(req);
  try {
    const { projectId, commentId } = req.params;
    const data = updateCommentSchema.parse(req.body);

    const existing = await db.query.comments.findFirst({
      where: and(eq(comments.id, commentId), eq(comments.projectId, projectId), isNull(comments.deletedAt)),
    });

    if (!existing) {
      logWarn("Comment update attempted on non-existent comment", { ...context, commentId, projectId });
      return res.status(404).json({ error: "Comment not found" });
    }

    if (req.user!.role !== "admin" && existing.authorId !== req.user!.id) {
      logWarn("Unauthorized comment update attempt", { ...context, commentId, commentAuthorId: existing.authorId });
      return res.status(403).json({ error: "Unauthorized" });
    }

    const updated = await db
      .update(comments)
      .set({
        content: data.content,
        updatedAt: new Date(),
      })
      .where(eq(comments.id, commentId))
      .returning();

    res.json({ comment: updated[0] });
  } catch (err) {
    if (err instanceof ZodError) {
      logWarn("Comment update failed - invalid input", {
        ...context,
        commentId: req.params.commentId,
        errors: (err as ZodError).errors,
      });
      return res.status(400).json({ error: "Invalid input", details: (err as ZodError).errors });
    }
    logError("Comment update error", err as Error, { ...context, commentId: req.params.commentId });
    res.status(500).json({ error: "Server error" });
  }
});

// DELETE /api/projects/:projectId/comments/:commentId - Soft delete comment
projectCommentsRouter.delete("/:commentId", authenticate, async (req, res) => {
  const context = getRequestContext(req);
  try {
    const { projectId, commentId } = req.params;

    const existing = await db.query.comments.findFirst({
      where: and(eq(comments.id, commentId), eq(comments.projectId, projectId), isNull(comments.deletedAt)),
    });

    if (!existing) {
      logWarn("Comment delete attempted on non-existent comment", { ...context, commentId, projectId });
      return res.status(404).json({ error: "Comment not found" });
    }

    if (req.user!.role !== "admin" && existing.authorId !== req.user!.id) {
      logWarn("Unauthorized comment delete attempt", { ...context, commentId, commentAuthorId: existing.authorId });
      return res.status(403).json({ error: "Unauthorized" });
    }

    await db.update(comments).set({ deletedAt: new Date() }).where(eq(comments.id, commentId));

    logInfo("Comment deleted successfully", {
      ...context,
      commentId,
      projectId,
    });

    res.json({ message: "Comment deleted" });
  } catch (err) {
    logError("Comment delete error", err as Error, { ...context, commentId: req.params.commentId });
    res.status(500).json({ error: "Server error" });
  }
});
