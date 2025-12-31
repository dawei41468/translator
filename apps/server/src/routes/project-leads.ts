import express from "express";
import { z, ZodError } from "zod";
import { db } from "../../../../packages/db/src/index.js";
import { files, leads, projects } from "../../../../packages/db/src/schema.js";
import { and, desc, eq, isNull, ne, sql } from "drizzle-orm";
import { authenticate } from "../middleware/auth.js";
import { sanitizeInput } from "../middleware/sanitizeInput.js";
import { getRequestContext, logError, logInfo, logWarn } from "../logger.js";
import { createAuditLog } from "../utils/audit.js";
import {
  createConflictNotifications,
  createNewLeadNotifications,
  createQuoteExpiringNotification,
  sendConflictEmail,
} from "../notifications.js";

export const projectLeadsRouter = express.Router({ mergeParams: true });

const querySchema = z.object({
  limit: z.string().regex(/^\d+$/).optional().default("10"),
  offset: z.string().regex(/^\d+$/).optional().default("0"),
  search: z.string().optional(),
  businessUnit: z.string().optional(),
  status: z.string().optional(),
});

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

// GET /api/projects/:projectId/leads - List leads for a project
projectLeadsRouter.get("/leads", authenticate, sanitizeInput, async (req, res) => {
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

    const leadsWithFileCounts = await db
      .select({
        id: leads.id,
        projectId: leads.projectId,
        ownerUserId: leads.ownerUserId,
        ownerBusinessUnit: leads.ownerBusinessUnit,
        quotedPriceUsd: leads.quotedPriceUsd,
        quoteValidityDate: leads.quoteValidityDate,
        status: leads.status,
        notes: leads.notes,
        contactPersonName: leads.contactPersonName,
        contactPersonEmail: leads.contactPersonEmail,
        contactPersonPhone: leads.contactPersonPhone,
        createdAt: leads.createdAt,
        updatedAt: leads.updatedAt,
        deletedAt: leads.deletedAt,
        fileCount: sql<number>`count(${files.id})`,
      })
      .from(leads)
      .leftJoin(files, and(eq(files.leadId, leads.id), isNull(files.deletedAt), eq(files.fileType, "quote")))
      .where(and(eq(leads.projectId, projectId), isNull(leads.deletedAt)))
      .groupBy(leads.id)
      .orderBy(desc(leads.createdAt))
      .limit(limit)
      .offset(offset);

    res.json({
      leads: leadsWithFileCounts.map((l) => ({
        ...l,
        businessUnit: l.ownerBusinessUnit,
        fileCount: Number(l.fileCount),
      })),
    });
  } catch (err) {
    if (err instanceof ZodError) {
      return res.status(400).json({ error: "Invalid query parameters", details: (err as ZodError).errors });
    }
    logError("GET /api/projects/:projectId/leads error", err as Error, getRequestContext(req));
    res.status(500).json({ error: "Server error" });
  }
});

// GET /api/projects/:projectId/conflicts - Conflicting leads from other business units
projectLeadsRouter.get("/conflicts", authenticate, async (req, res) => {
  const context = getRequestContext(req);
  try {
    const { projectId } = req.params;
    const { newPrice } = req.query;

    const project = await db.query.projects.findFirst({
      where: and(eq(projects.id, projectId), isNull(projects.deletedAt)),
    });

    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    const whereParts = [eq(leads.projectId, projectId), isNull(leads.deletedAt)];
    if (req.user!.role !== "admin") {
      whereParts.push(ne(leads.ownerBusinessUnit, req.user!.businessUnit));
    }

    const otherLeads = await db.query.leads.findMany({
      where: and(...whereParts),
      orderBy: desc(leads.createdAt),
    });

    const parsedNewPrice = typeof newPrice === "string" && newPrice.length > 0 ? parseFloat(newPrice) : null;

    const conflicts = otherLeads.map((lead) => {
      const quoted = lead.quotedPriceUsd ? parseFloat(lead.quotedPriceUsd) : null;
      const isLowerPrice = parsedNewPrice !== null && quoted !== null ? quoted < parsedNewPrice : false;
      return {
        id: lead.id,
        quotedPriceUsd: lead.quotedPriceUsd,
        quoteValidityDate: lead.quoteValidityDate,
        businessUnit: lead.ownerBusinessUnit,
        contactPersonName: lead.contactPersonName,
        contactPersonEmail: lead.contactPersonEmail,
        contactPersonPhone: lead.contactPersonPhone,
        isLowerPrice,
        createdAt: lead.createdAt,
      };
    });

    logInfo("Conflicts fetched", { ...context, projectId, conflictCount: conflicts.length });
    res.json({ conflicts });
  } catch (err) {
    logError("Conflicts fetch error", err as Error, { ...context, projectId: req.params.projectId });
    res.status(500).json({ error: "Server error" });
  }
});

// POST /api/projects/:projectId/leads - Create a lead
projectLeadsRouter.post("/leads", authenticate, async (req, res) => {
  const context = getRequestContext(req);
  try {
    const { projectId } = req.params;
    const data = createLeadSchema.parse(req.body);

    const project = await db.query.projects.findFirst({
      where: and(eq(projects.id, projectId), isNull(projects.deletedAt)),
    });

    if (!project) {
      logWarn("Lead creation attempted for non-existent project", { ...context, projectId });
      return res.status(404).json({ error: "Project not found" });
    }

    if (data.fileId) {
      const file = await db.query.files.findFirst({
        where: and(eq(files.id, data.fileId), isNull(files.deletedAt)),
      });
      if (!file || file.projectId !== projectId) {
        logWarn("Lead creation with invalid fileId", { ...context, projectId, fileId: data.fileId });
        return res.status(400).json({ error: "Invalid fileId" });
      }
    }

    const newLead = await db
      .insert(leads)
      .values({
        ...data,
        projectId,
        ownerUserId: req.user!.id,
        ownerBusinessUnit: req.user!.businessUnit,
        quotedPriceUsd: data.quotedPriceUsd ? data.quotedPriceUsd : null,
        quoteValidityDate: data.quoteValidityDate ? new Date(data.quoteValidityDate) : null,
      })
      .returning();

    const created = newLead[0];

    if (data.fileId) {
      await db.update(files).set({ fileType: "quote", leadId: created.id }).where(eq(files.id, data.fileId));
    }

    const conflictWhere = [eq(leads.projectId, projectId), isNull(leads.deletedAt)];
    if (req.user!.role !== "admin") {
      conflictWhere.push(ne(leads.ownerBusinessUnit, req.user!.businessUnit));
    }

    const conflictingLeads = await db.query.leads.findMany({
      where: and(...conflictWhere),
      orderBy: desc(leads.createdAt),
    });

    const conflictCount = conflictingLeads.length;
    const hasLowerPrice = conflictingLeads.some((lead) =>
      lead.quotedPriceUsd && data.quotedPriceUsd
        ? parseFloat(lead.quotedPriceUsd) < parseFloat(data.quotedPriceUsd)
        : false
    );

    logInfo("Lead created successfully", {
      ...context,
      leadId: created.id,
      projectId,
      status: data.status,
      conflictCount,
      hasLowerPrice,
    });

    await createAuditLog({
      userId: req.user!.id,
      userBusinessUnit: req.user!.businessUnit,
      userRole: req.user!.role,
      action: "LEAD_CREATE",
      targetType: "lead",
      targetId: created.id,
      targetBusinessUnit: req.user!.businessUnit,
      ipAddress: getRequestContext(req).ip,
      userAgent: typeof getRequestContext(req).userAgent === "string" ? getRequestContext(req).userAgent : undefined,
      endpoint: req.path,
      metadata: {
        projectId,
        quotedPriceUsd: data.quotedPriceUsd,
        quoteValidityDate: data.quoteValidityDate,
        status: data.status,
        notes: data.notes,
        contactPersonName: data.contactPersonName,
        contactPersonEmail: data.contactPersonEmail,
        contactPersonPhone: data.contactPersonPhone,
        fileId: data.fileId,
        conflictCount,
        hasLowerPrice,
      },
      newValues: {
        quotedPriceUsd: data.quotedPriceUsd,
        quoteValidityDate: data.quoteValidityDate,
        status: data.status,
        notes: data.notes,
        contactPersonName: data.contactPersonName,
        contactPersonEmail: data.contactPersonEmail,
        contactPersonPhone: data.contactPersonPhone,
      },
    });

    if (conflictCount > 0) {
      logWarn("Lead created with conflicts detected", {
        ...context,
        leadId: created.id,
        projectId,
        conflictCount,
        hasLowerPrice,
        conflictingBusinessUnits: conflictingLeads.map((l) => l.ownerBusinessUnit),
      });

      if (hasLowerPrice) {
        await createAuditLog({
          userId: req.user!.id,
          userBusinessUnit: req.user!.businessUnit,
          userRole: req.user!.role,
          action: "UNDERCUTTING_DETECTED",
          targetType: "lead",
          targetId: created.id,
          targetBusinessUnit: req.user!.businessUnit,
          ipAddress: getRequestContext(req).ip,
          userAgent: getRequestContext(req).userAgent,
          endpoint: req.path,
          metadata: {
            projectId,
            leadId: created.id,
            quotedPriceUsd: data.quotedPriceUsd,
            conflictCount,
            conflictingBusinessUnits: conflictingLeads.map((l) => l.ownerBusinessUnit),
            undercutPrices: conflictingLeads.map((l) => ({
              businessUnit: l.ownerBusinessUnit,
              price: l.quotedPriceUsd,
            })),
          },
          severity: "warning",
        });
      }

      await createConflictNotifications(projectId, project.projectName, conflictCount);
      await sendConflictEmail(projectId, conflictingLeads);
    }

    res.status(201).json({
      lead: {
        ...created,
        businessUnit: created.ownerBusinessUnit,
      },
    });

    void createNewLeadNotifications(projectId, project.projectName, req.user!.id).catch((err) => {
      logError("New lead notifications error", err as Error, { ...context, projectId, leadId: created.id });
    });

    if (created.quoteValidityDate) {
      const validity = new Date(created.quoteValidityDate);
      const nowDate = new Date();
      const diffDays = Math.floor((validity.getTime() - nowDate.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays >= 0 && diffDays <= 7) {
        void createQuoteExpiringNotification(projectId, project.projectName, created.ownerUserId, validity).catch((err) => {
          logError("Quote expiring notification error", err as Error, { ...context, projectId, leadId: created.id });
        });
      }
    }
  } catch (err) {
    if (err instanceof ZodError) {
      logWarn("Lead creation failed - invalid input", {
        ...context,
        projectId: req.params.projectId,
        errors: (err as ZodError).errors,
      });
      return res.status(400).json({ error: "Invalid input", details: (err as ZodError).errors });
    }
    logError("Lead creation error", err as Error, { ...context, projectId: req.params.projectId });
    res.status(500).json({ error: "Server error" });
  }
});
