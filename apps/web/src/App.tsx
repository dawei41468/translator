import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { AuthProvider, useAuth } from "@/lib/auth";
import { queryClient } from "@/lib/api";
import { Toaster } from "sonner";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import Dashboard from "@/pages/Dashboard";
import Settings from "@/pages/Settings";
import Conversation from "@/pages/Conversation";
import Layout from "@/components/Layout";
import { Skeleton } from "@/components/ui/skeleton";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, user } = useAuth();

  console.log('🔐 ProtectedRoute check:', { isAuthenticated, isLoading, user: !!user, path: window.location.pathname });

  if (isLoading) {
    console.log('🔄 ProtectedRoute: still loading auth state');
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-10">
          <div className="max-w-md mx-auto border rounded-xl bg-card text-card-foreground shadow-sm p-5 space-y-4">
            <Skeleton className="h-7 w-32" />
            <Skeleton className="h-11 w-full" />
            <Skeleton className="h-11 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    console.log('🚫 ProtectedRoute: not authenticated, redirecting to login');
    return <Navigate to="/login" replace />;
  }

  console.log('✅ ProtectedRoute: authenticated, rendering protected content');
  return <Layout>{children}</Layout>;
}

export const AppRoutes = () => {
  const location = useLocation();
  
  console.log('🗺️ AppRoutes - current location:', {
    pathname: location.pathname,
    search: location.search,
    hash: location.hash,
    key: location.key
  });

  // Log location changes
  useEffect(() => {
    console.log('📍 Location changed to:', location.pathname);
  }, [location]);

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/dashboard" element={
        <ProtectedRoute>
          <Dashboard />
        </ProtectedRoute>
      } />
      <Route path="/settings" element={
        <ProtectedRoute>
          <Settings />
        </ProtectedRoute>
      } />
      <Route path="/room/:code" element={
        <ProtectedRoute>
          <Conversation />
        </ProtectedRoute>
      } />
    </Routes>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
        <Toaster />
      </AuthProvider>
    </BrowserRouter>
  </QueryClientProvider>
);

export default App;
