import { useState, useRef } from "react";
import { useJoinRoom } from "./hooks";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

export interface UseDashboardRoomJoinReturn {
  manualCode: string;
  setManualCode: (code: string) => void;
  isJoining: boolean;
  setIsJoining: (joining: boolean) => void;
  joinRoomMutation: ReturnType<typeof useJoinRoom>;
  manualCodeInputRef: React.RefObject<HTMLInputElement>;
  handleManualJoin: () => void;
  handleRecentJoin: (code: string) => void;
}

export const useDashboardRoomJoin = (isAuthenticated: boolean): UseDashboardRoomJoinReturn => {
  const { t } = useTranslation();
  const [manualCode, setManualCode] = useState("");
  const [isJoining, setIsJoining] = useState(false);
  const manualCodeInputRef = useRef<HTMLInputElement>(null);
  const joinRoomMutation = useJoinRoom();

  const handleManualJoin = () => {
    if (!isAuthenticated) {
      return; // Handle by caller
    }
    if (!manualCode.trim()) {
      toast.error(t('error.enterCode'));
      return;
    }
    if (isJoining) {
      return;
    }
    setIsJoining(true);
    joinRoomMutation.mutate(manualCode.toUpperCase(), {
      onSettled: () => {
        setIsJoining(false);
      }
    });
  };

  const handleRecentJoin = (code: string) => {
    const normalized = code.trim().toUpperCase();
    if (!normalized) return;

    setManualCode(normalized);

    if (!isAuthenticated) {
      return; // Handle by caller
    }

    if (isJoining) return;
    setIsJoining(true);
    joinRoomMutation.mutate(normalized, {
      onSettled: () => {
        setIsJoining(false);
      }
    });
  };

  return {
    manualCode,
    setManualCode,
    isJoining,
    setIsJoining,
    joinRoomMutation,
    manualCodeInputRef,
    handleManualJoin,
    handleRecentJoin,
  };
};