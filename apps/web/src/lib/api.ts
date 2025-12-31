import { QueryClient } from "@tanstack/react-query";
import type { AuthUser, ApiError } from "./types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

function getErrorMessage(errorBody: unknown, fallback: string): string {
  if (typeof errorBody === "object" && errorBody !== null && "error" in errorBody) {
    const msg = (errorBody as { error?: unknown }).error;
    if (typeof msg === "string" && msg.trim().length > 0) return msg;
  }
  return fallback;
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
    const result = await this.request<{ user: AuthUser }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(data),
    });
    return result;
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

  async register(data: { email: string; password: string; name: string }) {
    const result = await this.request<{ user: AuthUser }>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify(data),
    });
    return result;
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