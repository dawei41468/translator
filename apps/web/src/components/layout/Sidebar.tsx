import { NavLink, useLocation } from 'react-router-dom';
import { LayoutDashboard, FolderKanban, TrendingUp, Bell, ChevronLeft, Layers } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useNotifications } from '@/lib/hooks';

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const { t } = useTranslation();
  const location = useLocation();
  const { data: notificationsData } = useNotifications();
  const unreadCount = (notificationsData || []).filter(n => !n.read).length;

  const navItems = [
    { to: '/dashboard', icon: LayoutDashboard, label: t('nav.dashboard') },
    { to: '/projects', icon: FolderKanban, label: t('nav.projects') },
    { to: '/leads', icon: TrendingUp, label: t('nav.leads') },
    { to: '/notifications', icon: Bell, label: t('nav.notifications'), showBadge: true },
  ];

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 z-50 flex h-screen flex-col border-r bg-sidebar transition-all duration-300 ease-in-out',
        collapsed ? 'w-16' : 'w-64'
      )}
    >
      {/* Logo */}
      <div className={cn(
        'flex h-16 items-center border-b px-4',
        collapsed ? 'justify-center' : 'justify-between'
      )}>
        <NavLink to="/dashboard" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Layers className="h-5 w-5" />
          </div>
          {!collapsed && (
            <div className="flex flex-col">
              <span className="text-lg font-bold text-foreground">OneProject</span>
            </div>
          )}
        </NavLink>
        {!collapsed && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggle}
            className="h-8 w-8"
            aria-label="Collapse sidebar"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </Button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 p-2">
        {navItems.map((item) => {
          const isActive = location.pathname.startsWith(item.to);
          return (
            <NavLink
              key={item.to}
              to={item.to}
              aria-label={`${item.label}${item.showBadge && unreadCount > 0 ? `, ${unreadCount} new notifications` : ''}`}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200',
                isActive
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                collapsed && 'justify-center px-2'
              )}
            >
              <item.icon className={cn('h-5 w-5 flex-shrink-0', collapsed && 'h-5 w-5')} aria-hidden="true" />
              {!collapsed && (
                <>
                  <span className="flex-1">{item.label}</span>
                  {item.showBadge && unreadCount > 0 && (
                    <Badge
                      variant={isActive ? 'secondary' : 'destructive'}
                      className="h-5 min-w-5 px-1.5 text-[10px]"
                    >
                      {unreadCount}
                    </Badge>
                  )}
                </>
              )}
              {collapsed && item.showBadge && unreadCount > 0 && (
                <Badge
                  className="absolute -right-1 -top-1 h-4 min-w-4 px-1 text-[9px] bg-destructive text-destructive-foreground"
                >
                  {unreadCount}
                </Badge>
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* Collapse button (when collapsed) */}
      {collapsed && (
        <div className="border-t p-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggle}
            className="w-full h-10"
            aria-label="Expand sidebar"
          >
            <ChevronLeft className="h-4 w-4 rotate-180" aria-hidden="true" />
          </Button>
        </div>
      )}

      {/* Footer */}
      {!collapsed && (
        <div className="border-t p-4">
          <p className="text-xs text-muted-foreground text-center">
            {t('common.tagline')}
          </p>
        </div>
      )}
    </aside>
  );
}
