import { Layers } from 'lucide-react';
import { ThemeToggle } from '@/components/shared/ThemeToggle';
import { NotificationBell } from '@/components/shared/NotificationBell';
import { UserDropdown } from '@/components/layout/UserDropdown';

interface HeaderProps {
  title: string;
  showMenuButton?: boolean;
}

export function Header({ title, showMenuButton = false }: HeaderProps) {
  return (
    <header className="sticky top-0 z-40 flex h-16 items-center gap-4 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-4 lg:px-6">
      {showMenuButton && (
        <div className="lg:hidden flex items-center">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Layers className="h-5 w-5" aria-hidden="true" />
          </div>
        </div>
      )}

      <div className="flex-1">
        <h1 className="text-lg font-semibold md:text-xl">{title}</h1>
      </div>

      <div className="flex items-center gap-2">
        <NotificationBell />
        <ThemeToggle />
        <UserDropdown />
      </div>
    </header>
  );
}
