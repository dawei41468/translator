import express from "express";
import { db } from "../../../../packages/db/src/index.js";
import { files, leads } from "../../../../packages/db/src/schema.js";
import { and, desc, eq, isNull } from "drizzle-orm";
import { deleteFromR2, downloadFromR2, existsInR2 } from "../r2.js";
import { authenticate } from "../middleware/auth.js";
import { getRequestContext, logError, logInfo, logWarn } from "../logger.js";

export const filesRouter = express.Router();

// GET /api/files/:id - Get file metadata
filesRouter.get("/:id", authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    const file = await db.query.files.findFirst({
      where: and(eq(files.id, id), isNull(files.deletedAt)),
    });

    if (!file) {
      return res.status(404).json({ error: "File not found" });
    }

    const hasAccess =
      req.user!.role === "admin" ||
      (await db.query.leads.findFirst({
        where: and(eq(leads.projectId, file.projectId), eq(leads.ownerUserId, req.user!.id), isNull(leads.deletedAt)),
      }));

    if (!hasAccess) {
      return res.status(403).json({ error: "Access denied" });
    }

    res.json({ file });
  } catch (err) {
    logError("GET /api/files/:id error", err as Error, getRequestContext(req));
    res.status(500).json({ error: "Server error" });
  }
});

// GET /api/files/:id/download - Get signed download URL
filesRouter.get("/:id/download", authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    const file = await db.query.files.findFirst({
      where: and(eq(files.id, id), isNull(files.deletedAt)),
    });

    if (!file) {
      return res.status(404).json({ error: "File not found" });
    }

    const downloadUrl = `/api/files/${id}/preview`;
    res.json({ downloadUrl });
  } catch (err) {
    logError("GET /api/files/:id/download error", err as Error, getRequestContext(req));
    res.status(500).json({ error: "Server error" });
  }
});

filesRouter.get("/:id/preview", authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    const file = await db.query.files.findFirst({
      where: and(eq(files.id, id), isNull(files.deletedAt)),
    });

    if (!file) {
      return res.status(404).json({ error: "File not found" });
    }

    const buffer = await downloadFromR2(file.r2Key);

    res.setHeader("Content-Type", file.mimeType || "application/octet-stream");

    const encodedFilename = encodeURIComponent(file.fileName);
    res.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodedFilename}`);
    res.setHeader("Content-Length", buffer.byteLength);

    res.send(buffer);
  } catch (err) {
    const e = err as unknown as { name?: string; message?: string; $metadata?: { httpStatusCode?: number } };
    const isMissingKey = e?.name === "NoSuchKey" || e?.$metadata?.httpStatusCode === 404;

    logError("GET /api/files/:id/preview error", err as Error, { ...getRequestContext(req), fileId: req.params.id });

    if (isMissingKey) {
      return res.status(404).send("File not found in storage");
    }

    return res.status(500).json({ error: "Server error" });
  }
});

filesRouter.get("/:id/status", authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    const file = await db.query.files.findFirst({
      where: and(eq(files.id, id), isNull(files.deletedAt)),
    });

    if (!file) {
      return res.status(404).json({ error: "File not found" });
    }

    const existsInStorage = await existsInR2(file.r2Key);
    return res.json({ existsInStorage });
  } catch (err) {
    logError("GET /api/files/:id/status error", err as Error, { ...getRequestContext(req), fileId: req.params.id });
    return res.status(500).json({ error: "Server error" });
  }
});

// GET /api/files/:id/download-direct - Download file directly with proper headers
filesRouter.get("/:id/download-direct", authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    const file = await db.query.files.findFirst({
      where: and(eq(files.id, id), isNull(files.deletedAt)),
    });

    if (!file) {
      return res.status(404).json({ error: "File not found" });
    }

    if (req.user!.role !== "admin" && file.uploadedByUserId !== req.user!.id) {
      return res.status(403).json({ error: "Access denied" });
    }

    const buffer = await downloadFromR2(file.r2Key);

    res.setHeader("Content-Type", file.mimeType || "application/octet-stream");

    const encodedFilename = encodeURIComponent(file.fileName);
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodedFilename}`);
    res.setHeader("Content-Length", buffer.byteLength);

    res.send(buffer);
  } catch (err) {
    const e = err as unknown as { name?: string; message?: string; $metadata?: { httpStatusCode?: number } };
    const isMissingKey = e?.name === "NoSuchKey" || e?.$metadata?.httpStatusCode === 404;

    logError("GET /api/files/:id/download-direct error", err as Error, getRequestContext(req));

    if (isMissingKey) {
      return res.status(404).json({ error: "File not found in storage" });
    }

    return res.status(500).json({ error: "Server error" });
  }
});

// DELETE /api/files/:id - Soft delete file and clean up R2 storage (only uploader can delete)
filesRouter.delete("/:id", authenticate, async (req, res) => {
  const context = getRequestContext(req);
  try {
    const { id } = req.params;

    const file = await db.query.files.findFirst({
      where: and(eq(files.id, id), isNull(files.deletedAt)),
    });

    if (!file) {
      return res.status(404).json({ error: "File not found" });
    }

    if (req.user!.role !== "admin" && file.uploadedByUserId !== req.user!.id) {
      return res.status(403).json({ error: "Only the file uploader can delete this file" });
    }

    try {
      await deleteFromR2(file.r2Key);
      logInfo("File deleted from R2 storage", {
        ...context,
        fileId: id,
        r2Key: file.r2Key,
      });
    } catch (r2Error) {
      logWarn("Failed to delete file from R2 storage, continuing with database deletion", {
        ...context,
        fileId: id,
        r2Key: file.r2Key,
        error: { message: (r2Error as Error).message },
      });
    }

    await db.update(files).set({ deletedAt: new Date() }).where(eq(files.id, id));

    logInfo("File deleted successfully", {
      ...context,
      fileId: id,
      projectId: file.projectId,
      fileName: file.fileName,
    });

    res.json({ message: "File deleted" });
  } catch (err) {
    logError("File delete error", err as Error, { ...context, fileId: req.params.id });
    res.status(500).json({ error: "Server error" });
  }
});
