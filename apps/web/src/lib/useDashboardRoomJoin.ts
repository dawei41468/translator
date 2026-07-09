import { useState, useRef, useCallback } from "react";
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

/**
 * Room join helpers for the dashboard.
 * Auth gating is the caller's responsibility (Dashboard guest funnel).
 */
export const useDashboardRoomJoin = (): UseDashboardRoomJoinReturn => {
  const { t } = useTranslation();
  const [manualCode, setManualCode] = useState("");
  const [isJoining, setIsJoining] = useState(false);
  const manualCodeInputRef = useRef<HTMLInputElement>(null);
  const joinRoomMutation = useJoinRoom();

  const handleManualJoin = useCallback(() => {
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
  }, [manualCode, isJoining, joinRoomMutation, t]);

  const handleRecentJoin = useCallback((code: string) => {
    const normalized = code.trim().toUpperCase();
    if (!normalized) return;

    setManualCode(normalized);

    if (isJoining) return;
    setIsJoining(true);
    joinRoomMutation.mutate(normalized, {
      onSettled: () => {
        setIsJoining(false);
      }
    });
  }, [isJoining, joinRoomMutation]);

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