import { db } from "../../../../packages/db/src/index.js";
import { auditLogs } from "../../../../packages/db/src/schema.js";
import { logError } from "../logger.js";

export interface AuditLogData {
    userId?: string | null;
    userBusinessUnit?: string | null;
    userRole?: string | null;
    action: string;
    targetType?: 'user' | 'project' | 'lead' | 'file' | null;
    targetId?: string | null;
    targetBusinessUnit?: string | null;
    previousValues?: Record<string, any> | null;
    newValues?: Record<string, any> | null;
    ipAddress?: string | null;
    userAgent?: string | null | unknown;
    endpoint?: string | null;
    metadata: Record<string, any>;
    severity?: 'info' | 'warning' | 'positive';
    groupProfitImpact?: number | null;
    coordinationScore?: number | null;
}

export async function createAuditLog(data: AuditLogData): Promise<void> {
    try {
        await db.insert(auditLogs).values({
            userId: data.userId || null,
            userBusinessUnit: data.userBusinessUnit || null,
            userRole: data.userRole || null,
            action: data.action,
            targetType: data.targetType || null,
            targetId: data.targetId || null,
            targetBusinessUnit: data.targetBusinessUnit || null,
            previousValues: data.previousValues || null,
            newValues: data.newValues || null,
            ipAddress: data.ipAddress || null,
            userAgent: data.userAgent as any || null,
            endpoint: data.endpoint || null,
            metadata: data.metadata,
            severity: data.severity || 'info',
            groupProfitImpact: data.groupProfitImpact ? String(data.groupProfitImpact) : null,
            coordinationScore: data.coordinationScore ? String(data.coordinationScore) : null,
        } as any);
    } catch (error) {
        // Log audit logging errors but don't fail the main operation
        logError("Failed to create audit log", error as Error, { auditData: data });
    }
}
