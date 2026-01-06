import { Link, useLocation } from "react-router-dom";
import { useState } from "react";
import { Home, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const BottomNav = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const { logout } = useAuth();
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);

  const handleLogout = () => {
    logout();
    setShowLogoutDialog(false);
  };

  const navItems = [
    { to: "/dashboard", label: t('nav.dashboard'), icon: Home },
  ];

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 border-t border-border z-50 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <div className="flex justify-around items-center h-16 px-4">
          {navItems.map(({ to, label, icon: Icon }) => {
            const isActive = location.pathname === to;
            return (
              <Link
                key={to}
                to={to}
                className={cn(
                  "flex flex-col items-center justify-center flex-1 py-2 px-1 text-xs font-medium transition-colors",
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="h-5 w-5 mb-1" />
                <span
                  className={cn(
                    "h-0.5 w-6 rounded-full mb-1 transition-colors",
                    isActive ? "bg-primary" : "bg-transparent"
                  )}
                />
                {label}
              </Link>
            );
          })}
          <button
            onClick={() => setShowLogoutDialog(true)}
            className="flex flex-col items-center justify-center flex-1 py-2 px-1 text-xs font-medium transition-colors text-muted-foreground hover:text-foreground"
          >
            <LogOut className="h-5 w-5 mb-1" />
            <span className="h-0.5 w-6 rounded-full mb-1 bg-transparent" />
            {t('auth.logout')}
          </button>
        </div>
      </nav>

      <Dialog open={showLogoutDialog} onOpenChange={setShowLogoutDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('auth.logoutConfirmTitle', 'Confirm Logout')}</DialogTitle>
            <DialogDescription>
              {t('auth.logoutConfirmMessage', 'Are you sure you want to log out?')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLogoutDialog(false)}>
              {t('common.cancel')}
            </Button>
            <Button variant="destructive" onClick={handleLogout}>
              {t('auth.logout')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default BottomNav;