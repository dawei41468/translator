import express from "express";
import { v4 as uuidv4 } from "uuid";
import { db } from "../../../../packages/db/src/index.js";
import { files, leads, projects } from "../../../../packages/db/src/schema.js";
import { and, eq, isNull } from "drizzle-orm";
import { uploadToR2, getSignedDownloadUrl } from "../r2.js";
import { authenticate } from "../middleware/auth.js";
import { upload } from "../middleware/upload.js";
import { getRequestContext, logError, logInfo } from "../logger.js";
import { createAuditLog } from "../utils/audit.js";

export const fileUploadRouter = express.Router();

// POST /api/files/upload - Upload a file
fileUploadRouter.post("/", authenticate, upload.single("file"), async (req, res) => {
  const context = getRequestContext(req);
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const { projectId } = req.body;
    if (!projectId) {
      return res.status(400).json({ error: "projectId is required" });
    }

    const project = await db.query.projects.findFirst({
      where: and(eq(projects.id, projectId), isNull(projects.deletedAt)),
    });

    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    if (req.user!.role !== "admin" && project.createdByUserId !== req.user!.id) {
      const isLeadOwnerInProject = await db.query.leads.findFirst({
        where: and(eq(leads.projectId, projectId), eq(leads.ownerUserId, req.user!.id), isNull(leads.deletedAt)),
        columns: {
          id: true,
        },
      });

      if (!isLeadOwnerInProject) {
        return res.status(403).json({ error: "Unauthorized" });
      }
    }

    const decodedFileName = Buffer.from(req.file.originalname, "latin1").toString("utf8");
    const fileKey = `${uuidv4()}-${decodedFileName}`;

    await uploadToR2(fileKey, req.file.buffer, req.file.mimetype);
    const signedUrl = await getSignedDownloadUrl(fileKey);

    const newFile = await db
      .insert(files)
      .values({
        projectId,
        fileType: "project",
        fileName: decodedFileName,
        fileUrl: signedUrl,
        r2Key: fileKey,
        mimeType: req.file.mimetype,
        sizeBytes: req.file.size,
        uploadedByUserId: req.user!.id,
      })
      .returning();

    const file = newFile[0];

    logInfo("File uploaded successfully", {
      ...context,
      fileId: file.id,
      projectId,
      fileName: decodedFileName,
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
    });

    await createAuditLog({
      userId: req.user!.id,
      userBusinessUnit: req.user!.businessUnit,
      userRole: req.user!.role,
      action: "FILE_UPLOAD",
      targetType: "file",
      targetId: file.id,
      ipAddress: getRequestContext(req).ip,
      userAgent: getRequestContext(req).userAgent,
      endpoint: req.path,
      metadata: {
        projectId,
        fileName: decodedFileName,
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
        fileType: "project",
      },
      newValues: {
        fileName: decodedFileName,
        mimeType: req.file.mimetype,
        sizeBytes: req.file.size,
      },
    });

    res.status(201).json({ file });
  } catch (err) {
    logError("File upload error", err as Error, context);
    res.status(500).json({ error: "Server error" });
  }
});
