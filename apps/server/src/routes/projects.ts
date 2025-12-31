import express from "express";
import rateLimit from "express-rate-limit";
import { ipKeyGenerator } from "express-rate-limit";
import { z, ZodError } from "zod";
import { eq, and, like, ilike, isNull, desc, sql, inArray, gte, lte } from "drizzle-orm";
import { db } from "../../../../packages/db/src/index.js";
import { projects, leads, users, files } from "../../../../packages/db/src/schema.js";
import { checkFuzzyDuplicates } from "../fuzzy.js";
import { logInfo, logWarn, logError, getRequestContext } from "../logger.js";
import { createAuditLog } from "../utils/audit.js";
import { authenticate } from "../middleware/auth.js";
import { validateQuery } from "../middleware/validateQuery.js";
import { sanitizeInput } from "../middleware/sanitizeInput.js";
import { validateUuid } from "../middleware/validateUuid.js";

const router = express.Router();

const createProjectSchema = z.object({
  projectName: z.string().min(1).max(500),
  endClient: z.string().max(500).optional(),
  tenderNumber: z.string().max(255).optional(),
  estimatedValueUsd: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
  location: z.string().max(255).optional(),
  description: z.string().optional(),
  forceCreate: z.boolean().optional().default(false),
});

const updateProjectSchema = createProjectSchema.partial().extend({
  forceCreate: z.boolean().optional().default(false),
});

const projectDuplicateSearchSchema = z.object({
  projectName: z.string().min(1).max(500),
  endClient: z.string().max(500).optional(),
  tenderNumber: z.string().max(255).optional(),
  excludeProjectId: z.string().uuid().optional(),
});

const projectsQuerySchema = z.object({
  limit: z.string().regex(/^\d+$/).optional().default("20"),
  offset: z.string().regex(/^\d+$/).optional().default("0"),
  search: z.string().optional(),
  businessUnit: z.string().optional(),
  status: z.string().optional(),
});


// GET /api/projects - List projects with filtering and pagination
router.get("/", authenticate, validateQuery(projectsQuerySchema), sanitizeInput, async (req, res) => {
  try {
    const query = req.query as z.infer<typeof projectsQuerySchema>;
    const limit = z.number().min(1).max(100).parse(parseInt(query.limit));
    const offset = z.number().min(0).parse(parseInt(query.offset));

    let whereConditions = [isNull(projects.deletedAt)];

    // Search filter - Fixed SQL injection vulnerability
    if (query.search) {
      whereConditions.push(ilike(projects.projectName, sql`%${query.search}%`));

      // Audit log: Search query
      await createAuditLog({
        userId: req.user!.id,
        userBusinessUnit: req.user!.businessUnit,
        userRole: req.user!.role,
        action: 'SEARCH_PROJECTS',
        ipAddress: getRequestContext(req).ip,
        userAgent: getRequestContext(req).userAgent,
        endpoint: req.path,
        metadata: {
          searchTerm: query.search,
          businessUnit: query.businessUnit,
          status: query.status,
          limit: query.limit,
          offset: query.offset,
        },
      });
    }

    // Filter projects to those that have leads from a given business unit
    if (query.businessUnit) {
      const buLeadRows = await db
        .selectDistinct({ projectId: leads.projectId })
        .from(leads)
        .where(and(isNull(leads.deletedAt), eq(leads.ownerBusinessUnit, query.businessUnit)));

      const projectIds = buLeadRows.map((r) => r.projectId);
      if (projectIds.length === 0) {
        return res.json({ projects: [] });
      }
      whereConditions.push(inArray(projects.id, projectIds));
    }

    // Filter to only projects with competing leads across business units
    // (used by /projects?filter=conflicts)
    if (query.status === "conflicts") {
      const conflictRows = await db
        .select({
          projectId: leads.projectId,
          buCount: sql<number>`count(distinct ${leads.ownerBusinessUnit})`,
        })
        .from(leads)
        .where(isNull(leads.deletedAt))
        .groupBy(leads.projectId)
        .having(sql`count(distinct ${leads.ownerBusinessUnit}) > 1`);

      const conflictProjectIds = conflictRows.map((r) => r.projectId);
      if (conflictProjectIds.length === 0) {
        return res.json({ projects: [] });
      }
      whereConditions.push(inArray(projects.id, conflictProjectIds));
    }

    // Get projects with aggregated lead data
    const projectsWithAggregates = await db
      .select({
        id: projects.id,
        projectName: projects.projectName,
        endClient: projects.endClient,
        tenderNumber: projects.tenderNumber,
        estimatedValueUsd: projects.estimatedValueUsd,
        location: projects.location,
        description: projects.description,
        createdByUserId: projects.createdByUserId,
        createdAt: projects.createdAt,
        updatedAt: projects.updatedAt,
        deletedAt: projects.deletedAt,
        leadCount: sql<number>`count(${leads.id})`,
        highestQuote: sql<number>`max(cast(${leads.quotedPriceUsd} as decimal))`,
        businessUnitCount: sql<number>`count(distinct ${leads.ownerBusinessUnit})`,
      })
      .from(projects)
      .leftJoin(leads, and(eq(projects.id, leads.projectId), isNull(leads.deletedAt)))
      .where(and(...whereConditions))
      .groupBy(projects.id)
      .orderBy(desc(projects.createdAt))
      .limit(limit)
      .offset(offset);

    // Convert aggregated data to expected format
    const projectList = projectsWithAggregates.map(project => ({
      ...project,
      leadCount: Number(project.leadCount),
      highestQuote: project.highestQuote ? Number(project.highestQuote) : null,
      hasConflicts: Number(project.businessUnitCount) > 1,
    }));

    // Get total count for pagination
    const totalCountResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(projects)
      .where(and(...whereConditions));
    const totalCount = Number(totalCountResult[0]?.count || 0);

    res.json({
      projects: projectList,
      pagination: {
        total: totalCount,
        limit,
        offset,
      }
    });
  } catch (err) {
    if (err instanceof ZodError) {
      return res.status(400).json({ error: "Invalid query parameters", details: (err as ZodError).errors });
    }
    logError("GET /api/projects error", err as Error, getRequestContext(req));
    res.status(500).json({ error: "Server error" });
  }
});

// POST /api/projects/duplicates
router.post("/duplicates", authenticate, async (req, res) => {
  const context = getRequestContext(req);
  try {
    const data = projectDuplicateSearchSchema.parse(req.body);
    const result = await checkFuzzyDuplicates(
      data.projectName,
      data.endClient,
      data.tenderNumber,
      req.user!.businessUnit,
      data.excludeProjectId
    );

    logInfo("Project duplicate search", {
      ...context,
      userId: req.user!.id,
      businessUnit: req.user!.businessUnit,
      duplicateCount: result.duplicates.length,
      hasExactDuplicate: result.hasExactDuplicate,
    });

    return res.json(result);
  } catch (err) {
    if (err instanceof ZodError) {
      return res.status(400).json({ error: "Invalid input", details: (err as ZodError).errors });
    }
    logError("Project duplicate search error", err as Error, context);
    return res.status(500).json({ error: "Server error" });
  }
});

// POST /api/projects - Create new project
router.post("/", authenticate, async (req, res) => {
  const context = getRequestContext(req);
  try {
    const data = createProjectSchema.parse(req.body);

    // Fuzzy deduplication check
    const { duplicates, hasExactDuplicate } = await checkFuzzyDuplicates(
      data.projectName,
      data.endClient,
      data.tenderNumber,
      req.user!.businessUnit
    );

    if (duplicates.length > 0 && !data.forceCreate) {
      logWarn("Project creation blocked due to potential duplicates", {
        ...context,
        projectName: data.projectName,
        endClient: data.endClient,
        tenderNumber: data.tenderNumber,
        duplicateCount: duplicates.length,
        hasExactDuplicate
      });
      return res.status(409).json({
        error: "Potential duplicate projects found",
        duplicates,
        hasExactDuplicate
      });
    }

    if (duplicates.length > 0 && data.forceCreate) {
      logInfo("Project created despite duplicates (forceCreate=true)", {
        ...context,
        projectName: data.projectName,
        endClient: data.endClient,
        tenderNumber: data.tenderNumber,
        duplicateCount: duplicates.length
      });
    }

    const newProject = await db.insert(projects).values({
      ...data,
      estimatedValueUsd: data.estimatedValueUsd ? data.estimatedValueUsd : null,
      createdByUserId: req.user!.id,
    }).returning();

    logInfo("Project created successfully", {
      ...context,
      projectId: newProject[0].id,
      projectName: data.projectName
    });

    // Audit log: Project creation
    await createAuditLog({
      userId: req.user!.id,
      userBusinessUnit: req.user!.businessUnit,
      userRole: req.user!.role,
      action: 'PROJECT_CREATE',
      targetType: 'project',
      targetId: newProject[0].id,
      ipAddress: getRequestContext(req).ip,
      userAgent: typeof getRequestContext(req).userAgent === 'string' ? getRequestContext(req).userAgent : undefined,
      endpoint: req.path,
      metadata: {
        projectName: data.projectName,
        endClient: data.endClient,
        tenderNumber: data.tenderNumber,
        estimatedValueUsd: data.estimatedValueUsd,
        forceCreate: data.forceCreate,
      },
      newValues: {
        projectName: data.projectName,
        endClient: data.endClient,
        tenderNumber: data.tenderNumber,
        estimatedValueUsd: data.estimatedValueUsd,
        location: data.location,
        description: data.description,
      },
    });

    res.status(201).json({ project: newProject[0] });
  } catch (err) {
    if (err instanceof ZodError) {
      logWarn("Project creation failed - invalid input", { ...context, errors: (err as ZodError).errors });
      return res.status(400).json({ error: "Invalid input", details: (err as ZodError).errors });
    }
    logError("Project creation error", err as Error, context);
    return res.status(500).json({ error: "Server error" });
  }
});

// GET /api/projects/:id - Get project details with leads and comments
router.get("/:id", authenticate, validateUuid("id"), async (req, res) => {
  try {
    const { id } = req.params;

    const project = await db.query.projects.findFirst({
      where: and(eq(projects.id, id), isNull(projects.deletedAt)),
      with: {
        leads: {
          where: isNull(leads.deletedAt),
        },
      },
    });

    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    // Get creator user information
    let creator = null;
    if (project.createdByUserId) {
      creator = await db.query.users.findFirst({
        where: eq(users.id, project.createdByUserId),
        columns: {
          id: true,
          name: true,
          businessUnit: true,
          role: true,
        },
      });
    }

    res.json({
      project: {
        ...project,
        creator,
      },
    });
  } catch (err) {
    logError("GET /api/projects/:id error", err as Error, getRequestContext(req));
    res.status(500).json({ error: "Server error" });
  }
});

// GET /api/projects/:projectId/files - Get files for a project
router.get("/:projectId/files", authenticate, async (req, res) => {
  try {
    const { projectId } = req.params;

    // Verify project exists
    const project = await db.query.projects.findFirst({
      where: and(eq(projects.id, projectId), isNull(projects.deletedAt)),
    });

    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    // Allow all authenticated users to view files (for preview/listing)
    // Download access will be restricted separately

    // Get files with uploader business units (only project files, exclude quote files)
    const projectFiles = await db
      .select({
        id: files.id,
        projectId: files.projectId,
        leadId: files.leadId,
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
      .where(and(
        eq(files.projectId, projectId),
        isNull(files.deletedAt),
        eq(files.fileType, 'project'),
        isNull(files.leadId)
      ))
      .orderBy(desc(files.uploadedAt));

    res.json({ files: projectFiles });
  } catch (err) {
    logError("GET /api/projects/:projectId/files error", err as Error, getRequestContext(req));
    res.status(500).json({ error: "Server error" });
  }
});

// PUT /api/projects/:id - Update project
router.put("/:id", authenticate, validateUuid("id"), async (req, res) => {
  const context = getRequestContext(req);
  try {
    const { id } = req.params;
    const data = updateProjectSchema.parse(req.body);

    const existing = await db.query.projects.findFirst({
      where: and(eq(projects.id, id), isNull(projects.deletedAt)),
    });

    if (!existing) {
      logWarn("Project update attempted on non-existent project", { ...context, projectId: id });
      return res.status(404).json({ error: "Project not found" });
    }

    // Write access: admin or project creator
    if (req.user!.role !== 'admin' && existing.createdByUserId !== req.user!.id) {
      logWarn("Unauthorized project update attempt", { ...context, projectId: id, projectOwnerId: existing.createdByUserId });
      return res.status(403).json({ error: "Unauthorized" });
    }

    // Check for duplicates if updating deduplication fields
    if (data.projectName !== undefined || data.endClient !== undefined || data.tenderNumber !== undefined) {
      const checkName = data.projectName ?? existing.projectName;
      const checkEndClient = data.endClient ?? existing.endClient;
      const checkTender = data.tenderNumber ?? existing.tenderNumber;

      const { duplicates, hasExactDuplicate } = await checkFuzzyDuplicates(
        checkName,
        checkEndClient,
        checkTender,
        req.user!.businessUnit,
        id
      );

      if (duplicates.length > 0 && !data.forceCreate) {
        logWarn("Project update blocked due to potential duplicates", {
          ...context,
          projectId: id,
          projectName: checkName,
          endClient: checkEndClient,
          tenderNumber: checkTender,
          duplicateCount: duplicates.length,
          hasExactDuplicate
        });
        return res.status(409).json({
          error: "Potential duplicate projects found",
          duplicates,
          hasExactDuplicate
        });
      }
    }

    const updated = await db.update(projects)
      .set({
        ...data,
        estimatedValueUsd: data.estimatedValueUsd ? data.estimatedValueUsd : null,
        updatedAt: new Date(),
      })
      .where(eq(projects.id, id))
      .returning();

    logInfo("Project updated successfully", {
      ...context,
      projectId: id,
      projectName: updated[0].projectName
    });

    res.json({ project: updated[0] });
  } catch (err) {
    if (err instanceof ZodError) {
      logWarn("Project update failed - invalid input", { ...context, projectId: req.params.id, errors: (err as ZodError).errors });
      return res.status(400).json({ error: "Invalid input", details: (err as ZodError).errors });
    }
    logError("Project update error", err as Error, { ...context, projectId: req.params.id });
    res.status(500).json({ error: "Server error" });
  }
});

// DELETE /api/projects/:id - Soft delete project
router.delete("/:id", authenticate, validateUuid("id"), async (req, res) => {
  const context = getRequestContext(req);
  try {
    const { id } = req.params;

    const existing = await db.query.projects.findFirst({
      where: and(eq(projects.id, id), isNull(projects.deletedAt)),
    });

    if (!existing) {
      logWarn("Project delete attempted on non-existent project", { ...context, projectId: id });
      return res.status(404).json({ error: "Project not found" });
    }

    // Write access: admin or project creator
    if (req.user!.role !== 'admin' && existing.createdByUserId !== req.user!.id) {
      logWarn("Unauthorized project delete attempt", { ...context, projectId: id, projectOwnerId: existing.createdByUserId });
      return res.status(403).json({ error: "Unauthorized" });
    }

    await db.update(projects)
      .set({ deletedAt: new Date() })
      .where(eq(projects.id, id));

    logInfo("Project deleted successfully", {
      ...context,
      projectId: id,
      projectName: existing.projectName
    });

    res.json({ message: "Project deleted" });
  } catch (err) {
    logError("Project delete error", err as Error, { ...context, projectId: req.params.id });
    res.status(500).json({ error: "Server error" });
  }
});

export { router as projectsRouter };