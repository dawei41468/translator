import { Button } from "@/components/ui/button";
import { Volume2, VolumeX, Settings, LogOut, Copy, Check, Users } from "lucide-react";
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
import { formatLanguageLabel, LANGUAGES } from "@/lib/languages";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { ConnectionStatus } from "../types";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { StatusIndicator, ParticipantStatus } from "@/components/StatusIndicator";

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
  participants: Array<{
    id: string;
    name: string | null;
    language: string | null;
    status?: ParticipantStatus;
    lastSeen?: Date;
  }>;
  currentUserId: string | undefined;
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
  participants,
  currentUserId,
}: RoomHeaderProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const participantsCount = participants.length;
  const sortedParticipants = useMemo(() => {
    if (!currentUserId) return participants;

    const list = [...participants];
    list.sort((a, b) => {
      const aIsYou = a.id === currentUserId;
      const bIsYou = b.id === currentUserId;
      if (aIsYou === bIsYou) return 0;
      return aIsYou ? -1 : 1;
    });
    return list;
  }, [currentUserId, participants]);

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

  return (
    <header className="p-4 flex items-center justify-between border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-10">
      {/* Left: Status Indicator */}
      <div className="flex items-center gap-1">
        <Dialog>
          <DialogTrigger asChild>
            <Button
              variant="ghost"
              className="flex items-center gap-2 px-2 -ml-2 rounded-full"
              aria-label={t('room.qrTitle')}
            >
              <div className={`h-2.5 w-2.5 rounded-full ${getConnectionColor(connectionStatus)} animate-pulse`} aria-hidden="true" />
              <span className="text-sm font-medium text-foreground/80 font-mono tracking-widest">
                {roomCode}
              </span>
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

        <Dialog>
          <DialogTrigger asChild>
            <Button
              variant="ghost"
              className="rounded-full text-muted-foreground hover:text-foreground px-2"
              aria-label={t('participants.buttonLabel', { count: participantsCount, defaultValue: 'Participants ({{count}})' })}
            >
              <Users className="h-5 w-5" />
              <span className="text-xs tabular-nums">({participantsCount})</span>
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>{t('participants.title', 'Participants')}</DialogTitle>
              <DialogDescription>
                {t('participants.count', { count: participantsCount, defaultValue: '{{count}} participants' })}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-2 py-2">
              {sortedParticipants.map((p) => {
                const isYou = Boolean(currentUserId) && p.id === currentUserId;
                const language = LANGUAGES.find((l) => l.code === p.language);
                const name = p.name ?? t('participants.unknownName', 'Unknown');
                const languageLabel = language ? formatLanguageLabel(language) : t('participants.unknownLanguage', 'Unknown language');

                return (
                  <div key={p.id} className="flex items-center justify-between gap-3" data-testid="participant-row">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">
                        {name}{isYou ? ` (${t('participants.you', 'You')})` : ''}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">{languageLabel}</div>
                    </div>
                    <StatusIndicator
                      status={p.status || 'active'}
                      lastSeen={p.lastSeen ? new Date(p.lastSeen) : undefined}
                    />
                  </div>
                );
              })}
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Right: Controls */}
      <div className="flex items-center gap-2">
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
                        {formatLanguageLabel(lang)}
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
                              {formatLanguageLabel(lang)}
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

        <Button
          variant="ghost"
          size="icon"
          onClick={toggleAudio}
          className={cn(
            "rounded-full text-muted-foreground hover:text-foreground relative",
            !audioEnabled ? "bg-muted/60" : "",
            "hover:bg-transparent",
            "active:bg-accent active:text-accent-foreground",
            "[@media(hover:hover)]:hover:bg-accent [@media(hover:hover)]:hover:text-accent-foreground"
          )}
          aria-label={audioEnabled ? t('conversation.audioOn') : t('conversation.audioOff')}
        >
          {audioEnabled ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
        </Button>

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
