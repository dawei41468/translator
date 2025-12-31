import express from "express";
import { ZodError, z } from "zod";
import { db } from "../../../../packages/db/src/index.js";
import { files, leads, users } from "../../../../packages/db/src/schema.js";
import { and, desc, eq, isNull } from "drizzle-orm";
import { authenticate } from "../middleware/auth.js";
import { validateUuid } from "../middleware/validateUuid.js";
import { getRequestContext, logError, logInfo, logWarn } from "../logger.js";

export const leadDetailRouter = express.Router();

const createLeadSchema = z.object({
  quotedPriceUsd: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
  quoteValidityDate: z.string().datetime().optional(),
  status: z.enum(["active", "won", "lost", "withdrawn"]).optional(),
  notes: z.string().optional(),
  contactPersonName: z.string().max(255).optional(),
  contactPersonEmail: z.string().email().optional(),
  contactPersonPhone: z.string().max(100).optional(),
  fileId: z.string().uuid().optional(),
});

const updateLeadSchema = createLeadSchema.partial();

leadDetailRouter.get("/:id", authenticate, validateUuid("id"), async (req, res) => {
  try {
    const { id } = req.params;

    const lead = await db.query.leads.findFirst({
      where: and(eq(leads.id, id), isNull(leads.deletedAt)),
      with: {
        project: true,
      },
    });

    if (!lead) {
      return res.status(404).json({ error: "Lead not found" });
    }

    let owner = null;
    if (lead.ownerUserId) {
      owner = await db.query.users.findFirst({
        where: eq(users.id, lead.ownerUserId),
        columns: {
          id: true,
          name: true,
          businessUnit: true,
          role: true,
        },
      });
    }

    res.json({
      lead: {
        ...lead,
        owner,
      },
    });
  } catch (err) {
    logError("GET /api/leads/:id error", err as Error, getRequestContext(req));
    res.status(500).json({ error: "Server error" });
  }
});

leadDetailRouter.get("/:id/files", authenticate, validateUuid("id"), async (req, res) => {
  try {
    const { id } = req.params;

    const lead = await db.query.leads.findFirst({
      where: and(eq(leads.id, id), isNull(leads.deletedAt)),
    });

    if (!lead) {
      return res.status(404).json({ error: "Lead not found" });
    }

    const leadFiles = await db
      .select({
        id: files.id,
        projectId: files.projectId,
        leadId: files.leadId,
        fileType: files.fileType,
        fileName: files.fileName,
        fileUrl: files.fileUrl,
        r2Key: files.r2Key,
        mimeType: files.mimeType,
        sizeBytes: files.sizeBytes,
        virusStatus: files.virusStatus,
        uploadedByUserId: files.uploadedByUserId,
        uploadedAt: files.uploadedAt,
        updatedAt: files.updatedAt,
        deletedAt: files.deletedAt,
        uploaderBusinessUnit: users.businessUnit,
      })
      .from(files)
      .leftJoin(users, eq(files.uploadedByUserId, users.id))
      .where(and(eq(files.leadId, id), isNull(files.deletedAt), eq(files.fileType, "quote")))
      .orderBy(desc(files.uploadedAt));

    res.json({ files: leadFiles });
  } catch (err) {
    logError("GET /api/leads/:id/files error", err as Error, getRequestContext(req));
    res.status(500).json({ error: "Server error" });
  }
});

leadDetailRouter.put("/:id", authenticate, validateUuid("id"), async (req, res) => {
  const context = getRequestContext(req);
  try {
    const { id } = req.params;
    const data = updateLeadSchema.parse(req.body);

    const existing = await db.query.leads.findFirst({
      where: and(eq(leads.id, id), isNull(leads.deletedAt)),
    });

    if (!existing) {
      logWarn("Lead update attempted on non-existent lead", { ...context, leadId: id });
      return res.status(404).json({ error: "Lead not found" });
    }

    if (req.user!.role !== "admin" && existing.ownerUserId !== req.user!.id) {
      logWarn("Unauthorized lead update attempt", { ...context, leadId: id, leadOwnerId: existing.ownerUserId });
      return res.status(403).json({ error: "Unauthorized" });
    }

    if (data.fileId) {
      const file = await db.query.files.findFirst({
        where: and(eq(files.id, data.fileId), isNull(files.deletedAt)),
      });
      if (!file || file.projectId !== existing.projectId) {
        logWarn("Lead update with invalid fileId", { ...context, leadId: id, fileId: data.fileId });
        return res.status(400).json({ error: "Invalid fileId" });
      }
    }

    const updated = await db
      .update(leads)
      .set({
        ...data,
        quotedPriceUsd: data.quotedPriceUsd ? data.quotedPriceUsd : null,
        quoteValidityDate: data.quoteValidityDate ? new Date(data.quoteValidityDate) : null,
        updatedAt: new Date(),
      })
      .where(eq(leads.id, id))
      .returning();

    if (data.fileId) {
      await db.update(files).set({ fileType: "quote", leadId: id }).where(eq(files.id, data.fileId));
    }

    logInfo("Lead updated successfully", {
      ...context,
      leadId: id,
      projectId: existing.projectId,
      status: data.status,
    });

    res.json({ lead: updated[0] });
  } catch (err) {
    if (err instanceof ZodError) {
      logWarn("Lead update failed - invalid input", { ...context, leadId: req.params.id, errors: (err as ZodError).errors });
      return res.status(400).json({ error: "Invalid input", details: (err as ZodError).errors });
    }
    logError("Lead update error", err as Error, { ...context, leadId: req.params.id });
    res.status(500).json({ error: "Server error" });
  }
});

leadDetailRouter.delete("/:id", authenticate, validateUuid("id"), async (req, res) => {
  const context = getRequestContext(req);
  try {
    const { id } = req.params;

    const existing = await db.query.leads.findFirst({
      where: and(eq(leads.id, id), isNull(leads.deletedAt)),
    });

    if (!existing) {
      logWarn("Lead delete attempted on non-existent lead", { ...context, leadId: id });
      return res.status(404).json({ error: "Lead not found" });
    }

    if (req.user!.role !== "admin" && existing.ownerUserId !== req.user!.id) {
      logWarn("Unauthorized lead delete attempt", { ...context, leadId: id, leadOwnerId: existing.ownerUserId });
      return res.status(403).json({ error: "Unauthorized" });
    }

    await db.update(leads).set({ deletedAt: new Date() }).where(eq(leads.id, id));

    logInfo("Lead deleted successfully", {
      ...context,
      leadId: id,
      projectId: existing.projectId,
    });

    res.json({ message: "Lead deleted" });
  } catch (err) {
    logError("Lead delete error", err as Error, { ...context, leadId: req.params.id });
    res.status(500).json({ error: "Server error" });
  }
});
