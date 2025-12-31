import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import { toast } from "sonner";

const Join = () => {
  const navigate = useNavigate();
  const { code } = useParams<{ code: string }>();
  const [roomCode, setRoomCode] = useState(code || "");

  const joinRoomMutation = useMutation({
    mutationFn: (code: string) => apiClient.joinRoom(code),
    onSuccess: (data) => {
      // Navigate to the conversation page
      navigate(`/room/${data.roomCode}`);
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to join room");
    },
  });

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomCode.trim()) {
      toast.error("Please enter a room code");
      return;
    }
    joinRoomMutation.mutate(roomCode.toUpperCase());
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="text-center max-w-md mx-auto">
        <h1 className="mb-4 text-3xl font-bold">Join Conversation</h1>
        <p className="text-lg mb-8">Enter the room code to join the conversation</p>

        <form onSubmit={handleJoin} className="space-y-4">
          <input
            type="text"
            value={roomCode}
            onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
            placeholder="Enter room code"
            className="w-full p-3 border border-gray-300 rounded-lg text-center text-lg font-mono tracking-wider"
            maxLength={6}
            disabled={joinRoomMutation.isPending}
          />

          <button
            type="submit"
            disabled={joinRoomMutation.isPending || !roomCode.trim()}
            className="w-full p-3 bg-green-500 hover:bg-green-600 text-white rounded-lg font-medium disabled:opacity-50"
          >
            {joinRoomMutation.isPending ? "Joining..." : "Join Conversation"}
          </button>
        </form>

        <div className="mt-8">
          <button
            onClick={() => navigate("/dashboard")}
            className="text-blue-500 hover:text-blue-600"
          >
            ← Back to Dashboard
          </button>
        </div>
      </div>
    </div>
  );
};

export default Join;