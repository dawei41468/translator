import { useState } from "react";
import { useAuth } from "./auth";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

export interface UseGuestModeReturn {
  isGuestDialogOpen: boolean;
  setIsGuestDialogOpen: (open: boolean) => void;
  guestName: string;
  setGuestName: (name: string) => void;
  pendingAction: 'create' | 'join' | 'scan' | null;
  setPendingAction: (action: 'create' | 'join' | 'scan' | null) => void;
  handleGuestSubmit: (e: React.FormEvent) => Promise<void>;
}

export const useGuestMode = (): UseGuestModeReturn => {
  const { t } = useTranslation();
  const { loginAsGuest } = useAuth();
  const [isGuestDialogOpen, setIsGuestDialogOpen] = useState(false);
  const [guestName, setGuestName] = useState("");
  const [pendingAction, setPendingAction] = useState<'create' | 'join' | 'scan' | null>(null);

  const handleGuestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!guestName.trim()) return;

    try {
      await loginAsGuest(guestName);
      setIsGuestDialogOpen(false);
      setGuestName("");

      // The pending action will be handled by the caller
    } catch (error) {
      toast.error(t('auth.guestLoginFailed', 'Failed to join as guest'));
    }
  };

  return {
    isGuestDialogOpen,
    setIsGuestDialogOpen,
    guestName,
    setGuestName,
    pendingAction,
    setPendingAction,
    handleGuestSubmit,
  };
};