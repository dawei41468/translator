import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";
import { SttStatus, TtsStatus } from "../types";

interface DebugPanelProps {
  isTtsDebugEnabled: boolean;
  debugPanelExpanded: boolean;
  setDebugPanelExpanded: (expanded: boolean) => void;
  sttStatus: SttStatus;
  ttsStatus: TtsStatus;
  refreshVoices: () => void;
}

export function DebugPanel({
  isTtsDebugEnabled,
  debugPanelExpanded,
  setDebugPanelExpanded,
  sttStatus,
  ttsStatus,
  refreshVoices,
}: DebugPanelProps) {
  const { t } = useTranslation();

  if (!isTtsDebugEnabled) return null;

  return (
    <div className="mt-2">
      {!debugPanelExpanded ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setDebugPanelExpanded(true)}
          className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
          aria-label={t('conversation.debugPanelExpand')}
          aria-expanded="false"
        >
          Debug
        </Button>
      ) : (
        <div className="p-2 bg-muted/50 rounded text-xs space-y-2">
          <div className="font-medium flex items-center justify-between">
            <span>Speech Debug:</span>
            <div className="flex gap-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={refreshVoices}
                className="h-6 px-2 text-xs"
                aria-label={t('conversation.debugRefreshVoices')}
              >
                Refresh
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setDebugPanelExpanded(false)}
                className="h-6 px-2 text-xs"
                aria-label={t('conversation.debugPanelCollapse')}
                aria-expanded="true"
              >
                ✕
              </Button>
            </div>
          </div>

          <div className="border-t pt-2">
            <div className="font-medium text-blue-600 mb-1">STT:</div>
            <div>Recording: {sttStatus.isRecording ? 'Yes' : 'No'} | Started: {sttStatus.recognitionStarted ? 'Yes' : 'No'} | Lang: {sttStatus.language}</div>
            <div>Transcripts: {sttStatus.transcriptsReceived}</div>
            {sttStatus.lastAttempt && <div>Last: {sttStatus.lastAttempt}</div>}
            {sttStatus.lastError && <div className="text-red-600">Error: {sttStatus.lastError}</div>}
          </div>

          <div className="border-t pt-2">
            <div className="font-medium text-green-600 mb-1">TTS:</div>
            <div>Voices: {ttsStatus.voicesCount} | Speaking: {ttsStatus.isSpeaking ? 'Yes' : 'No'} | Loaded: {ttsStatus.voicesLoaded ? 'Yes' : 'No'}</div>
            {ttsStatus.lastAttempt && <div>Last: {ttsStatus.lastAttempt}</div>}
            {ttsStatus.lastError && <div className="text-red-600">Error: {ttsStatus.lastError}</div>}
          </div>
        </div>
      )}
    </div>
  );
}
