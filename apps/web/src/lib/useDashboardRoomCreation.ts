import { useState } from "react";
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

export const useDashboardRoomCreation = (isAuthenticated: boolean): UseDashboardRoomCreationReturn => {
  const navigate = useNavigate();
  const [createdRoom, setCreatedRoom] = useState<CreatedRoom | null>(null);
  const createRoomMutation = useCreateRoom();

  const handleStartConversation = () => {
    if (!isAuthenticated) {
      return; // Handle by caller
    }
    createRoomMutation.mutate(undefined, {
      onSuccess: (data) => {
        setCreatedRoom({ code: data.roomCode, id: data.roomId });
        addRecentRoom(data.roomCode);
        // Note: getRecentRooms() is not called here as it's handled by useRecentRooms
      },
      onError: (error) => {
        console.error('Room creation failed:', error);
      }
    });
  };

  const handleJoinConversation = () => {
    if (createdRoom) {
      navigate(`/room/${createdRoom.code}`);
    }
  };

  const resetRoom = () => {
    setCreatedRoom(null);
  };

  return {
    createdRoom,
    setCreatedRoom,
    createRoomMutation,
    handleStartConversation,
    handleJoinConversation,
    resetRoom,
  };
};