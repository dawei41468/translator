import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "./api";
import { useAuth } from "./auth";
import type { CommentDto } from "./types";

// Project hooks
export function useProjects(params?: {
  limit?: number;
  offset?: number;
  search?: string;
  businessUnit?: string;
  status?: string;
}) {
  const { isAuthenticated, isLoading } = useAuth();
  return useQuery({
    queryKey: ["projects", params],
    queryFn: () => apiClient.getProjects(params),
    enabled: isAuthenticated && !isLoading,
  });
}

export function useProject(id: string) {
  const { isAuthenticated, isLoading } = useAuth();
  return useQuery({
    queryKey: ["project", id],
    queryFn: () => apiClient.getProject(id).then(res => res.project),
    enabled: !!id && isAuthenticated && !isLoading,
  });
}

export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Parameters<typeof apiClient.createProject>[0]) =>
      apiClient.createProject(data).then(res => res.project),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}

export function useUpdateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof apiClient.updateProject>[1] }) =>
      apiClient.updateProject(id, data).then(res => res.project),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["project", data.id] });
    },
  });
}

export function useDeleteProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.deleteProject(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}

export function useSearchProjectDuplicates() {
  return useMutation({
    mutationFn: (data: Parameters<typeof apiClient.searchProjectDuplicates>[0]) =>
      apiClient.searchProjectDuplicates(data),
  });
}

// Lead hooks
export function useProjectLeads(projectId: string, params?: { limit?: number; offset?: number }) {
  const { isAuthenticated, isLoading } = useAuth();
  return useQuery({
    queryKey: ["leads", projectId, params],
    queryFn: () => apiClient.getProjectLeads(projectId, params).then(res => res.leads),
    enabled: !!projectId && isAuthenticated && !isLoading,
  });
}

export function useLead(id: string) {
  const { isAuthenticated, isLoading } = useAuth();
  return useQuery({
    queryKey: ["lead", id],
    queryFn: () => apiClient.getLead(id).then(res => res.lead),
    enabled: !!id && isAuthenticated && !isLoading,
  });
}

export function useCreateLead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, data }: { projectId: string; data: Parameters<typeof apiClient.createLead>[1] }) =>
      apiClient.createLead(projectId, data).then(res => res.lead),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["leads", data.projectId] });
      queryClient.invalidateQueries({ queryKey: ["project", data.projectId] });
    },
  });
}

export function useUpdateLead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof apiClient.updateLead>[1] }) =>
      apiClient.updateLead(id, data).then(res => res.lead),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["leads", data.projectId] });
      queryClient.invalidateQueries({ queryKey: ["lead", data.id] });
      queryClient.invalidateQueries({ queryKey: ["project", data.projectId] });
    },
  });
}

export function useUserLeads(params?: {
  limit?: number;
  offset?: number;
  filter?: string;
  search?: string;
  bu?: string;
  status?: string;
}) {
  const { isAuthenticated, isLoading } = useAuth();
  return useQuery({
    queryKey: ["user-leads", params],
    queryFn: () => apiClient.getUserLeads(params),
    enabled: isAuthenticated && !isLoading,
  });
}

// Dashboard hooks
export function useDashboard() {
  const { isAuthenticated, isLoading } = useAuth();
  return useQuery({
    queryKey: ["dashboard"],
    queryFn: () => apiClient.getDashboard().then((res) => res.dashboard),
    enabled: isAuthenticated && !isLoading,
  });
}

export function useDeleteLead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.deleteLead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["lead"] });
      queryClient.invalidateQueries({ queryKey: ["user-leads"] });
    },
  });
}

// File hooks
export function useProjectFiles(projectId: string) {
  const { isAuthenticated, isLoading } = useAuth();
  return useQuery({
    queryKey: ["files", projectId],
    queryFn: () => apiClient.getProjectFiles(projectId).then(res => res.files),
    enabled: !!projectId && isAuthenticated && !isLoading,
  });
}

export function useLeadFiles(leadId: string) {
  const { isAuthenticated, isLoading } = useAuth();
  return useQuery({
    queryKey: ["lead-files", leadId],
    queryFn: () => apiClient.getLeadFiles(leadId).then(res => res.files),
    enabled: !!leadId && isAuthenticated && !isLoading,
  });
}

export function useUploadFile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (formData: FormData) => apiClient.uploadFile(formData).then(res => res.file),
    onSuccess: () => {
      // Invalidate relevant queries if needed
      queryClient.invalidateQueries({ queryKey: ["files"] });
    },
  });
}

export function useFile(id: string) {
  const { isAuthenticated, isLoading } = useAuth();
  return useQuery({
    queryKey: ["file", id],
    queryFn: () => apiClient.getFile(id).then(res => res.file),
    enabled: !!id && isAuthenticated && !isLoading,
  });
}

export function useFileDownloadUrl(id: string) {
  const { isAuthenticated, isLoading } = useAuth();
  return useQuery({
    queryKey: ["file-download", id],
    queryFn: () => apiClient.getFileDownloadUrl(id).then(res => res.downloadUrl),
    enabled: !!id && isAuthenticated && !isLoading,
  });
}

// Conflict hooks
export function useProjectConflicts(projectId: string, newPrice?: string) {
  const { isAuthenticated, isLoading } = useAuth();
  return useQuery({
    queryKey: ["conflicts", projectId, newPrice],
    queryFn: () => apiClient.getProjectConflicts(projectId, newPrice).then(res => res.conflicts),
    enabled: !!projectId && isAuthenticated && !isLoading,
    refetchInterval: 30000, // Poll every 30 seconds
    refetchIntervalInBackground: false, // Only poll when tab is active
  });
}

// Comment hooks
export function useProjectComments(projectId: string, params?: { limit?: number; offset?: number }) {
  const { isAuthenticated, isLoading } = useAuth();
  return useQuery({
    queryKey: ["comments", projectId, params],
    queryFn: () => apiClient.getProjectComments(projectId, params).then(res => res.comments),
    enabled: !!projectId && isAuthenticated && !isLoading,
  });
}

export function useCreateComment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, data }: { projectId: string; data: Parameters<typeof apiClient.createComment>[1] }) =>
      apiClient.createComment(projectId, data).then(res => res.comment),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["comments", variables.projectId] });
      queryClient.setQueriesData({ queryKey: ["comments", variables.projectId] }, (oldData: unknown) => {
        if (!Array.isArray(oldData)) return oldData;
        const list = oldData as CommentDto[];
        if (_data?.id && list.some((c) => c?.id === _data.id)) return list;
        return [...list, _data];
      });
    },
  });
}

export function useUpdateComment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, commentId, data }: { projectId: string; commentId: string; data: Parameters<typeof apiClient.updateComment>[2] }) =>
      apiClient.updateComment(projectId, commentId, data).then(res => res.comment),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["comments", variables.projectId] });
      queryClient.setQueriesData({ queryKey: ["comments", variables.projectId] }, (oldData: unknown) => {
        if (!Array.isArray(oldData)) return oldData;
        const list = oldData as CommentDto[];
        return list.map((c) => (c?.id === _data?.id ? _data : c));
      });
    },
  });
}

export function useDeleteComment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, commentId }: { projectId: string; commentId: string }) =>
      apiClient.deleteComment(projectId, commentId),
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: ["comments", projectId] });
    },
  });
}

// Notification hooks
export function useNotifications() {
  const { isAuthenticated, isLoading } = useAuth();
  return useQuery({
    queryKey: ["notifications"],
    queryFn: () => apiClient.getNotifications().then(res => res.notifications),
    enabled: isAuthenticated && !isLoading,
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.markNotificationRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

// Admin hooks
export function useAdminUsers() {
  const { user, isAuthenticated, isLoading } = useAuth();
  return useQuery({
    queryKey: ["admin", "users"],
    queryFn: () => apiClient.getAdminUsers().then((res) => res.users),
    enabled: isAuthenticated && !isLoading && user?.role === "admin" && user?.businessUnit === "Group",
  });
}

export function useAdminStats() {
  const { user, isAuthenticated, isLoading } = useAuth();
  return useQuery({
    queryKey: ["admin", "stats"],
    queryFn: () => apiClient.getAdminStats().then((res) => res.stats),
    enabled: isAuthenticated && !isLoading && user?.role === "admin" && user?.businessUnit === "Group",
  });
}

export function useAuditLogs(params?: {
  limit?: number;
  offset?: number;
  action?: string;
  userId?: string;
  businessUnit?: string;
  severity?: string;
  targetType?: string;
}) {
  const { user, isAuthenticated, isLoading } = useAuth();
  return useQuery({
    queryKey: ["admin", "audit-logs", params],
    queryFn: () => apiClient.getAuditLogs(params),
    enabled: isAuthenticated && !isLoading && user?.role === "admin" && user?.businessUnit === "Group",
  });
}

export function useAdminBusinessUnits() {
  const { user, isAuthenticated, isLoading } = useAuth();
  return useQuery({
    queryKey: ["admin", "businessUnits"],
    queryFn: () => apiClient.getAdminBusinessUnits().then((res) => res.businessUnits),
    enabled: isAuthenticated && !isLoading && user?.role === "admin" && user?.businessUnit === "Group",
  });
}

export function useAdminCreateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Parameters<typeof apiClient.createAdminUser>[0]) =>
      apiClient.createAdminUser(data).then((res) => res.user),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "stats"] });
    },
  });
}

export function useAdminCreateBusinessUnit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => apiClient.createAdminBusinessUnit(name).then((res) => res.businessUnit),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "businessUnits"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "stats"] });
    },
  });
}

export function useAdminRenameBusinessUnit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      apiClient.renameAdminBusinessUnit(id, name).then((res) => res.businessUnit),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "businessUnits"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "stats"] });
    },
  });
}

export function useAdminSetBusinessUnitActive() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiClient.setAdminBusinessUnitActive(id, isActive).then((res) => res.businessUnit),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "businessUnits"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "stats"] });
    },
  });
}

export function useAdminDeleteUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, replacementUserId }: { userId: string; replacementUserId?: string }) =>
      apiClient.deleteAdminUser(userId, replacementUserId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "stats"] });
    },
  });
}

export function useAdminResetUserPassword() {
  return useMutation({
    mutationFn: ({ userId, password }: { userId: string; password: string }) =>
      apiClient.resetAdminUserPassword(userId, password),
  });
}

export function useAdminSetUserActive() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, isActive }: { userId: string; isActive: boolean }) =>
      apiClient.setAdminUserActive(userId, isActive).then((res) => res.user),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "stats"] });
    },
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (data: Parameters<typeof apiClient.changePassword>[0]) => apiClient.changePassword(data),
  });
}

// Business Unit users hook
export function useBusinessUnitUsers() {
  const { user, isAuthenticated, isLoading } = useAuth();
  return useQuery({
    queryKey: ["bu-users", user?.businessUnit],
    queryFn: () => apiClient.getBusinessUnitUsers().then(res => res.users),
    enabled: isAuthenticated && !isLoading && !!user?.businessUnit,
  });
}