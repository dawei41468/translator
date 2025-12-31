import { Link } from "react-router-dom";
import { LogOut, Bell } from "lucide-react";
import { useAuth } from "../lib/auth";
import { Button } from "./ui/button";
import { logger } from "../lib/logger";
import { useNotifications } from "../lib/hooks";

export default function Header() {
  const { logout } = useAuth();
  const { data: notifications } = useNotifications();
  const unreadCount = notifications?.filter((n) => !n.read).length || 0;

  return (
    <nav className="bg-white dark:bg-gray-800 shadow">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center">
            <Link to="/dashboard" className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
              OneProject
            </Link>
          </div>
          <div className="flex items-center space-x-4">
            <Link to="/projects">
              <Button variant="ghost">Projects</Button>
            </Link>
            <Link to="/notifications" className="relative">
              <Button variant="ghost" className="relative">
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </Button>
            </Link>
            <button
              onClick={() => {
                logger.buttonClick("logout");
                logout();
              }}
              className="flex items-center gap-2 text-gray-600 hover:text-gray-900 dark:text-gray-400"
            >
              <LogOut className="w-5 h-5" />
              Logout
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}