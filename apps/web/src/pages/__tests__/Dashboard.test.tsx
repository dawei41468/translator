import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import Dashboard from '../Dashboard';
import { useAuth } from '@/lib/auth';

// Mock the auth hook
vi.mock('@/lib/auth', () => ({
  useAuth: vi.fn(),
}));

// Mock the hooks
vi.mock('@/lib/hooks', () => ({
  useCreateRoom: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useJoinRoom: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}));

// Mock react-i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe('Dashboard', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    // JSDOM localStorage can throw (opaque origin). Use an in-memory store per test.
    const store = new Map<string, string>();
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
        setItem: (key: string, value: string) => {
          store.set(key, String(value));
        },
        removeItem: (key: string) => {
          store.delete(key);
        },
        clear: () => {
          store.clear();
        },
      },
      configurable: true,
    });

    // Reset mocks
    vi.clearAllMocks();
  });

  const renderDashboard = () => {
    return render(
      <QueryClientProvider client={queryClient}>
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Dashboard />
        </BrowserRouter>
      </QueryClientProvider>
    );
  };

  it('should show login prompt when not authenticated', () => {
    (useAuth as any).mockReturnValue({
      user: null,
      isAuthenticated: false,
      isLoading: false,
    });

    renderDashboard();

    expect(screen.getByText('auth.haveAccount')).toBeInTheDocument();
    expect(screen.getByText('auth.login')).toBeInTheDocument();
  });

  it('should show create room button when authenticated', () => {
    (useAuth as any).mockReturnValue({
      user: { id: 1, email: 'test@example.com' },
      isAuthenticated: true,
      isLoading: false,
    });

    renderDashboard();

    expect(screen.getByText('room.create')).toBeInTheDocument();
  });

  it('should show room code input when authenticated', () => {
    (useAuth as any).mockReturnValue({
      user: { id: 1, email: 'test@example.com' },
      isAuthenticated: true,
      isLoading: false,
    });

    renderDashboard();

    expect(screen.getByPlaceholderText('room.enterCodePlaceholder')).toBeInTheDocument();
  });

  it('should show recent rooms when stored', () => {
    window.localStorage.setItem(
      'recent_rooms_v1',
      JSON.stringify([
        { code: 'ABCD12', lastUsedAt: Date.now() },
      ])
    );

    (useAuth as any).mockReturnValue({
      user: { id: 1, email: 'test@example.com' },
      isAuthenticated: true,
      isLoading: false,
    });

    renderDashboard();

    expect(screen.getByText('room.recentRooms')).toBeInTheDocument();
    expect(screen.getByText('ABCD12')).toBeInTheDocument();
  });

  it('should open quick actions dialog from the FAB', () => {
    (useAuth as any).mockReturnValue({
      user: { id: 1, email: 'test@example.com' },
      isAuthenticated: true,
      isLoading: false,
    });

    renderDashboard();

    const fab = screen.getByTestId('dashboard-fab');
    expect(fab).toBeInTheDocument();

    fireEvent.click(fab);

    expect(screen.getByText('room.quickActions')).toBeInTheDocument();
    expect(screen.getAllByText('room.create').length).toBeGreaterThan(0);
    expect(screen.getAllByText('room.scan').length).toBeGreaterThan(0);
    expect(screen.getByText('room.enterCode')).toBeInTheDocument();
  });
});