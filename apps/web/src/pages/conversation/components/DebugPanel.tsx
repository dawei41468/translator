import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";
import { S2SStatus } from "../types";

interface DebugPanelProps {
  isDebugEnabled: boolean;
  debugPanelExpanded: boolean;
  setDebugPanelExpanded: (expanded: boolean) => void;
  s2SStatus: S2SStatus;
}

export function DebugPanel({
  isDebugEnabled,
  debugPanelExpanded,
  setDebugPanelExpanded,
  s2SStatus,
}: DebugPanelProps) {
  const { t } = useTranslation();

  if (!isDebugEnabled) return null;

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

          <div className="border-t pt-2">
            <div className="font-medium text-blue-600 mb-1">S2S:</div>
            <div>Recording: {s2SStatus.isRecording ? 'Yes' : 'No'} | Lang: {s2SStatus.language}</div>
            {s2SStatus.lastAttempt && <div>Last: {s2SStatus.lastAttempt}</div>}
            {s2SStatus.lastError && <div className="text-red-600">Error: {s2SStatus.lastError}</div>}
          </div>
        </div>
      )}
    </div>
  );
}
