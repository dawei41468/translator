import { Button } from "@/components/ui/button";
import { Mic, MicOff } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LANGUAGES } from "@/lib/languages";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

interface ConversationControlsProps {
  isRecording: boolean;
  toggleRecording: () => void;
  connectionStatus: string;
  soloMode: boolean;
  toggleSoloMode: () => void;
  soloTargetLang: string;
  onSoloLangChange: (lang: string) => void;
  userLanguage: string | undefined;
}

export function ConversationControls({
  isRecording,
  toggleRecording,
  connectionStatus,
  soloMode,
  toggleSoloMode,
  soloTargetLang,
  onSoloLangChange,
  userLanguage,
}: ConversationControlsProps) {
  const { t } = useTranslation();

  return (
    <footer className="fixed bottom-0 left-0 right-0 z-10 bg-background border-t p-4 pb-8 sm:p-6 overscroll-contain touch-none" role="contentinfo">
      <Button
        type="button"
        variant={soloMode ? "default" : "outline"}
        size="sm"
        onClick={toggleSoloMode}
        aria-pressed={soloMode}
        aria-label={t('conversation.soloMode')}
        className="absolute bottom-4 left-4"
        data-testid="toggle-solo-mode"
      >
        Solo
      </Button>

      <div className="mb-4 flex flex-col items-center gap-3">
        {soloMode && (
          <div className="flex items-center justify-center gap-3">
            <label htmlFor="solo-language-select" className="sr-only">{t('conversation.translateTo')}</label>
            <Select
              value={soloTargetLang}
              onValueChange={onSoloLangChange}
            >
              <SelectTrigger id="solo-language-select" className="h-9 w-44" aria-label={t('conversation.translateTo')} data-testid="solo-language-select">
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
          </div>
        )}
        {soloMode && (
          <p className="text-center text-xs text-muted-foreground" id="solo-mode-description" role="note">
            {t('conversation.soloModeHint')}
          </p>
        )}
      </div>

      <div className="flex justify-center">
        <Button
          type="button"
          onClick={toggleRecording}
          disabled={connectionStatus !== 'connected'}
          variant={isRecording ? "destructive" : "default"}
          size="lg"
          className={cn(
            "h-16 w-16 rounded-full shadow-lg transition-all focus:ring-4 focus:ring-primary/20",
            isRecording ? "animate-pulse scale-110" : "hover:scale-105"
          )}
          aria-pressed={isRecording}
          aria-label={isRecording ? t('conversation.stopSpeaking') : t('conversation.startSpeaking')}
          data-testid="toggle-recording"
        >
          {isRecording ? <MicOff className="h-8 w-8" /> : <Mic className="h-8 w-8" />}
        </Button>
      </div>
    </footer>
  );
}
