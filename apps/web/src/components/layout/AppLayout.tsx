import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { MobileNav } from './MobileNav';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';

const getPageTitle = (pathname: string, t: (key: string) => string) => {
  if (pathname === '/dashboard') return t('layout.pageTitles.dashboard');
  if (pathname === '/projects') return t('layout.pageTitles.projects');
  if (pathname.startsWith('/projects/')) return t('layout.pageTitles.projectDetails');
  if (pathname === '/leads') return t('layout.pageTitles.leads');
  if (pathname === '/notifications') return t('layout.pageTitles.notifications');
  return 'OneProject';
};

export function AppLayout() {
  const { t } = useTranslation();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const location = useLocation();
  const pageTitle = getPageTitle(location.pathname, t);

  return (
    <div className="min-h-screen bg-background">
      {/* Skip to Content Link */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100] focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-md focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
      >
        {t('common.skipToContent')}
      </a>

      {/* Desktop Sidebar */}
      <div className="hidden lg:block">
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        />
      </div>

      {/* Main Content */}
      <div
        className={cn(
          'flex min-h-screen flex-col transition-all duration-300',
          sidebarCollapsed ? 'lg:pl-16' : 'lg:pl-64'
        )}
      >
        <Header
          title={pageTitle}
          showMenuButton
        />

        <main id="main-content" className="flex-1 p-4 pb-20 lg:p-6 lg:pb-6 outline-none" tabIndex={-1}>
          <Outlet />
        </main>
      </div>

      {/* Mobile Navigation */}
      <MobileNav />
    </div>
  );
}
