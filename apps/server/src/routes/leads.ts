import express from "express";
import { z } from "zod";
import { db } from "../../../../packages/db/src/index.js";
import { files, leads, projects } from "../../../../packages/db/src/schema.js";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { authenticate } from "../middleware/auth.js";
import { sanitizeInput } from "../middleware/sanitizeInput.js";
import { validateQuery } from "../middleware/validateQuery.js";
import { getRequestContext, logError, logInfo } from "../logger.js";
import { createAuditLog } from "../utils/audit.js";
import { buildLeadsWhereConditions } from "../utils/leadsFilters.js";

export const leadsRouter = express.Router();

const leadsQuerySchema = z.object({
  limit: z.string().regex(/^\d+$/).optional().default("20"),
  offset: z.string().regex(/^\d+$/).optional().default("0"),
  filter: z.string().optional(),
  search: z.string().optional(),
  bu: z.string().optional(),
  status: z.string().optional(),
});

leadsRouter.get("/", authenticate, validateQuery(leadsQuerySchema), sanitizeInput, async (req, res) => {
  try {
    const query = leadsQuerySchema.parse(req.query);
    const limit = z.number().min(1).max(100).parse(parseInt(query.limit));
    const offset = z.number().min(0).parse(parseInt(query.offset));
    const filterStr = query.filter;
    const searchStr = query.search;
    const buStr = query.bu;
    const statusStr = query.status;

    const whereConditions = buildLeadsWhereConditions({
      user: req.user!,
      filterStr,
      searchStr,
      buStr,
      statusStr,
    });

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
        projectName: projects.projectName,
        endClient: projects.endClient,
      })
      .from(leads)
      .leftJoin(files, and(eq(files.leadId, leads.id), isNull(files.deletedAt), eq(files.fileType, "quote")))
      .leftJoin(projects, eq(leads.projectId, projects.id))
      .where(and(...whereConditions))
      .groupBy(leads.id, projects.id)
      .orderBy(desc(leads.createdAt))
      .limit(limit)
      .offset(offset);

    const totalCountResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(leads)
      .where(and(...whereConditions));
    const totalCount = Number(totalCountResult[0]?.count || 0);

    const leadList = leadsWithFileCounts.map((l) => ({
      ...l,
      businessUnit: l.ownerBusinessUnit,
      fileCount: Number(l.fileCount),
      project: l.projectName
        ? {
            id: l.projectId,
            projectName: l.projectName,
            endClient: l.endClient,
          }
        : undefined,
    }));

    res.json({
      leads: leadList,
      pagination: {
        total: totalCount,
        limit,
        offset,
      },
    });
  } catch (err) {
    logError("GET /api/leads error", err as Error, getRequestContext(req));
    res.status(500).json({ error: "Server error" });
  }
});

leadsRouter.get("/export", authenticate, validateQuery(leadsQuerySchema), sanitizeInput, async (req, res) => {
  try {
    const query = leadsQuerySchema.parse(req.query);
    const filterStr = query.filter;
    const searchStr = query.search;
    const buStr = query.bu;
    const statusStr = query.status;

    const whereConditions = buildLeadsWhereConditions({
      user: req.user!,
      filterStr,
      searchStr,
      buStr,
      statusStr,
    });

    const leadsData = await db
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
        projectName: projects.projectName,
        endClient: projects.endClient,
      })
      .from(leads)
      .leftJoin(projects, eq(leads.projectId, projects.id))
      .where(and(...whereConditions))
      .orderBy(desc(leads.createdAt));

    const csvHeaders = [
      "Project Name",
      "End Client",
      "Quoted Price (USD)",
      "Quote Validity Date",
      "Status",
      "Business Unit",
      "Contact Person Name",
      "Contact Person Email",
      "Contact Person Phone",
      "Notes",
      "Created Date",
      "Last Updated",
    ];

    const csvRows = leadsData.map((lead) => [
      lead.projectName || "",
      lead.endClient || "",
      lead.quotedPriceUsd || "",
      lead.quoteValidityDate ? new Date(lead.quoteValidityDate).toISOString().split("T")[0] : "",
      lead.status || "",
      lead.ownerBusinessUnit || "",
      lead.contactPersonName || "",
      lead.contactPersonEmail || "",
      lead.contactPersonPhone || "",
      lead.notes || "",
      lead.createdAt ? new Date(lead.createdAt).toISOString().split("T")[0] : "",
      lead.updatedAt ? new Date(lead.updatedAt).toISOString().split("T")[0] : "",
    ]);

    const escapeCsvValue = (value: string) => {
      if (value.includes(",") || value.includes('"') || value.includes("\n")) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return value;
    };

    const csvContent = [csvHeaders.join(","), ...csvRows.map((row) => row.map(escapeCsvValue).join(","))].join("\n");

    const timestamp = new Date().toISOString().split("T")[0];
    const filename = `leads-export-${timestamp}.csv`;

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename=\"${filename}\"`);
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");

    await createAuditLog({
      userId: req.user!.id,
      userBusinessUnit: req.user!.businessUnit,
      userRole: req.user!.role,
      action: "LEADS_CSV_EXPORT",
      ipAddress: getRequestContext(req).ip,
      userAgent: getRequestContext(req).userAgent,
      endpoint: req.path,
      metadata: {
        recordCount: leadsData.length,
        filters: {
          search: searchStr,
          businessUnit: buStr,
          status: statusStr,
          filter: filterStr,
        },
      },
    });

    logInfo("Leads CSV export completed", {
      ...getRequestContext(req),
      recordCount: leadsData.length,
      filename,
    });

    res.send(csvContent);
  } catch (err) {
    logError("GET /api/leads/export error", err as Error, getRequestContext(req));
    res.status(500).json({ error: "Server error" });
  }
});
