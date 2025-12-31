import { QueryClient } from "@tanstack/react-query";
import { logger } from "./logger";
import type {
  AdminUserDto,
  AuthUser,
  BusinessUnitDto,
  BusinessUnitUserDto,
  CommentDto,
  ConflictDto,
  DuplicateProjectDto,
  FileDto,
  LeadDetailDto,
  LeadDto,
  NotificationDto,
  PaginatedResponse,
  ProjectDetailDto,
  ProjectDto,
} from "./types";
import type { ApiError } from "./types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

function getErrorMessage(errorBody: unknown, fallback: string): string {
  if (typeof errorBody === "object" && errorBody !== null && "error" in errorBody) {
    const msg = (errorBody as { error?: unknown }).error;
    if (typeof msg === "string" && msg.trim().length > 0) return msg;
  }
  return fallback;
}

function parseValidationError(errorBody: unknown): { message: string; details?: any[] } | null {
  if (typeof errorBody === "object" && errorBody !== null) {
    const body = errorBody as any;
    if (body.error === "Invalid query parameters" && Array.isArray(body.details)) {
      return {
        message: "Invalid request parameters",
        details: body.details
      };
    }
  }
  return null;
}

class ApiClient {
  private baseURL: string;

  constructor(baseURL: string) {
    this.baseURL = baseURL;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseURL}${endpoint}`;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...options.headers as Record<string, string>,
    };

    const response = await fetch(url, {
      ...options,
      headers,
      credentials: "include",
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ error: "Network error" }));
      const err = new Error(getErrorMessage(errorBody, `HTTP ${response.status}`)) as ApiError;
      err.status = response.status;
      err.data = errorBody;
      throw err;
    }

    return response.json();
  }

  // Auth endpoints
  async login(data: { email: string; password: string }) {
    try {
      const result = await this.request<{ user: AuthUser }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify(data),
      });
      logger.userAction("login", { email: data.email, userId: result.user.id });
      return result;
    } catch (error) {
      logger.apiError("/api/auth/login", (error as Error).message, { email: data.email });
      throw error;
    }
  }

  async logout() {
    return this.request<{ message: string }>("/api/auth/logout", {
      method: "POST",
    });
  }

  async changePassword(data: { currentPassword: string; newPassword: string }) {
    return this.request<{ message: string }>("/api/auth/change-password", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async getMe() {
    return this.request<{ user: AuthUser | null }>("/api/me");
  }

  async updateLanguage(language: string) {
    return this.request<{ message: string }>("/api/me/language", {
      method: "PUT",
      body: JSON.stringify({ language }),
    });
  }

  async getEmailPreferences() {
    return this.request<{ enableConflictEmails: boolean; enableCommentEmails: boolean; enableQuoteExpiringEmails: boolean }>("/api/email/preferences");
  }

  async updateEmailPreferences(data: { enableConflictEmails?: boolean; enableCommentEmails?: boolean; enableQuoteExpiringEmails?: boolean }) {
    return this.request<{ message: string }>("/api/email/preferences", {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  // Project endpoints
  async getProjects(params?: { limit?: number; offset?: number; search?: string; businessUnit?: string; status?: string }) {
    const searchParams = new URLSearchParams();
    if (params?.limit) searchParams.set("limit", params.limit.toString());
    if (params?.offset) searchParams.set("offset", params.offset.toString());
    if (params?.search) searchParams.set("search", params.search);
    if (params?.businessUnit) searchParams.set("businessUnit", params.businessUnit);
    if (params?.status) searchParams.set("status", params.status);

    return this.request<PaginatedResponse<ProjectDto, 'projects'>>(`/api/projects?${searchParams}`);
  }

  async createProject(data: {
    projectName: string;
    endClient?: string;
    tenderNumber?: string;
    estimatedValueUsd?: string;
    location?: string;
    description?: string;
    forceCreate?: boolean;
  }) {
    try {
      const result = await this.request<{ project: ProjectDto }>("/api/projects", {
        method: "POST",
        body: JSON.stringify(data),
      });
      logger.userAction("create project", { projectId: result.project.id, projectName: data.projectName });
      return result;
    } catch (error) {
      logger.apiError("/api/projects", (error as Error).message, { projectName: data.projectName });
      throw error;
    }
  }

  async getProject(id: string) {
    return this.request<{ project: ProjectDetailDto }>(`/api/projects/${id}`);
  }

  async updateProject(id: string, data: {
    projectName?: string;
    endClient?: string;
    tenderNumber?: string;
    estimatedValueUsd?: string;
    location?: string;
    description?: string;
    forceCreate?: boolean;
  }) {
    return this.request<{ project: ProjectDto }>(`/api/projects/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async deleteProject(id: string) {
    return this.request<{ message: string }>(`/api/projects/${id}`, {
      method: "DELETE",
    });
  }

  async searchProjectDuplicates(data: {
    projectName: string;
    endClient?: string;
    tenderNumber?: string;
    excludeProjectId?: string;
  }) {
    return this.request<{ duplicates: DuplicateProjectDto[]; hasExactDuplicate: boolean }>("/api/projects/duplicates", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  // Lead endpoints
  async getProjectLeads(projectId: string, params?: { limit?: number; offset?: number }) {
    const searchParams = new URLSearchParams();
    if (params?.limit) searchParams.set("limit", params.limit.toString());
    if (params?.offset) searchParams.set("offset", params.offset.toString());

    return this.request<{ leads: LeadDto[] }>(`/api/projects/${projectId}/leads?${searchParams}`);
  }

  async createLead(projectId: string, data: {
    quotedPriceUsd?: string;
    quoteValidityDate?: string;
    status?: string;
    notes?: string;
    contactPersonName?: string;
    contactPersonEmail?: string;
    contactPersonPhone?: string;
    fileId?: string;
  }) {
    try {
      const result = await this.request<{ lead: LeadDto }>(`/api/projects/${projectId}/leads`, {
        method: "POST",
        body: JSON.stringify(data),
      });
      logger.userAction("create lead", { leadId: result.lead.id, projectId, status: data.status });
      return result;
    } catch (error) {
      logger.apiError(`/api/projects/${projectId}/leads`, (error as Error).message, { projectId, status: data.status });
      throw error;
    }
  }

  async getLead(id: string) {
    return this.request<{ lead: LeadDetailDto }>(`/api/leads/${id}`);
  }

  async updateLead(id: string, data: {
    quotedPriceUsd?: string;
    quoteValidityDate?: string;
    status?: string;
    notes?: string;
    contactPersonName?: string;
    contactPersonEmail?: string;
    contactPersonPhone?: string;
    fileId?: string;
  }) {
    return this.request<{ lead: LeadDto }>(`/api/leads/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async getUserLeads(params?: {
    limit?: number;
    offset?: number;
    filter?: string;
    search?: string;
    bu?: string;
    status?: string;
  }) {
    const searchParams = new URLSearchParams();
    if (params?.limit) searchParams.set("limit", params.limit.toString());
    if (params?.offset) searchParams.set("offset", params.offset.toString());
    if (params?.filter) searchParams.set("filter", params.filter);
    if (params?.search) searchParams.set("search", params.search);
    if (params?.bu) searchParams.set("bu", params.bu);
    if (params?.status) searchParams.set("status", params.status);

    return this.request<PaginatedResponse<LeadDto, 'leads'>>(`/api/leads?${searchParams}`);
  }

  async getDashboard() {
    return this.request<{
      dashboard: {
        metrics: {
          myActiveLeads: number;
          allCompanyProjects: number;
          activeConflictsToday: number;
          quotesExpiringThisWeek: number;
        };
        recentActivity: Array<{
          id: string;
          type: "project" | "lead";
          action: string;
          createdAt: string | null;
          user: { id: string | null; name: string; businessUnit: string };
          project: { id: string; projectName: string };
        }>;
      };
    }>("/api/dashboard");
  }

  async deleteLead(id: string) {
    return this.request<{ message: string }>(`/api/leads/${id}`, {
      method: "DELETE",
    });
  }

  // File endpoints
  async getProjectFiles(projectId: string) {
    return this.request<{ files: FileDto[] }>(`/api/projects/${projectId}/files`);
  }

  async getLeadFiles(leadId: string) {
    return this.request<{ files: FileDto[] }>(`/api/leads/${leadId}/files`);
  }

  async uploadFile(formData: FormData) {
    const url = `${this.baseURL}/api/files/upload`;

    const response = await fetch(url, {
      method: "POST",
      credentials: "include",
      body: formData,
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ error: "Network error" }));
      const err = new Error(getErrorMessage(errorBody, `HTTP ${response.status}`)) as ApiError;
      err.status = response.status;
      err.data = errorBody;

      // Parse validation errors for better client handling
      const validationError = parseValidationError(errorBody);
      if (validationError) {
        err.validationError = validationError;
      }

      throw err;
    }

    return response.json();
  }

  async getFile(id: string) {
    return this.request<{ file: FileDto }>(`/api/files/${id}`);
  }

  async getFileDownloadUrl(id: string) {
    return this.request<{ downloadUrl: string }>(`/api/files/${id}/download`);
  }

  // Conflict endpoints
  async getProjectConflicts(projectId: string, newPrice?: string) {
    const searchParams = new URLSearchParams();
    if (newPrice) searchParams.set("newPrice", newPrice);

    return this.request<{ conflicts: ConflictDto[] }>(`/api/projects/${projectId}/conflicts?${searchParams}`);
  }

  // Comment endpoints
  async getProjectComments(projectId: string, params?: { limit?: number; offset?: number }) {
    const searchParams = new URLSearchParams();
    if (params?.limit) searchParams.set("limit", params.limit.toString());
    if (params?.offset) searchParams.set("offset", params.offset.toString());

    return this.request<{ comments: CommentDto[] }>(`/api/projects/${projectId}/comments?${searchParams}`);
  }

  async createComment(projectId: string, data: {
    content: string;
    parentId?: string;
  }) {
    try {
      const result = await this.request<{ comment: CommentDto }>(`/api/projects/${projectId}/comments`, {
        method: "POST",
        body: JSON.stringify(data),
      });
      logger.userAction("create comment", { projectId, parentId: data.parentId });
      return result;
    } catch (error) {
      logger.apiError(`/api/projects/${projectId}/comments`, (error as Error).message, { projectId, parentId: data.parentId });
      throw error;
    }
  }

  async updateComment(projectId: string, commentId: string, data: {
    content: string;
  }) {
    return this.request<{ comment: CommentDto }>(`/api/projects/${projectId}/comments/${commentId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async deleteComment(projectId: string, commentId: string) {
    return this.request<{ message: string }>(`/api/projects/${projectId}/comments/${commentId}`, {
      method: "DELETE",
    });
  }

  // Notification endpoints
  async getNotifications() {
    return this.request<{ notifications: NotificationDto[] }>("/api/notifications");
  }

  async markNotificationRead(id: string) {
    return this.request<{ message: string }>(`/api/notifications/${id}/read`, {
      method: "PATCH",
    });
  }

  // Admin endpoints
  async getAdminUsers() {
    return this.request<{ users: AdminUserDto[] }>("/api/admin/users");
  }

  async getAdminBusinessUnits() {
    return this.request<{ businessUnits: BusinessUnitDto[] }>("/api/admin/business-units");
  }

  async createAdminBusinessUnit(name: string) {
    return this.request<{ businessUnit: BusinessUnitDto }>("/api/admin/business-units", {
      method: "POST",
      body: JSON.stringify({ name }),
    });
  }

  async renameAdminBusinessUnit(id: string, name: string) {
    return this.request<{ businessUnit: BusinessUnitDto }>(`/api/admin/business-units/${id}/rename`, {
      method: "PATCH",
      body: JSON.stringify({ name }),
    });
  }

  async setAdminBusinessUnitActive(id: string, isActive: boolean) {
    return this.request<{ businessUnit: BusinessUnitDto }>(`/api/admin/business-units/${id}/active`, {
      method: "PATCH",
      body: JSON.stringify({ isActive }),
    });
  }

  async createAdminUser(data: {
    email: string;
    name: string;
    businessUnit: string;
    role?: "user" | "admin";
    password: string;
  }) {
    return this.request<{ user: AdminUserDto }>("/api/admin/users", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async deleteAdminUser(userId: string, replacementUserId?: string) {
    return this.request<{ deleted: boolean; needsReplacement?: boolean }>(
      `/api/admin/users/${userId}/delete`,
      {
        method: "POST",
        body: JSON.stringify(replacementUserId ? { replacementUserId } : {}),
      }
    );
  }

  async resetAdminUserPassword(userId: string, password: string) {
    return this.request<{ message: string }>(`/api/admin/users/${userId}/reset-password`, {
      method: "POST",
      body: JSON.stringify({ password }),
    });
  }

  async setAdminUserActive(userId: string, isActive: boolean) {
    return this.request<{ user: AdminUserDto }>(`/api/admin/users/${userId}/active`, {
      method: "PATCH",
      body: JSON.stringify({ isActive }),
    });
  }

  async getAdminStats() {
    return this.request<{
      stats: {
        totalUsers: number;
        totalProjects: number;
        totalLeads: number;
        businessUnits: string[];
        projectsWithConflicts: number;
      };
    }>("/api/admin/stats");
  }

  async testEmailConnection() {
    return this.request<{ success: boolean }>("/api/email/test", {
      method: "POST",
    });
  }

  async sendTestEmail(emailAddress: string) {
    return this.request<{ success: boolean; message: string }>("/api/admin/send-test-email", {
      method: "POST",
      body: JSON.stringify({ emailAddress }),
    });
  }

  async sendTestCommentEmail(emailAddress: string) {
    return this.request<{ success: boolean; message: string }>("/api/admin/send-test-comment-email", {
      method: "POST",
      body: JSON.stringify({ emailAddress }),
    });
  }

  async getAuditLogs(params?: {
    limit?: number;
    offset?: number;
    action?: string;
    userId?: string;
    businessUnit?: string;
    severity?: string;
    targetType?: string;
  }) {
    const searchParams = new URLSearchParams();
    if (params?.limit) searchParams.set("limit", params.limit.toString());
    if (params?.offset) searchParams.set("offset", params.offset.toString());
    if (params?.action) searchParams.set("action", params.action);
    if (params?.userId) searchParams.set("userId", params.userId);
    if (params?.businessUnit) searchParams.set("businessUnit", params.businessUnit);
    if (params?.severity) searchParams.set("severity", params.severity);
    if (params?.targetType) searchParams.set("targetType", params.targetType);

    return this.request<{
      auditLogs: Array<{
        id: string;
        userId: string | null;
        userBusinessUnit: string | null;
        userRole: string | null;
        action: string;
        targetType: string | null;
        targetId: string | null;
        targetDisplay?: string | null;
        targetBusinessUnit: string | null;
        previousValues: unknown | null;
        newValues: unknown | null;
        ipAddress: string | null;
        userAgent: string | null;
        endpoint: string | null;
        metadata: unknown;
        severity: string;
        groupProfitImpact: number | null;
        coordinationScore: number | null;
        createdAt: string;
      }>;
      totalCount: number;
      limit: number;
      offset: number;
    }>(`/api/admin/audit-logs?${searchParams}`);
  }

  async getBusinessUnitUsers() {
    return this.request<{ users: BusinessUnitUserDto[] }>("/api/bu-users");
  }
}

export const apiClient = new ApiClient(API_BASE_URL);

// Query client for React Query
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 5 * 60 * 1000, // 5 minutes
    },
  },
});