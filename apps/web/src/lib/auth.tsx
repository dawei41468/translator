import React, { createContext, useContext, useEffect, useState } from "react";
import { apiClient } from "./api";
import i18n from "./i18n";

interface User {
  id: string;
  name: string;
  email: string;
  businessUnit: string;
  role: string;
  language: string;
}

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  isLoading: boolean;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Cookie-based auth: attempt to load current user; 401 means not logged in.
    apiClient
      .getMe()
      .then(({ user }) => {
        setUser(user);
        if (user?.language) {
          i18n.changeLanguage(user.language);
        }
      })
      .catch(() => {
        setUser(null);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  const login = async (email: string, password: string) => {
    try {
      const { user } = await apiClient.login({ email, password });
      setUser(user);
      if (user.language) {
        i18n.changeLanguage(user.language);
      }
    } catch (error) {
      throw error;
    }
  };

  const logout = () => {
    apiClient.logout().catch(() => undefined);
    setUser(null);
  };

  const value: AuthContextType = {
    user,
    login,
    logout,
    isLoading,
    isAuthenticated: !!user,
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