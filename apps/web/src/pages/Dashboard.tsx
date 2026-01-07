// Live Translator Dashboard
import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useCreateRoom, useJoinRoom } from "@/lib/hooks";
import { toast } from "sonner";
import { Html5Qrcode } from "html5-qrcode";
import { QRCodeCanvas } from "qrcode.react";
import { useAuth } from "@/lib/auth";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const Dashboard = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [createdRoom, setCreatedRoom] = useState<{ code: string; id: string } | null>(null);
  const [showScanner, setShowScanner] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<'checking' | 'granted' | 'denied' | 'prompt'>('checking');
  const [isScanning, setIsScanning] = useState(false);
  const [isJoining, setIsJoining] = useState(false);

  const createRoomMutation = useCreateRoom();
  const joinRoomMutation = useJoinRoom();

  const handleStartConversation = () => {
    createRoomMutation.mutate(undefined, {
      onSuccess: (data) => {
        setCreatedRoom({ code: data.roomCode, id: data.roomId });
        toast.success(t('room.created', 'Room created successfully!'));
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


  const openAppSettings = () => {
    if (navigator.userAgent.match(/iPhone|iPad|iPod/i)) {
      window.location.href = 'app-settings:';
    } else {
      toast.info(t('room.cameraSettingsInstruction'));
    }
  };

  const initializeScanner = () => {
    if (scannerRef.current) return;

    scannerRef.current = new Html5Qrcode("qr-reader");

    scannerRef.current.start(
      { facingMode: "environment" }, // Prefer back camera
      {
        fps: 10,
        qrbox: { width: 250, height: 250 }
      },
      (decodedText: string) => {
          // Prevent multiple join attempts
          if (isJoining) {
            return;
          }

          const input = decodedText.trim();
          if (!input) {
            toast.error(t("error.invalidQR"));
            return;
          }

          let code = input;
          try {
            const url = new URL(input);
            const lastSegment = url.pathname.split("/").filter(Boolean).pop();
            if (lastSegment) {
              code = lastSegment;
            }
          } catch {
            // not a URL, use as-is
          }

          code = code.trim().toUpperCase();
          if (!code || code.length !== 6 || !/^[A-Z0-9]+$/.test(code)) {
            toast.error(t("error.invalidQR"));
            return;
          }

          setIsJoining(true);
          toast.success(t('room.joiningQR', 'Joining room...'));

          // Stop the scanner immediately to prevent multiple detections
          if (scannerRef.current) {
            scannerRef.current.stop().catch(console.error);
          }

          joinRoomMutation.mutate(code, {
            onSuccess: () => {
              toast.success(t('room.joined', 'Joined room successfully!'));
              setShowScanner(false);
              setIsScanning(false);
              setIsJoining(false);
            },
            onError: (error) => {
              console.error('Failed to join room:', error);
              toast.error(t('room.joinFailed', 'Failed to join room'));
              setShowScanner(false);
              setIsScanning(false);
              setIsJoining(false);
            }
          });
        },
      (error: any) => {
        // Ignore scan errors, only log serious issues
        if (!error?.includes && typeof error !== 'string') {
          console.log("QR scan error:", error);
        }
      }
    ).then(() => {
      // QR scanner started successfully
    }).catch((error: any) => {
      console.error('Failed to start QR scanner:', error);
      setPermissionStatus('denied');
      setIsScanning(false);
    });

    // Return cleanup function
    return () => {
      if (scannerRef.current) {
        scannerRef.current.stop().catch(console.error);
      }
    };
  };

  const handleScanQR = async () => {
    if (!isAuthenticated) {
      navigate("/login");
      return;
    }

    setShowScanner(true);
    setPermissionStatus('prompt');
  };

  const handleRequestPermission = async () => {
    setPermissionStatus('checking');

    try {
      // First, try to get camera access to verify permissions work
      const testStream = await navigator.mediaDevices.getUserMedia({
        video: true
      });
      testStream.getTracks().forEach(track => track.stop()); // Stop test stream

      // If we get here, basic camera access works
      // Now try to initialize the QR scanner
      setPermissionStatus('granted');
      setIsScanning(true);

      // Small delay to ensure state updates
      setTimeout(() => {
        initializeScanner();
      }, 100);

    } catch (error) {
      console.error('Camera permission error:', error);
      setPermissionStatus('denied');
    }
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

  const clipboardSupported =
    typeof navigator !== "undefined" &&
    "clipboard" in navigator &&
    typeof navigator.clipboard?.writeText === "function";

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

  // Initialize QR scanner when permissions are granted
  useEffect(() => {
    let cleanup: (() => void) | undefined;

    if (permissionStatus === 'granted' && isScanning && !scannerRef.current) {
      cleanup = initializeScanner();
    }

    return () => {
      if (cleanup) {
        cleanup();
      }
      if (scannerRef.current) {
        scannerRef.current.stop().catch(console.error);
        scannerRef.current = null;
      }
    };
  }, [permissionStatus, isScanning, joinRoomMutation, t]);

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
                disabled={!isAuthenticated || isJoining}
                className="w-full"
                variant="secondary"
                size="lg"
              >
                {isJoining ? t("room.joining") : t("room.scan")}
              </Button>

              <div className="text-center mb-4">
                <span className="text-muted-foreground">{t("common.or")}</span>
              </div>

              <div className="space-y-2">
                <Input
                  type="text"
                  value={manualCode}
                  onChange={(e) => setManualCode(e.target.value.toUpperCase())}
                  placeholder={t("room.enterCodePlaceholder")}
                  className="text-center font-mono tracking-wider"
                  maxLength={7}
                  disabled={!isAuthenticated}
                />
                <Button
                  onClick={handleManualJoin}
                  disabled={!isAuthenticated || !manualCode.trim() || joinRoomMutation.isPending || isJoining}
                  className="w-full"
                  size="lg"
                >
                  {joinRoomMutation.isPending || isJoining ? t("room.joining") : t("room.joinByCode")}
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

                <div className="mt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleCopy(createdRoom.code)}
                    className="w-full"
                  >
                    {t("room.copyCode")}
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
           <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" role="dialog" aria-modal="true" aria-labelledby="qr-modal-title">
             <div className="border rounded-xl bg-card text-card-foreground shadow-sm p-5 max-w-sm w-full mx-4" role="document">
               <h3 id="qr-modal-title" className="text-lg font-semibold mb-2 text-center">{t("room.qrTitle")}</h3>
               <p className="text-sm text-muted-foreground mb-4 text-center">{t("room.qrDescription")}</p>

               <div className="bg-background p-4 rounded-lg mb-4 flex justify-center border" aria-label={t("room.qrCodeAlt")}>
                 <QRCodeCanvas value={createdRoom.code} size={240} bgColor="#ffffff" fgColor="#000000" aria-hidden="true" />
               </div>

               <div className="rounded-lg border bg-background p-4 text-center mb-4">
                 <div className="text-xs text-muted-foreground mb-1">{t("room.code")}</div>
                 <div className="font-mono text-xl font-bold tracking-widest" aria-label={`${t("room.code")}: ${createdRoom.code}`}>{createdRoom.code}</div>
                 <div className="mt-3">
                   <Button type="button" variant="outline" onClick={() => handleCopy(createdRoom.code)} className="w-full" aria-describedby="copy-instruction">
                     {t("room.copyCode")}
                   </Button>
                   <span id="copy-instruction" className="sr-only">{t("room.copyCodeDesc")}</span>
                 </div>
               </div>

               <div className="space-y-2">
                 <Button type="button" className="w-full" variant="secondary" onClick={() => setShowQr(false)} aria-label={t("common.closeModal")} autoFocus>
                   {t("common.cancel")}
                 </Button>
               </div>
             </div>
           </div>
         )}

        {showScanner && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" role="dialog" aria-modal="true" aria-labelledby="scanner-modal-title">
              <div className="border rounded-xl bg-card text-card-foreground shadow-sm p-4 max-w-sm w-full mx-4" role="document">
                <h3 id="scanner-modal-title" className="text-lg font-semibold mb-4 text-center">{t("room.scanTitle")}</h3>

                {permissionStatus === 'checking' && (
                  <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
                    <p className="text-sm text-muted-foreground">{t('room.checkingPermissions')}</p>
                  </div>
                )}

                {permissionStatus === 'prompt' && (
                  <div className="text-center space-y-4 py-4">
                    <div className="text-4xl mb-4">📷</div>
                    <p className="text-sm">{t('room.cameraPermissionRequired')}</p>
                    <div className="space-y-2">
                      <Button onClick={handleRequestPermission} className="w-full">
                        {t('room.allowCamera')}
                      </Button>
                      <Button
                        onClick={() => {
                          setShowScanner(false);
                          setPermissionStatus('checking');
                          setIsJoining(false);
                        }}
                        variant="outline"
                        className="w-full"
                      >
                        {t('common.cancel')}
                      </Button>
                    </div>
                  </div>
                )}

                {permissionStatus === 'denied' && (
                  <div className="text-center space-y-4 py-4">
                    <div className="text-4xl mb-4">🚫</div>
                    <p className="text-sm font-medium">{t('room.cameraAccessDenied')}</p>
                    <p className="text-xs text-muted-foreground">{t('room.cameraSettingsHelp')}</p>
                    <div className="space-y-2">
                      <Button onClick={openAppSettings} className="w-full">
                        {t('room.goToSettings')}
                      </Button>
                      <Button
                        onClick={() => {
                          setShowScanner(false);
                          setPermissionStatus('checking');
                        }}
                        variant="outline"
                        className="w-full"
                      >
                        {t('common.cancel')}
                      </Button>
                    </div>
                  </div>
                )}

                {permissionStatus === 'granted' && isScanning && (
                  <>
                    <div id="qr-reader" className="w-full" aria-label={t("room.qrScannerAlt")}></div>
                    <Button
                      onClick={() => {
                        setShowScanner(false);
                        setIsScanning(false);
                        setPermissionStatus('checking');
                        setIsJoining(false);
                      }}
                      className="w-full mt-4"
                      variant="secondary"
                      aria-label={t("common.closeModal")}
                      autoFocus
                    >
                      {t("common.cancel")}
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}
      </div>
    </div>
  );
};

export default Dashboard;
