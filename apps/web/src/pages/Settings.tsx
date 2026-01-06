// Live Translator Settings

import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useMe, useUpdateLanguage } from "@/lib/hooks";
import { LANGUAGES } from "@/lib/languages";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const TTS_ENABLED_STORAGE_KEY = "translator_tts_enabled";

const Settings = () => {
  const { t } = useTranslation();
  const { logout } = useAuth();

  const [ttsEnabled, setTtsEnabled] = useState(() => {
    try {
      const stored = localStorage.getItem(TTS_ENABLED_STORAGE_KEY);
      if (stored === null) return true;
      return stored === "true";
    } catch {
      return true;
    }
  });

  // Get current user data using centralized hook
  const { data: userData } = useMe();

  // Update language mutation using centralized hook
  const updateLanguageMutation = useUpdateLanguage();

  const handleLanguageChange = (languageCode: string) => {
    updateLanguageMutation.mutate(languageCode);
  };

  const handleToggleTts = () => {
    setTtsEnabled((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(TTS_ENABLED_STORAGE_KEY, String(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-10 pb-24">
        <div className="max-w-xl mx-auto">
          <h1 className="text-3xl font-bold tracking-tight mb-6">{t('nav.settings')}</h1>

          <div className="space-y-6">
            <div className="border rounded-xl bg-card text-card-foreground shadow-sm p-5">
              <h2 className="text-lg font-semibold mb-2">{t('settings.language.title')}</h2>
              <p className="text-sm text-muted-foreground mb-4">
                {t('settings.language.description')}
              </p>
              <Select
                value={userData?.user?.language || ""}
                onValueChange={handleLanguageChange}
                disabled={updateLanguageMutation.isPending}
              >
                <SelectTrigger className="w-full h-11">
                  <SelectValue placeholder={t('settings.language.placeholder')} />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map((lang) => (
                    <SelectItem key={lang.code} value={lang.code}>
                      {lang.name} ({lang.code.toUpperCase()})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="border rounded-xl bg-card text-card-foreground shadow-sm p-5">
              <h2 className="text-lg font-semibold mb-2">{t('settings.tts.title')}</h2>
              <p className="text-sm text-muted-foreground mb-4">
                {t('settings.tts.description')}
              </p>
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="text-sm font-medium">{t("settings.tts.enable")}</div>
                  <div className="text-xs text-muted-foreground">{t("settings.tts.enableDescription")}</div>
                </div>
                <Button type="button" variant={ttsEnabled ? "default" : "outline"} onClick={handleToggleTts} className="shrink-0" aria-pressed={ttsEnabled} aria-label={ttsEnabled ? t("settings.tts.disableAria") : t("settings.tts.enableAria")}>
                  {ttsEnabled ? t("settings.tts.enabled") : t("settings.tts.disabled")}
                </Button>
              </div>
            </div>

            <div className="border rounded-xl bg-card text-card-foreground shadow-sm p-5">
              <Button
                variant="destructive"
                onClick={logout}
                className="w-full"
                size="lg"
              >
                {t('auth.logout')}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;