import { useState, useEffect } from "react";
import { getRecentRooms, addRecentRoom, type RecentRoom } from "./recentRooms";

export interface UseRecentRoomsReturn {
  recentRooms: RecentRoom[];
  refreshRecentRooms: () => void;
  addToRecent: (code: string) => void;
}

export const useRecentRooms = (): UseRecentRoomsReturn => {
  const [recentRooms, setRecentRooms] = useState(() => getRecentRooms());

  const refreshRecentRooms = () => {
    setRecentRooms(getRecentRooms());
  };

  const addToRecent = (code: string) => {
    addRecentRoom(code);
    refreshRecentRooms();
  };

  // Refresh when component mounts or when localStorage changes
  useEffect(() => {
    const handleStorageChange = () => {
      refreshRecentRooms();
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  return {
    recentRooms,
    refreshRecentRooms,
    addToRecent,
  };
};