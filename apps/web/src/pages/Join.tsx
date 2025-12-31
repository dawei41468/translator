import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useJoinRoom } from "@/lib/hooks";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

const Join = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { code } = useParams<{ code: string }>();
  const [roomCode, setRoomCode] = useState(code || "");

  const joinRoomMutation = useJoinRoom();

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomCode.trim()) {
      toast.error(t('error.enterCode'));
      return;
    }
    joinRoomMutation.mutate(roomCode.toUpperCase());
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="text-center max-w-md mx-auto">
        <h1 className="mb-4 text-3xl font-bold">{t('room.enterTitle')}</h1>
        <p className="text-lg mb-8">{t('room.enterPrompt')}</p>

        <form onSubmit={handleJoin} className="space-y-4">
          <input
            type="text"
            value={roomCode}
            onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
            placeholder={t('room.enterCodePlaceholder')}
            className="w-full p-3 border border-gray-300 rounded-lg text-center text-lg font-mono tracking-wider"
            maxLength={7}
            disabled={joinRoomMutation.isPending}
          />

          <button
            type="submit"
            disabled={joinRoomMutation.isPending || !roomCode.trim()}
            className="w-full p-3 bg-green-500 hover:bg-green-600 text-white rounded-lg font-medium disabled:opacity-50"
          >
            {joinRoomMutation.isPending ? t('room.joining') : t('room.join')}
          </button>
        </form>

        <div className="mt-8">
          <button
            onClick={() => navigate("/dashboard")}
            className="text-blue-500 hover:text-blue-600"
          >
            ← {t('common.backToDashboard')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Join;