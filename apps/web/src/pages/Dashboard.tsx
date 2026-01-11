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
import { Card } from "@/components/ui/card";
import { addRecentRoom, getRecentRooms } from "@/lib/recentRooms";
import { DashboardQuickActionsFab } from "./dashboard/DashboardQuickActionsFab";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

const Dashboard = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isAuthenticated, loginAsGuest } = useAuth();
  const isIOS = typeof navigator !== 'undefined' && /iPhone|iPad|iPod/i.test(navigator.userAgent);
  const [createdRoom, setCreatedRoom] = useState<{ code: string; id: string } | null>(null);
  const [showScanner, setShowScanner] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<'checking' | 'granted' | 'denied' | 'prompt'>('checking');
  const [isScanning, setIsScanning] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [recentRooms, setRecentRooms] = useState(() => getRecentRooms());
  const manualCodeInputRef = useRef<HTMLInputElement>(null);

  // Guest mode state
  const [isGuestDialogOpen, setIsGuestDialogOpen] = useState(false);
  const [guestName, setGuestName] = useState("");
  const [pendingAction, setPendingAction] = useState<'create' | 'join' | 'scan' | null>(null);

  const scannerStatusRef = useRef<'idle' | 'starting' | 'running' | 'stopping'>('idle');
  const stopPromiseRef = useRef<Promise<void> | null>(null);
  const isJoiningRef = useRef(isJoining);

  useEffect(() => {
    isJoiningRef.current = isJoining;
  }, [isJoining]);

  const createRoomMutation = useCreateRoom();
  const joinRoomMutation = useJoinRoom();

  const performCreateRoom = () => {
    createRoomMutation.mutate(undefined, {
      onSuccess: (data) => {
        setCreatedRoom({ code: data.roomCode, id: data.roomId });
        addRecentRoom(data.roomCode);
        setRecentRooms(getRecentRooms());
      },
      onError: (error) => {
        console.error('Room creation failed:', error);
      }
    });
  };

  const handleStartConversation = () => {
    if (!isAuthenticated) {
      setPendingAction('create');
      setIsGuestDialogOpen(true);
      return;
    }
    performCreateRoom();
  };

  const handleJoinConversation = () => {
    if (createdRoom) {
      navigate(`/room/${createdRoom.code}`);
    }
  };

  const handleScanQR = async () => {
    if (!isAuthenticated) {
      setPendingAction('scan');
      setIsGuestDialogOpen(true);
      return;
    }

    setShowScanner(true);
    setPermissionStatus('prompt');
  };

  const handleManualJoin = () => {
    if (!isAuthenticated) {
      setPendingAction('join');
      setIsGuestDialogOpen(true);
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

  const handleRecentJoin = (code: string) => {
    const normalized = code.trim().toUpperCase();
    if (!normalized) return;

    setManualCode(normalized);

    if (!isAuthenticated) {
      setPendingAction('join');
      setIsGuestDialogOpen(true);
      return;
    }

    if (isJoining) return;
    setIsJoining(true);
    joinRoomMutation.mutate(normalized, {
      onSettled: () => {
        setIsJoining(false);
      }
    });
  };

  const handleGuestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!guestName.trim()) return;

    try {
      await loginAsGuest(guestName);
      setIsGuestDialogOpen(false);
      
      // Perform pending action
      if (pendingAction === 'create') {
        performCreateRoom();
      } else if (pendingAction === 'scan') {
        setShowScanner(true);
        setPermissionStatus('prompt');
      } else if (pendingAction === 'join') {
        if (isJoining) return;
        setIsJoining(true);
        joinRoomMutation.mutate(manualCode.toUpperCase(), {
          onSettled: () => {
            setIsJoining(false);
          }
        });
      }
    } catch (error) {
      toast.error(t('auth.guestLoginFailed', 'Failed to join as guest'));
    }
  };

  const openAppSettings = () => {
    if (isIOS) {
      window.location.href = 'app-settings:';
    }
  };

  const safeStopScanner = () => {
    const current = scannerRef.current;
    if (!current) {
      scannerStatusRef.current = 'idle';
      return Promise.resolve();
    }

    if (scannerStatusRef.current === 'idle') {
      return Promise.resolve();
    }

    if (scannerStatusRef.current === 'stopping') {
      return stopPromiseRef.current ?? Promise.resolve();
    }

    scannerStatusRef.current = 'stopping';

    const p = (async () => {
      try {
        await Promise.resolve(current.stop());
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        if (!msg.includes('not running') && !msg.includes('already under transition')) {
          console.warn('Failed to stop QR scanner:', error);
        }
      }

      try {
        await Promise.resolve((current as any).clear?.());
      } catch {
        // ignore
      }

      if (scannerRef.current === current) {
        scannerRef.current = null;
      }
      scannerStatusRef.current = 'idle';
    })();

    stopPromiseRef.current = p;
    return p.finally(() => {
      if (stopPromiseRef.current === p) stopPromiseRef.current = null;
    });
  };

  const initializeScanner = () => {
    if (scannerRef.current) return;

    scannerRef.current = new Html5Qrcode("qr-reader");

    if (scannerStatusRef.current === 'starting' || scannerStatusRef.current === 'running') return;
    scannerStatusRef.current = 'starting';

    scannerRef.current.start(
      { facingMode: "environment" }, // Prefer back camera
      {
        fps: 10,
        qrbox: { width: 250, height: 250 }
      },
      (decodedText: string) => {
          // Prevent multiple join attempts
          if (isJoiningRef.current) {
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

          // Stop the scanner immediately to prevent multiple detections
          void safeStopScanner();

          joinRoomMutation.mutate(code, {
            onSuccess: () => {
              setShowScanner(false);
              setIsScanning(false);
              setIsJoining(false);
            },
            onError: (error) => {
              console.error('Failed to join room:', error);
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
      // If the scanner was stopped/unmounted while start() was in-flight, ignore.
      if (!scannerRef.current) return;
      scannerStatusRef.current = 'running';
    }).catch((error: any) => {
      // If the scanner was stopped/unmounted while start() was in-flight, ignore.
      if (!scannerRef.current) return;
      console.error('Failed to start QR scanner:', error);
      setPermissionStatus('denied');
      setIsScanning(false);
      scannerStatusRef.current = 'idle';
    });
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

    } catch (error) {
      console.error('Camera permission error:', error);
      setPermissionStatus('denied');
    }
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
    return () => {
      void safeStopScanner();
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (showScanner) return;

    void safeStopScanner();
    setIsScanning(false);
    setPermissionStatus('checking');
    setIsJoining(false);
  }, [showScanner]);

  useEffect(() => {
    if (!showScanner) return;
    if (permissionStatus !== 'granted' || !isScanning) return;
    if (scannerRef.current) return;

    initializeScanner();
  }, [showScanner, permissionStatus, isScanning]);

  const displayedRecentRooms = recentRooms.slice(0, 2);

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-md mx-auto">
        <div className="text-center">
          <h1 className="mb-3 text-4xl font-bold tracking-tight">{t("app.name")}</h1>
          <p className="text-base text-muted-foreground mb-8">{t("app.description")}</p>
        </div>

        {!createdRoom ? (
          <div className="space-y-4">
            {displayedRecentRooms.length > 0 && (
              <Card>
                <div className="p-4">
                  <h3 className="font-semibold mb-3">{t('room.recentRooms', 'Recent rooms')}</h3>
                  <div className="flex flex-col gap-2">
                    {displayedRecentRooms.map((r) => (
                      <Button
                        key={r.code}
                        type="button"
                        variant="outline"
                        className="w-full justify-between font-mono"
                        onClick={() => handleRecentJoin(r.code)}
                      >
                        <span>{r.code}</span>
                        <span className="font-sans text-xs text-muted-foreground">{t('room.join', 'Join')}</span>
                      </Button>
                    ))}
                  </div>
                </div>
              </Card>
            )}

            <Card>
              <div className="p-4">
                <p className="text-sm text-muted-foreground mb-6 text-center">
                  {t("room.startPrompt")}
                </p>

                <Button
                  onClick={handleStartConversation}
                  disabled={createRoomMutation.isPending}
                  className="w-full"
                  size="lg"
                  data-testid="create-room-button"
                >
                  {createRoomMutation.isPending ? t("room.creating") : t("room.create")}
                </Button>
              </div>
            </Card>

            <Card>
              <div className="p-4">
                <h3 className="font-semibold mb-4 text-center">{t("room.joinExisting")}</h3>

                <Button
                  onClick={handleScanQR}
                  disabled={isJoining}
                  className="w-full"
                  variant="secondary"
                  size="lg"
                >
                  {isJoining ? t("room.joining") : t("room.scan")}
                </Button>

                <div className="text-center my-4">
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
                    data-testid="room-code-input"
                    ref={manualCodeInputRef}
                  />
                  <Button
                    onClick={handleManualJoin}
                    disabled={!manualCode.trim() || joinRoomMutation.isPending || isJoining}
                    className="w-full"
                    size="lg"
                    data-testid="join-room-button"
                  >
                    {joinRoomMutation.isPending || isJoining ? t("room.joining") : t("room.joinByCode")}
                  </Button>
                </div>

                {!isAuthenticated && (
                  <div className="mt-6 pt-4 border-t text-center">
                     <p className="text-sm text-muted-foreground mb-3">
                       {t("auth.haveAccount", "Have an account?")}
                     </p>
                     <Button variant="outline" size="sm" onClick={() => navigate("/login")} className="w-full">
                       {t("auth.login", "Log in")}
                     </Button>
                  </div>
                )}
              </div>
            </Card>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="border rounded-xl bg-card text-card-foreground shadow-sm p-4">
              <div className="text-center">
                <h3 className="text-lg font-semibold mb-1">{t("room.createdTitle")}</h3>
                <p className="text-sm text-muted-foreground mb-2">{t("room.waitingPrompt")}</p>
              </div>

              <div className="bg-background p-3 rounded-lg mb-3 flex justify-center border" aria-label={t("room.qrCodeAlt")}
              >
                <QRCodeCanvas value={createdRoom.code} size={216} bgColor="#ffffff" fgColor="#000000" aria-hidden="true" />
              </div>

              <div className="rounded-lg border bg-background p-3 text-center">
                <div className="text-xs text-muted-foreground mb-1">{t("room.code")}</div>
                <div className="font-mono text-xl font-bold tracking-widest">{createdRoom.code}</div>

                <div className="mt-3">
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

              <div className="space-y-2 mt-3">
                <Button type="button" className="w-full" variant="secondary" size="lg" onClick={handleJoinConversation} data-testid="enter-room-button">
                  {t("room.enter")}
                </Button>
              </div>
            </div>

            <Button type="button" variant="ghost" onClick={() => setCreatedRoom(null)}>
              ← {t("room.startNew")}
            </Button>
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
                          void safeStopScanner();
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
                      {isIOS && (
                        <Button onClick={openAppSettings} className="w-full">
                          {t('room.goToSettings')}
                        </Button>
                      )}
                      <Button
                        onClick={() => {
                          void safeStopScanner();
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
                        void safeStopScanner();
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

        <Dialog open={isGuestDialogOpen} onOpenChange={setIsGuestDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{t('auth.guestJoin', 'Join as Guest')}</DialogTitle>
              <DialogDescription>
                {t('auth.guestJoinDescription', 'Enter your name to join the conversation without an account.')}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleGuestSubmit} className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="guest-name">{t('auth.displayName', 'Display Name')}</Label>
                <Input
                  id="guest-name"
                  placeholder="e.g. Alice"
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  autoFocus
                  required
                />
              </div>
              <DialogFooter className="flex-col space-y-2 sm:space-y-0">
                <Button type="submit" className="w-full" disabled={!guestName.trim()}>
                  {t('auth.continueAsGuest', 'Continue as Guest')}
                </Button>
                <div className="relative flex items-center justify-center my-4">
                  <span className="bg-background px-2 text-xs text-muted-foreground uppercase">{t('common.or')}</span>
                  <div className="absolute inset-0 flex items-center -z-10">
                    <span className="w-full border-t"></span>
                  </div>
                </div>
                <Button type="button" variant="outline" className="w-full" onClick={() => navigate("/login")}>
                  {t('auth.login', 'Log in')}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <DashboardQuickActionsFab
          onCreate={handleStartConversation}
          onScan={handleScanQR}
          onEnterCode={() => {
            manualCodeInputRef.current?.focus();
          }}
          disabled={createRoomMutation.isPending || isJoining}
        />
      </div>
    </div>
  );
};

export default Dashboard;
