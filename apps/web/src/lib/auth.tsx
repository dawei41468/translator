import React, { createContext, useContext, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "./api";
import type { AuthUser } from "./types";
import { useTranslation } from "react-i18next";
import { createSpeechEngineRegistry } from "./speech-engines";
import type { SpeechEngineRegistry } from "./speech-engines/registry";

interface AuthContextType {
  user: AuthUser | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  loginAsGuest: (displayName: string) => Promise<void>;
  logout: () => void;
  isLoading: boolean;
  isAuthenticated: boolean;
  speechEngineRegistry: SpeechEngineRegistry;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { i18n } = useTranslation();
  const queryClient = useQueryClient();

  const meQuery = useQuery({
    queryKey: ['me'],
    queryFn: () => apiClient.getMe(),
    retry: false,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const user = meQuery.data?.user ?? null;

  const speechEngineRegistry = useMemo(
    () => createSpeechEngineRegistry({
      stt: user?.preferences?.sttEngine,
      tts: user?.preferences?.ttsEngine,
      translation: user?.preferences?.translationEngine,
    }),
    [user?.preferences]
  );

  useEffect(() => {
    if (user?.language) {
      i18n.changeLanguage(user.language);
    }
  }, [user?.language, i18n]);

  const login = async (email: string, password: string) => {
    try {
      const result = await apiClient.login({ email, password });
      // Immediately update the auth state with the user data
      queryClient.setQueryData(['me'], { user: result.user });
    } catch (error) {
      throw error;
    }
  };

  const register = async (email: string, password: string, name: string) => {
    try {
      const result = await apiClient.register({ email, password, name });
      // Immediately update the auth state with the user data
      queryClient.setQueryData(['me'], { user: result.user });
    } catch (error) {
      throw error;
    }
  };

  const loginAsGuest = async (displayName: string) => {
    try {
      const result = await apiClient.guestLogin(displayName);
      queryClient.setQueryData(['me'], { user: result.user });
    } catch (error) {
      throw error;
    }
  };

  const logout = () => {
    apiClient.logout().catch(() => undefined);
    // Immediately clear the auth state
    queryClient.setQueryData(['me'], { user: null });
  };

  const value: AuthContextType = {
    user,
    login,
    register,
    loginAsGuest,
    logout,
    isLoading: meQuery.isLoading,
    isAuthenticated: !!user && !meQuery.isError,
    speechEngineRegistry,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}