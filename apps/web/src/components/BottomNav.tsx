import { Link, useLocation } from "react-router-dom";
import { Home, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

const BottomNav = () => {
  const { t } = useTranslation();
  const location = useLocation();

  const navItems = [
    { to: "/dashboard", label: t('nav.dashboard'), icon: Home },
    { to: "/settings", label: t('nav.settings'), icon: Settings },
  ];

  return (
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
      </div>
    </nav>
  );
};

export default BottomNav;