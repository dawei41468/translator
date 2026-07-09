import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useCreateRoom } from "./hooks";
import { addRecentRoom } from "./recentRooms";

export interface CreatedRoom {
  code: string;
  id: string;
}

export interface UseDashboardRoomCreationReturn {
  createdRoom: CreatedRoom | null;
  setCreatedRoom: (room: CreatedRoom | null) => void;
  createRoomMutation: ReturnType<typeof useCreateRoom>;
  handleStartConversation: () => void;
  handleJoinConversation: () => void;
  resetRoom: () => void;
}

/**
 * Room creation helpers for the dashboard.
 * Auth gating is the caller's responsibility (Dashboard guest funnel).
 */
export const useDashboardRoomCreation = (): UseDashboardRoomCreationReturn => {
  const navigate = useNavigate();
  const [createdRoom, setCreatedRoom] = useState<CreatedRoom | null>(null);
  const createRoomMutation = useCreateRoom();

  const handleStartConversation = useCallback(() => {
    createRoomMutation.mutate(undefined, {
      onSuccess: (data) => {
        setCreatedRoom({ code: data.roomCode, id: data.roomId });
        addRecentRoom(data.roomCode);
        // Note: getRecentRooms() is not called here as it's handled by useRecentRooms
      },
      onError: (_error) => {
        // Room creation failed — toast is handled by useCreateRoom
      }
    });
  }, [createRoomMutation]);

  const handleJoinConversation = useCallback(() => {
    if (createdRoom) {
      navigate(`/room/${createdRoom.code}`);
    }
  }, [createdRoom, navigate]);

  const resetRoom = useCallback(() => {
    setCreatedRoom(null);
  }, []);

  return {
    createdRoom,
    setCreatedRoom,
    createRoomMutation,
    handleStartConversation,
    handleJoinConversation,
    resetRoom,
  };
};