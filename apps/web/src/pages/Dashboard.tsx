// Live Translator Dashboard
import { useNavigate } from "react-router-dom";
import { QRCodeCanvas } from "qrcode.react";
import { useAuth } from "@/lib/auth";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { usePwaInstallPrompt } from "@/lib/usePwaInstallPrompt";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useQRScanner } from "@/lib/useQRScanner";
import { useGuestMode } from "@/lib/useGuestMode";
import { usePwaBanner } from "@/lib/usePwaBanner";
import { useDashboardRoomCreation } from "@/lib/useDashboardRoomCreation";
import { useDashboardRoomJoin } from "@/lib/useDashboardRoomJoin";
import { useRecentRooms } from "@/lib/useRecentRooms";
import { useClipboard } from "@/lib/useClipboard";

const Dashboard = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const isIOS = typeof navigator !== 'undefined' && /iPhone|iPad|iPod/i.test(navigator.userAgent);
  const { canPrompt, promptToInstall } = usePwaInstallPrompt();

  // Custom hooks
  const {
    createdRoom,
    createRoomMutation,
    handleStartConversation: baseHandleStartConversation,
    handleJoinConversation,
    resetRoom
  } = useDashboardRoomCreation(isAuthenticated);

  const {
    manualCode,
    setManualCode,
    isJoining,
    joinRoomMutation,
    manualCodeInputRef,
    handleManualJoin: baseHandleManualJoin,
    handleRecentJoin: baseHandleRecentJoin
  } = useDashboardRoomJoin(isAuthenticated);

  const {
    showScanner,
    permissionStatus,
    isScanning,
    handleRequestPermission,
    handleScanQR: baseHandleScanQR,
    closeScanner
  } = useQRScanner();

  const {
    isGuestDialogOpen,
    setIsGuestDialogOpen,
    guestName,
    setGuestName,
    pendingAction,
    setPendingAction,
    handleGuestSubmit
  } = useGuestMode();

  const { recentRooms } = useRecentRooms();
  const { shouldShowPwaBanner, dismissPwaBannerForever, platform } = usePwaBanner();
  const { handleCopy } = useClipboard();

  // Event handlers
  const handleStartConversation = () => {
    if (!isAuthenticated) {
      setPendingAction('create');
      setIsGuestDialogOpen(true);
      return;
    }
    baseHandleStartConversation();
  };

  const handleScanQR = () => {
    if (!isAuthenticated) {
      setPendingAction('scan');
      setIsGuestDialogOpen(true);
      return;
    }
    baseHandleScanQR();
  };

  const handleManualJoin = () => {
    if (!isAuthenticated) {
      setPendingAction('join');
      setIsGuestDialogOpen(true);
      return;
    }
    baseHandleManualJoin();
  };

  const handleRecentJoin = (code: string) => {
    setManualCode(code);
    if (!isAuthenticated) {
      setPendingAction('join');
      setIsGuestDialogOpen(true);
      return;
    }
    baseHandleRecentJoin(code);
  };

  const handleGuestSubmitWrapper = async (e: React.FormEvent) => {
    await handleGuestSubmit(e);

    // Perform pending action after successful guest login
    if (pendingAction === 'create') {
      baseHandleStartConversation();
    } else if (pendingAction === 'scan') {
      baseHandleScanQR();
    } else if (pendingAction === 'join') {
      baseHandleManualJoin();
    }
  };

  const openAppSettings = () => {
    if (isIOS) {
      window.location.href = 'app-settings:';
    }
  };

  const displayedRecentRooms = recentRooms.slice(0, 2);

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-md mx-auto">
        <div className="text-center">
          <h1 className="mb-3 text-4xl font-bold tracking-tight">{t("app.name")}</h1>
          <p className="text-base text-muted-foreground mb-8">{t("app.description")}</p>
        </div>

        {shouldShowPwaBanner && (
          <Card>
            <div className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold">{t('pwa.installTitle', 'Install the app')}</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    {t('pwa.installDescription', 'Get a faster, full-screen experience and quick access from your home screen.')}
                  </p>
                </div>
                <Button type="button" variant="ghost" size="sm" onClick={dismissPwaBannerForever}>
                  {t('common.close', 'Close')}
                </Button>
              </div>

              {platform === "ios" ? (
                <div className="mt-3 text-sm">
                  <div className="text-muted-foreground">{t('pwa.iosStep1', '1. Tap Share')}</div>
                  <div className="text-muted-foreground">{t('pwa.iosStep2', '2. Tap Add to Home Screen')}</div>
                  <div className="mt-3">
                    <Button type="button" variant="outline" size="sm" className="w-full" onClick={dismissPwaBannerForever}>
                      {t('pwa.gotIt', 'Got it')}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="mt-3">
                  {canPrompt ? (
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        className="flex-1"
                        onClick={async () => {
                          await promptToInstall();
                          dismissPwaBannerForever();
                        }}
                      >
                        {t('pwa.install', 'Install')}
                      </Button>
                      <Button type="button" variant="outline" size="sm" className="flex-1" onClick={dismissPwaBannerForever}>
                        {t('pwa.notNow', 'Not now')}
                      </Button>
                    </div>
                  ) : (
                    <div className="text-sm">
                      <div className="text-muted-foreground">{t('pwa.androidHint', 'Open your browser menu and tap Install app or Add to Home screen.')}</div>
                      <div className="mt-3">
                        <Button type="button" variant="outline" size="sm" className="w-full" onClick={dismissPwaBannerForever}>
                          {t('pwa.gotIt', 'Got it')}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </Card>
        )}

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
                     disabled={isScanning || permissionStatus === 'checking'}
                     className="w-full"
                     variant="secondary"
                     size="lg"
                   >
                     {isScanning || permissionStatus === 'checking' ? t("room.joining") : t("room.scan")}
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

            <Button type="button" variant="ghost" onClick={resetRoom}>
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
                         onClick={closeScanner}
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
                         onClick={closeScanner}
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
                       onClick={closeScanner}
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
             <form onSubmit={handleGuestSubmitWrapper} className="space-y-4 py-4">
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

      </div>
    </div>
  );
};

export default Dashboard;
