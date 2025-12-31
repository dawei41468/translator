import express from "express";
import { and, desc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { db } from "../../../../packages/db/src/index.js";
import { auditLogs, leads, projects, users } from "../../../../packages/db/src/schema.js";
import { authenticate } from "../middleware/auth.js";
import { getRequestContext, logError } from "../logger.js";

export const dashboardRouter = express.Router();

function toIsoOrNull(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  return null;
}

function formatAction(action: string, targetType: "project" | "lead"): string {
  // Keep this simple and stable; frontend expects a short string.
  if (targetType === "project") {
    if (action === "PROJECT_CREATE") return "created project";
    if (action === "PROJECT_UPDATE") return "updated project";
    if (action === "PROJECT_DELETE") return "deleted project";
  }
  if (targetType === "lead") {
    if (action === "LEAD_CREATE") return "created lead";
    if (action === "LEAD_UPDATE") return "updated lead";
    if (action === "LEAD_DELETE") return "deleted lead";
    if (action === "LEAD_STATUS_UPDATE") return "updated lead";
  }
  return action;
}

function formatDerivedLeadAction(_leadId: string): string {
  return "submitted lead";
}

dashboardRouter.get("/", authenticate, async (req, res) => {
  const context = getRequestContext(req);
  try {
    // Metrics
    const myActiveLeadsRows = await db
      .select({ count: sql<number>`count(*)` })
      .from(leads)
      .where(and(eq(leads.ownerUserId, req.user!.id), isNull(leads.deletedAt), eq(leads.status, "active")));
    const myActiveLeads = Number(myActiveLeadsRows[0]?.count ?? 0);

    const allCompanyProjectsRows = await db
      .select({ count: sql<number>`count(*)` })
      .from(projects)
      .where(isNull(projects.deletedAt));
    const allCompanyProjects = Number(allCompanyProjectsRows[0]?.count ?? 0);

    // Legacy semantics:
    // Conflicts Today = projects that had any lead created today AND have leads from >1 BU overall
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const leadProjectsToday = await db.query.leads.findMany({
      columns: { projectId: true },
      where: and(isNull(leads.deletedAt), gte(leads.createdAt, startOfToday)),
    });

    const projectIdsToday = [...new Set(leadProjectsToday.map((l) => l.projectId))];

    let activeConflictsToday = 0;
    if (projectIdsToday.length > 0) {
      const buLeadsForProjects = await db.query.leads.findMany({
        columns: { projectId: true, ownerBusinessUnit: true },
        where: and(isNull(leads.deletedAt), inArray(leads.projectId, projectIdsToday)),
      });

      const buByProject = new Map<string, Set<string>>();
      for (const lead of buLeadsForProjects) {
        if (!buByProject.has(lead.projectId)) buByProject.set(lead.projectId, new Set());
        buByProject.get(lead.projectId)!.add(lead.ownerBusinessUnit);
      }

      for (const bus of buByProject.values()) {
        if (bus.size > 1) activeConflictsToday += 1;
      }
    }

    const endOfWeek = new Date();
    endOfWeek.setDate(endOfWeek.getDate() + 7);

    const quotesExpiringRows = await db
      .select({ count: sql<number>`count(*)` })
      .from(leads)
      .where(
        and(
          eq(leads.ownerUserId, req.user!.id),
          isNull(leads.deletedAt),
          eq(leads.status, "active"),
          gte(leads.quoteValidityDate, new Date()),
          lte(leads.quoteValidityDate, endOfWeek)
        )
      );
    const quotesExpiringThisWeek = Number(quotesExpiringRows[0]?.count ?? 0);

    // Recent activity: prefer audit logs, but fall back to derived activity if audit logs are sparse.
    let recentActivity: Array<{
      id: string;
      type: "project" | "lead";
      action: string;
      createdAt: string | null;
      user: { id: string | null; name: string; businessUnit: string };
      project: { id: string; projectName: string };
    }> = [];

    const auditRows = await db
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        userId: auditLogs.userId,
        userBusinessUnit: auditLogs.userBusinessUnit,
        targetType: auditLogs.targetType,
        targetId: auditLogs.targetId,
        createdAt: auditLogs.createdAt,
      })
      .from(auditLogs)
      .where(inArray(auditLogs.targetType, ["project", "lead"]))
      .orderBy(desc(auditLogs.createdAt))
      .limit(25);

    if (auditRows.length > 0) {
      const userIds = [...new Set(auditRows.map((r) => r.userId).filter((v): v is string => typeof v === "string"))];
      const projectTargetIds = [...new Set(
        auditRows
          .filter((r) => r.targetType === "project" && typeof r.targetId === "string")
          .map((r) => r.targetId as string)
      )];
      const leadTargetIds = [...new Set(
        auditRows
          .filter((r) => r.targetType === "lead" && typeof r.targetId === "string")
          .map((r) => r.targetId as string)
      )];

      const userRows = userIds.length
        ? await db.query.users.findMany({
            columns: { id: true, name: true, businessUnit: true },
            where: inArray(users.id, userIds),
          })
        : [];
      const userById = new Map(userRows.map((u) => [u.id, u]));

      const leadRows = leadTargetIds.length
        ? await db.query.leads.findMany({
            columns: { id: true, projectId: true },
            where: inArray(leads.id, leadTargetIds),
          })
        : [];
      const projectIdsFromLeads = leadRows.map((l) => l.projectId);
      const leadProjectByLeadId = new Map(leadRows.map((l) => [l.id, l.projectId]));

      const projectIdsToFetch = [...new Set([...projectTargetIds, ...projectIdsFromLeads])];
      const projectRows = projectIdsToFetch.length
        ? await db.query.projects.findMany({
            columns: { id: true, projectName: true },
            where: inArray(projects.id, projectIdsToFetch),
          })
        : [];
      const projectById = new Map(projectRows.map((p) => [p.id, p]));

      recentActivity = auditRows
        .map((r) => {
          const targetType = r.targetType === "lead" ? "lead" : "project";

          const activityUser = r.userId ? userById.get(r.userId) : null;
          const userName = activityUser?.name ?? "System";
          const userBusinessUnit = activityUser?.businessUnit ?? r.userBusinessUnit ?? "Unknown";

          let projectId: string | null = null;
          if (targetType === "project" && typeof r.targetId === "string") {
            projectId = r.targetId;
          } else if (targetType === "lead" && typeof r.targetId === "string") {
            projectId = leadProjectByLeadId.get(r.targetId) ?? null;
          }

          if (!projectId) return null;
          const project = projectById.get(projectId);
          if (!project) return null;

          return {
            id: r.id,
            type: targetType as "project" | "lead",
            action: formatAction(r.action, targetType as "project" | "lead"),
            createdAt: toIsoOrNull(r.createdAt),
            user: {
              id: r.userId ?? null,
              name: userName,
              businessUnit: userBusinessUnit,
            },
            project: {
              id: project.id,
              projectName: project.projectName,
            },
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null)
        .slice(0, 15);
    }

    if (recentActivity.length < 6) {
      const [recentProjects, recentLeads] = await Promise.all([
        db.query.projects.findMany({
          columns: { id: true, projectName: true, createdByUserId: true, createdAt: true },
          where: isNull(projects.deletedAt),
          orderBy: desc(projects.createdAt),
          limit: 10,
        }),
        db.query.leads.findMany({
          columns: { id: true, projectId: true, ownerUserId: true, ownerBusinessUnit: true, createdAt: true },
          where: isNull(leads.deletedAt),
          orderBy: desc(leads.createdAt),
          limit: 10,
        }),
      ]);

      const derivedUserIds = new Set<string>();
      for (const p of recentProjects) {
        if (p.createdByUserId) derivedUserIds.add(p.createdByUserId);
      }
      for (const l of recentLeads) {
        derivedUserIds.add(l.ownerUserId);
      }

      const derivedUsers = derivedUserIds.size
        ? await db.query.users.findMany({
            columns: { id: true, name: true, businessUnit: true },
            where: inArray(users.id, Array.from(derivedUserIds)),
          })
        : [];
      const derivedUserById = new Map(derivedUsers.map((u) => [u.id, u] as const));

      const derivedProjectIds = new Set<string>();
      for (const p of recentProjects) derivedProjectIds.add(p.id);
      for (const l of recentLeads) derivedProjectIds.add(l.projectId);

      const derivedProjects = derivedProjectIds.size
        ? await db.query.projects.findMany({
            columns: { id: true, projectName: true },
            where: and(isNull(projects.deletedAt), inArray(projects.id, Array.from(derivedProjectIds))),
          })
        : [];
      const derivedProjectById = new Map(derivedProjects.map((p) => [p.id, p] as const));

      const derivedActivity = [
        ...recentProjects.map((p) => {
          const u = p.createdByUserId ? derivedUserById.get(p.createdByUserId) : undefined;
          return {
            id: `project:${p.id}`,
            type: "project" as const,
            action: "created project",
            createdAt: p.createdAt,
            user: u
              ? { id: u.id, name: u.name, businessUnit: u.businessUnit }
              : { id: null, name: "Unknown", businessUnit: "Unknown" },
            project: { id: p.id, projectName: p.projectName },
          };
        }),
        ...recentLeads.map((l) => {
          const u = derivedUserById.get(l.ownerUserId);
          const p = derivedProjectById.get(l.projectId);
          return {
            id: `lead:${l.id}`,
            type: "lead" as const,
            action: formatDerivedLeadAction(l.id),
            createdAt: l.createdAt,
            user: u
              ? { id: u.id, name: u.name, businessUnit: u.businessUnit }
              : { id: null, name: "Unknown", businessUnit: l.ownerBusinessUnit },
            project: {
              id: l.projectId,
              projectName: p?.projectName ?? "",
            },
          };
        }),
      ]
        .sort((a, b) => (b.createdAt?.getTime?.() ?? 0) - (a.createdAt?.getTime?.() ?? 0))
        .slice(0, 10)
        .map((a) => ({
          ...a,
          createdAt: a.createdAt ? a.createdAt.toISOString() : null,
        }));

      const merged = [...recentActivity, ...derivedActivity]
        .filter((x) => x.project?.id)
        .reduce((acc, item) => {
          if (!acc.some((a) => a.id === item.id)) acc.push(item);
          return acc;
        }, [] as typeof recentActivity)
        .sort((a, b) => (b.createdAt ? new Date(b.createdAt).getTime() : 0) - (a.createdAt ? new Date(a.createdAt).getTime() : 0))
        .slice(0, 15);

      recentActivity = merged;
    }

    return res.json({
      dashboard: {
        metrics: {
          myActiveLeads,
          allCompanyProjects,
          activeConflictsToday,
          quotesExpiringThisWeek,
        },
        recentActivity,
      },
    });
  } catch (err) {
    logError("GET /api/dashboard error", err as Error, context);
    return res.status(500).json({ error: "Server error" });
  }
});
