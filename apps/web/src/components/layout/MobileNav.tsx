import { NavLink, useLocation } from 'react-router-dom';
import { LayoutDashboard, FolderKanban, TrendingUp, Bell } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { useNotifications } from '@/lib/hooks';

export function MobileNav() {
  const { t } = useTranslation();
  const location = useLocation();
  const { data: notificationsData } = useNotifications();
  const unreadCount = (notificationsData || []).filter(n => !n.read).length;

  const navItems = [
    { to: '/dashboard', icon: LayoutDashboard, label: t('nav.dashboard') },
    { to: '/projects', icon: FolderKanban, label: t('nav.projects') },
    { to: '/leads', icon: TrendingUp, label: t('layout.pageTitles.leads') },
    { to: '/notifications', icon: Bell, label: t('nav.notifications'), showBadge: true },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 flex h-16 items-center justify-around border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 lg:hidden">
      {navItems.map((item) => {
        const isActive = location.pathname.startsWith(item.to);
        return (
          <NavLink
            key={item.to}
            to={item.to}
            className={cn(
              'relative flex flex-col items-center justify-center gap-1 px-4 py-2 text-xs transition-colors',
              isActive
                ? 'text-primary'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <div className="relative">
              <item.icon className="h-5 w-5" />
              {item.showBadge && unreadCount > 0 && (
                <Badge 
                  className="absolute -right-2 -top-1 h-4 min-w-4 px-1 text-[9px] bg-destructive text-destructive-foreground"
                >
                  {unreadCount}
                </Badge>
              )}
            </div>
            <span className="font-medium">{item.label}</span>
            {isActive && (
              <div className="absolute -bottom-2 h-0.5 w-8 rounded-full bg-primary" />
            )}
          </NavLink>
        );
      })}
    </nav>
  );
}
