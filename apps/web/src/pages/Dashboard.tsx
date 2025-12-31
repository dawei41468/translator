// Live Translator Dashboard
import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useCreateRoom, useJoinRoom } from "@/lib/hooks";
import { toast } from "sonner";
import { Html5QrcodeScanner } from "html5-qrcode";
import { QRCodeCanvas } from "qrcode.react";
import { useAuth } from "@/lib/auth";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

const Dashboard = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [createdRoom, setCreatedRoom] = useState<{ code: string; id: string } | null>(null);
  const [showScanner, setShowScanner] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);

  const createRoomMutation = useCreateRoom();
  const joinRoomMutation = useJoinRoom();

  const handleStartConversation = () => {
    createRoomMutation.mutate(undefined, {
      onSuccess: (data) => {
        setCreatedRoom({ code: data.roomCode, id: data.roomId });
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

  const clipboardSupported =
    typeof navigator !== "undefined" &&
    "clipboard" in navigator &&
    typeof navigator.clipboard?.writeText === "function";

  const shareSupported =
    typeof navigator !== "undefined" &&
    typeof (navigator as any).share === "function";

  const handleCopy = async (text: string) => {
    if (!clipboardSupported) {
      toast.error(t("toast.copyFailed"));
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      toast.success(t("toast.copied"));
    } catch {
      toast.error(t("toast.copyFailed"));
    }
  };

  const handleShareInvite = async () => {
    if (!createdRoom) return;

    if (!shareSupported) {
      await handleCopy(shareableLink);
      return;
    }

    try {
      await (navigator as any).share({
        title: t("room.createdTitle"),
        text: `${t("room.code")}: ${createdRoom.code}`,
        url: shareableLink,
      });
    } catch {
      toast.error(t("toast.shareFailed"));
    }
  };

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
      <div className="max-w-md mx-auto">
        <div className="text-center">
          <h1 className="mb-3 text-4xl font-bold tracking-tight">{t("app.name")}</h1>
          <p className="text-base text-muted-foreground mb-8">{t("app.description")}</p>
        </div>

        {!createdRoom ? (
          <>
            <p className="text-sm text-muted-foreground mb-6 text-center">
              {t("room.startPrompt")}
            </p>

            <Button
              onClick={handleStartConversation}
              disabled={createRoomMutation.isPending}
              className="w-full"
              size="lg"
            >
              {createRoomMutation.isPending ? t("room.creating") : t("room.create")}
            </Button>

            <div className="border-t pt-6 mt-8">
              <h3 className="font-semibold mb-4 text-center">{t("room.joinExisting")}</h3>

              <Button
                onClick={handleScanQR}
                disabled={!isAuthenticated}
                className="w-full"
                variant="secondary"
                size="lg"
              >
                {t("room.scan")}
              </Button>

              <div className="text-center mb-4">
                <span className="text-muted-foreground">{t("common.or")}</span>
              </div>

              <div className="space-y-2">
                <input
                  type="text"
                  value={manualCode}
                  onChange={(e) => setManualCode(e.target.value.toUpperCase())}
                  placeholder={t("room.enterCodePlaceholder")}
                  className="w-full h-11 px-3 border border-input bg-background rounded-md text-center font-mono tracking-wider"
                  maxLength={7}
                  disabled={!isAuthenticated}
                />
                <Button
                  onClick={handleManualJoin}
                  disabled={!isAuthenticated || !manualCode.trim() || joinRoomMutation.isPending}
                  className="w-full"
                  size="lg"
                >
                  {joinRoomMutation.isPending ? t("room.joining") : t("room.joinByCode")}
                </Button>
              </div>

              {!isAuthenticated && (
                <p className="text-sm text-muted-foreground mt-4 text-center">
                  {t("auth.loginToJoin")}
                </p>
              )}
            </div>
          </>
        ) : (
          <div className="space-y-4">
            <div className="border rounded-xl bg-card text-card-foreground shadow-sm p-5">
              <div className="text-center">
                <h3 className="text-lg font-semibold mb-1">{t("room.createdTitle")}</h3>
                <p className="text-sm text-muted-foreground mb-4">{t("room.waitingPrompt")}</p>
              </div>

              <div className="rounded-lg border bg-background p-4 text-center">
                <div className="text-xs text-muted-foreground mb-1">{t("room.code")}</div>
                <div className="font-mono text-2xl font-bold tracking-widest">{createdRoom.code}</div>

                <div className="grid grid-cols-2 gap-2 mt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleCopy(createdRoom.code)}
                  >
                    {t("room.copyCode")}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleShareInvite}
                    disabled={!shareSupported && !clipboardSupported}
                  >
                    {t("room.share")}
                  </Button>
                </div>
              </div>

              <div className="space-y-2 mt-4">
                <Button type="button" className="w-full" size="lg" onClick={() => setShowQr(true)}>
                  {t("room.showQrButton")}
                </Button>
                <Button type="button" className="w-full" variant="secondary" size="lg" onClick={handleJoinConversation}>
                  {t("room.enter")}
                </Button>
              </div>
            </div>

            <Button type="button" variant="ghost" onClick={() => setCreatedRoom(null)}>
              ← {t("room.startNew")}
            </Button>
          </div>
        )}

        {createdRoom && showQr && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white p-5 rounded-xl max-w-sm w-full mx-4">
              <h3 className="text-lg font-semibold mb-2 text-center">{t("room.qrTitle")}</h3>
              <p className="text-sm text-muted-foreground mb-4 text-center">{t("room.qrDescription")}</p>

              <div className="bg-white p-4 rounded-lg mb-4 flex justify-center border">
                <QRCodeCanvas value={shareableLink} size={240} />
              </div>

              <div className="rounded-lg border bg-background p-4 text-center mb-4">
                <div className="text-xs text-muted-foreground mb-1">{t("room.code")}</div>
                <div className="font-mono text-xl font-bold tracking-widest">{createdRoom.code}</div>
                <div className="grid grid-cols-2 gap-2 mt-3">
                  <Button type="button" variant="outline" onClick={() => handleCopy(createdRoom.code)}>
                    {t("room.copyCode")}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => handleCopy(shareableLink)} disabled={!clipboardSupported}>
                    {t("room.copyLink")}
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Button type="button" className="w-full" onClick={handleShareInvite} disabled={!shareSupported && !clipboardSupported}>
                  {t("room.share")}
                </Button>
                <Button type="button" className="w-full" variant="secondary" onClick={() => setShowQr(false)}>
                  {t("common.cancel")}
                </Button>
              </div>
            </div>
          </div>
        )}

        {showScanner && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white p-4 rounded-lg max-w-sm w-full mx-4">
              <h3 className="text-lg font-semibold mb-4 text-center">{t("room.scanTitle")}</h3>
              <div id="qr-reader" className="w-full"></div>
              <Button
                onClick={() => setShowScanner(false)}
                className="w-full mt-4"
                variant="secondary"
              >
                {t("common.cancel")}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
