import express from "express";
import { db } from "../../../../packages/db/src/index.js";
import { businessUnits as businessUnitsTable, leads, users } from "../../../../packages/db/src/schema.js";
import { eq, isNull } from "drizzle-orm";

export const GROUP_BU_NAME = "Group";

export function isGroupBusinessUnitName(name: string) {
  return (name || "").trim().toLowerCase() === GROUP_BU_NAME.toLowerCase();
}

export function requireGroupAdmin(req: express.Request, res: express.Response) {
  if (req.user!.role !== "admin") {
    res.status(403).json({ error: "Admin access required" });
    return false;
  }
  if (!isGroupBusinessUnitName(req.user!.businessUnit)) {
    res.status(403).json({ error: "Group admin access required" });
    return false;
  }
  return true;
}

export async function ensureBusinessUnitsSeeded() {
  const existing = await db.query.businessUnits.findMany({
    columns: { id: true },
    limit: 1,
  });

  if (existing.length > 0) return;

  const [userRows, leadRows] = await Promise.all([
    db.query.users.findMany({ columns: { businessUnit: true } }),
    db.query.leads.findMany({ columns: { ownerBusinessUnit: true }, where: isNull(leads.deletedAt) }),
  ]);

  const names = new Set<string>();
  for (const u of userRows) names.add(u.businessUnit);
  for (const l of leadRows) names.add(l.ownerBusinessUnit);
  names.add(GROUP_BU_NAME);

  const values = Array.from(names)
    .filter((n) => typeof n === "string" && n.trim().length > 0)
    .map((name) => ({ name, isActive: true }));

  if (values.length === 0) return;

  await db.insert(businessUnitsTable).values(values).onConflictDoNothing({ target: businessUnitsTable.name });
}
