import { Button } from "@/components/ui/button";
import { Volume2, VolumeX, Settings, LogOut, Copy, Check, QrCode } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { QRCodeCanvas } from "qrcode.react";
import { LANGUAGES } from "@/lib/languages";
import { useTranslation } from "react-i18next";
import { ConnectionStatus } from "../types";
import { useState } from "react";
import { toast } from "sonner";

interface RoomHeaderProps {
  roomCode: string;
  connectionStatus: ConnectionStatus;
  audioEnabled: boolean;
  toggleAudio: () => void;
  onLeave: () => void;
  userLanguage: string | undefined;
  onUpdateLanguage: (lang: string) => void;
  isUpdatingLanguage: boolean;
  isSettingsOpen: boolean;
  onSettingsOpenChange: (open: boolean) => void;
  isRecording: boolean;
  hasOtherParticipants: boolean;
  soloMode: boolean;
  toggleSoloMode: () => void;
  soloTargetLang: string;
  onSoloLangChange: (lang: string) => void;
}

export function RoomHeader({
  roomCode,
  connectionStatus,
  audioEnabled,
  toggleAudio,
  onLeave,
  userLanguage,
  onUpdateLanguage,
  isUpdatingLanguage,
  isSettingsOpen,
  onSettingsOpenChange,
  isRecording,
  hasOtherParticipants,
  soloMode,
  toggleSoloMode,
  soloTargetLang,
  onSoloLangChange,
}: RoomHeaderProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(roomCode);
      setCopied(true);
      toast.success(t('toast.copied'));
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(t('toast.copyFailed'));
    }
  };

  const getConnectionColor = (status: ConnectionStatus) => {
    switch (status) {
      case 'connected': return 'bg-green-500';
      case 'connecting': return 'bg-yellow-500';
      case 'reconnecting': return 'bg-orange-500';
      default: return 'bg-red-500';
    }
  };

  const getConnectionText = (status: ConnectionStatus) => {
    switch (status) {
      case 'connected': return t('connection.connected', 'Live');
      case 'connecting': return t('connection.connecting', 'Connecting...');
      case 'reconnecting': return t('connection.reconnecting', 'Reconnecting...');
      default: return t('connection.disconnected', 'Offline');
    }
  };

  return (
    <header className="p-4 flex items-center justify-between border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-10">
      {/* Left: Status Indicator */}
      <div className="flex items-center gap-2">
        <div className={`h-2.5 w-2.5 rounded-full ${getConnectionColor(connectionStatus)} animate-pulse`} aria-hidden="true" />
        <span className="text-sm font-medium text-foreground/80">
          {getConnectionText(connectionStatus)}
        </span>
      </div>

      {/* Right: Controls */}
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleAudio}
          className="rounded-full text-muted-foreground hover:text-foreground"
          aria-label={audioEnabled ? t('conversation.audioOn') : t('conversation.audioOff')}
        >
          {audioEnabled ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
        </Button>

        <Dialog open={isSettingsOpen} onOpenChange={onSettingsOpenChange}>
          <DialogTrigger asChild>
            <Button variant="ghost" size="icon" className="rounded-full text-muted-foreground hover:text-foreground" aria-label={t('common.settings', 'Settings')}>
              <Settings className="h-5 w-5" />
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{t('room.settings', 'Room Settings')}</DialogTitle>
              <DialogDescription>
                {t('room.settingsDescription', 'Manage language and solo mode.')}
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-6 py-4">
              {/* Language Section */}
              <div className="space-y-3">
                <Label>{t('settings.language.title', 'My Language')}</Label>
                <Select
                  value={userLanguage || ""}
                  onValueChange={onUpdateLanguage}
                  disabled={isUpdatingLanguage}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('conversation.translateTo')} />
                  </SelectTrigger>
                  <SelectContent>
                    {LANGUAGES.map((lang) => (
                      <SelectItem key={lang.code} value={lang.code}>
                        {lang.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {t('conversation.languageDescription', 'Select your language for speech recognition and translations')}
                </p>
              </div>

              {!hasOtherParticipants && (
                <div className="space-y-3">
                  <Label>{t('conversation.soloMode', 'Solo mode')}</Label>
                  <div className="flex items-center gap-3">
                    <Button
                      type="button"
                      variant={soloMode ? "default" : "outline"}
                      size="sm"
                      onClick={toggleSoloMode}
                      aria-pressed={soloMode}
                      disabled={isRecording}
                      data-testid="toggle-solo-mode"
                    >
                      {t('conversation.soloMode', 'Solo mode')}
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      {t('conversation.onlyParticipantHint')}
                    </p>
                  </div>

                  {soloMode && (
                    <div className="space-y-2">
                      <Label>{t('conversation.translateTo')}</Label>
                      <Select
                        value={soloTargetLang}
                        onValueChange={onSoloLangChange}
                        disabled={isRecording}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={t('conversation.translateTo')} />
                        </SelectTrigger>
                        <SelectContent>
                          {LANGUAGES.filter((lang) => lang.code !== userLanguage).map((lang) => (
                            <SelectItem key={lang.code} value={lang.code}>
                              {lang.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        {t('conversation.soloModeHint')}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>

        <Dialog>
          <DialogTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full text-muted-foreground hover:text-foreground"
              aria-label={t('room.qrTitle')}
            >
              <QrCode className="h-5 w-5" />
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>{t('room.qrTitle')}</DialogTitle>
              <DialogDescription>
                {t('room.qrDescription')}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2">
              <div className="space-y-2">
                <Label>{t('room.code', 'Room Code')}</Label>
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-muted/50 p-2 rounded-md font-mono text-center text-sm tracking-widest border">
                    {roomCode}
                  </div>
                  <Button size="icon" variant="outline" onClick={handleCopyCode} aria-label={t('room.copyCode', 'Copy room code')}>
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              <div className="flex justify-center p-3 bg-white rounded-lg border">
                <QRCodeCanvas
                  value={`${window.location.origin}/room/${roomCode}`}
                  size={180}
                  bgColor="#ffffff"
                  fgColor="#000000"
                />
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <Button
          variant="ghost"
          size="icon"
          onClick={onLeave}
          className="rounded-full text-destructive hover:text-destructive/90 hover:bg-destructive/10"
          aria-label={t('common.leave')}
        >
          <LogOut className="h-5 w-5" />
        </Button>
      </div>
    </header>
  );
}
