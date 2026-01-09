// Basic types for the translator app

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  displayName?: string;
  language: string;
  isGuest?: boolean;
  preferences?: {
    sttEngine?: string;
    ttsEngine?: string;
    translationEngine?: string;
  };
}

export interface ApiError extends Error {
  status: number;
  data?: unknown;
  validationError?: {
    message: string;
    details?: any[];
  };
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof Error && 'status' in error;
}

// Basic DTOs that might be used
export interface PaginatedResponse<T> {
  data: T[];
  totalCount?: number;
  limit?: number;
  offset?: number;
}

// Comment DTO (if needed for future features)
export interface CommentDto {
  id: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  userId: string;
  user: {
    id: string;
    name: string;
  };
  parentId?: string;
}