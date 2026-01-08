import { Button } from "@/components/ui/button";
import { Volume2, VolumeX } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LANGUAGES } from "@/lib/languages";
import { useTranslation } from "react-i18next";
import { ConnectionStatus } from "../types";

interface RoomHeaderProps {
  roomCode: string;
  connectionStatus: ConnectionStatus;
  audioEnabled: boolean;
  toggleAudio: () => void;
  onLeave: () => void;
  onRoomCodeClick: () => void;
  userLanguage: string | undefined;
  onUpdateLanguage: (lang: string) => void;
  isUpdatingLanguage: boolean;
}

export function RoomHeader({
  roomCode,
  connectionStatus,
  audioEnabled,
  toggleAudio,
  onLeave,
  onRoomCodeClick,
  userLanguage,
  onUpdateLanguage,
  isUpdatingLanguage,
}: RoomHeaderProps) {
  const { t } = useTranslation();

  return (
    <header className="p-4 pt-5 sm:p-6 sm:pt-7" role="banner">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onRoomCodeClick}
            className="inline-flex items-center gap-2 rounded-full bg-muted px-3 py-1 hover:bg-muted/80 transition-colors"
            aria-label={t('room.code')}
            data-testid="room-code-badge"
          >
            <div className={`h-2.5 w-2.5 rounded-full ${
              connectionStatus === 'connected' ? 'bg-green-500' :
              connectionStatus === 'connecting' ? 'bg-yellow-500' :
              connectionStatus === 'reconnecting' ? 'bg-orange-500' :
              'bg-red-500'
            }`} aria-hidden="true"></div>
            <span className="text-sm font-medium">{t('room.code')}: {roomCode}</span>
          </button>
          {connectionStatus === 'reconnecting' && (
            <span className="text-sm text-muted-foreground" aria-live="polite">{t('conversation.reconnecting')}...</span>
          )}
        </div>
        <div className="flex items-center space-x-2" role="toolbar" aria-label={t('conversation.controls')}>
          <Button
            type="button"
            variant={audioEnabled ? "default" : "outline"}
            onClick={toggleAudio}
            aria-label={audioEnabled ? t('conversation.audioOn') : t('conversation.audioOff')}
            aria-pressed={audioEnabled}
            size="icon"
            data-testid="toggle-audio"
          >
            {audioEnabled ? <Volume2 /> : <VolumeX />}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={onLeave}
            aria-label={t('common.leave')}
            data-testid="leave-room"
          >
            {t('common.leave')}
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <Select
          value={userLanguage || ""}
          onValueChange={onUpdateLanguage}
          disabled={isUpdatingLanguage}
        >
          <SelectTrigger className="h-9 w-44" aria-label={t('settings.language.title')} data-testid="user-language-select">
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
        <p className="text-xs text-muted-foreground max-w-xs ml-4">
          {t('conversation.languageDescription', 'Select your language for speech recognition and translations')}
        </p>
      </div>
    </header>
  );
}
