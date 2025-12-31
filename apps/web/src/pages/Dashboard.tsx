// Live Translator Dashboard
import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useCreateRoom, useJoinRoom } from "@/lib/hooks";
import { toast } from "sonner";
import { Html5QrcodeScanner } from "html5-qrcode";
import { QRCodeCanvas } from "qrcode.react";
import { useAuth } from "@/lib/auth";
import { useTranslation } from "react-i18next";

const Dashboard = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [createdRoom, setCreatedRoom] = useState<{ code: string; id: string } | null>(null);
  const [showScanner, setShowScanner] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);

  const createRoomMutation = useCreateRoom();
  const joinRoomMutation = useJoinRoom();

  const handleStartConversation = () => {
    createRoomMutation.mutate(undefined, {
      onSuccess: (data) => {
        setCreatedRoom({ code: data.roomCode, id: data.roomId });
        toast.success(t('room.created'));
      }
    });
  };

  const handleJoinConversation = () => {
    if (createdRoom) {
      navigate(`/room/${createdRoom.code}`);
    }
  };

  const handleScanQR = () => {
    if (!isAuthenticated) {
      navigate("/login");
      return;
    }
    setShowScanner(true);
  };

  const handleManualJoin = () => {
    if (!isAuthenticated) {
      navigate("/login");
      return;
    }
    if (!manualCode.trim()) {
      toast.error(t('error.enterCode'));
      return;
    }
    joinRoomMutation.mutate(manualCode.toUpperCase());
  };

  const shareableLink = createdRoom
    ? `${window.location.origin}/join/${createdRoom.code}`
    : "";

  // Initialize QR scanner
  useEffect(() => {
    if (showScanner && !scannerRef.current) {
      scannerRef.current = new Html5QrcodeScanner(
        "qr-reader",
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
        },
        false
      );

      scannerRef.current.render(
        (decodedText) => {
          // Extract room code from URL
          try {
            const url = new URL(decodedText);
            const code = url.pathname.split('/').pop();
            if (code) {
              joinRoomMutation.mutate(code);
            } else {
              toast.error(t('error.invalidQR'));
            }
          } catch (e) {
            toast.error(t('error.invalidQR'));
          }
        },
        (error) => {
          console.log("QR scan error:", error);
        }
      );
    }

    return () => {
      if (scannerRef.current) {
        scannerRef.current.clear();
        scannerRef.current = null;
      }
    };
  }, [showScanner, joinRoomMutation, t]);

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="text-center max-w-md mx-auto">
        <h1 className="mb-4 text-4xl font-bold">{t('app.name')}</h1>
        <p className="text-xl mb-8">{t('app.description')}</p>

        {!createdRoom ? (
          <>
            <p className="text-sm mb-6">
              {t('room.startPrompt')}
            </p>
            <button
              onClick={handleStartConversation}
              disabled={createRoomMutation.isPending}
              className="w-full p-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium disabled:opacity-50 mb-8"
            >
              {createRoomMutation.isPending ? t('room.creating') : t('room.create')}
            </button>

            <div className="border-t pt-6">
              <h3 className="font-semibold mb-4">{t('room.joinExisting')}</h3>

              <button
                onClick={handleScanQR}
                disabled={!isAuthenticated}
                className="w-full p-3 bg-green-500 hover:bg-green-600 text-white rounded-lg font-medium disabled:opacity-50 mb-4"
              >
                {t('room.scan')}
              </button>

              <div className="text-center mb-4">
                <span className="text-gray-500">{t('common.or')}</span>
              </div>

              <div className="space-y-2">
                <input
                  type="text"
                  value={manualCode}
                  onChange={(e) => setManualCode(e.target.value.toUpperCase())}
                  placeholder={t('room.enterCodePlaceholder')}
                  className="w-full p-3 border border-gray-300 rounded-lg text-center font-mono"
                  maxLength={7}
                  disabled={!isAuthenticated}
                />
                <button
                  onClick={handleManualJoin}
                  disabled={!isAuthenticated || !manualCode.trim() || joinRoomMutation.isPending}
                  className="w-full p-3 bg-gray-500 hover:bg-gray-600 text-white rounded-lg font-medium disabled:opacity-50"
                >
                  {joinRoomMutation.isPending ? t('room.joining') : t('room.joinByCode')}
                </button>
              </div>

              {!isAuthenticated && (
                <p className="text-sm text-gray-500 mt-4">
                  {t('auth.loginToJoin')}
                </p>
              )}
            </div>
          </>
        ) : (
          <div className="space-y-4">
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <h3 className="font-semibold text-green-800 mb-2">{t('room.createdTitle')}</h3>
              <p className="text-sm text-green-700 mb-3">
                {t('room.showQR')}
              </p>

              <div className="bg-white p-4 rounded-lg mb-3 flex justify-center">
                <QRCodeCanvas value={shareableLink} size={200} />
              </div>

              <div className="text-center mb-3">
                <p className="text-sm text-gray-600 mb-1">{t('room.code')}:</p>
                <p className="font-mono text-lg font-bold">{createdRoom.code}</p>
              </div>

              <button
                onClick={handleJoinConversation}
                className="w-full p-2 bg-blue-500 hover:bg-blue-600 text-white rounded font-medium"
              >
                {t('room.enter')}
              </button>
            </div>

            <button
              onClick={() => setCreatedRoom(null)}
              className="text-gray-500 hover:text-gray-700 text-sm"
            >
              ← {t('room.startNew')}
            </button>
          </div>
        )}

        {showScanner && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white p-4 rounded-lg max-w-sm w-full mx-4">
              <h3 className="text-lg font-semibold mb-4 text-center">{t('room.scanTitle')}</h3>
              <div id="qr-reader" className="w-full"></div>
              <button
                onClick={() => setShowScanner(false)}
                className="w-full mt-4 p-2 bg-gray-500 text-white rounded"
              >
                {t('common.cancel')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
