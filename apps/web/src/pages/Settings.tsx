// Live Translator Settings

import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useMe, useUpdateLanguage } from "@/lib/hooks";
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

const LANGUAGES = [
  { code: "en", name: "English" },
  { code: "zh", name: "Chinese (中文)" },
  { code: "it", name: "Italian" },
  { code: "de", name: "German" },
  { code: "nl", name: "Dutch" },
];

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
    <div className="container mx-auto px-4 py-8 pb-20">
      <h1 className="text-2xl font-bold mb-6">{t('nav.settings')}</h1>

      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold mb-2">{t('settings.language.title')}</h2>
          <p className="text-sm text-muted-foreground mb-4">
            {t('settings.language.description')}
          </p>
          <Select
            value={userData?.user?.language || ""}
            onValueChange={handleLanguageChange}
            disabled={updateLanguageMutation.isPending}
          >
            <SelectTrigger className="w-full">
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

        <div>
          <h2 className="text-lg font-semibold mb-2">{t('settings.tts.title')}</h2>
          <p className="text-sm text-muted-foreground mb-4">
            {t('settings.tts.description')}
          </p>
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-medium">{t("settings.tts.enable")}</div>
              <div className="text-xs text-muted-foreground">{t("settings.tts.enableDescription")}</div>
            </div>
            <Button type="button" variant={ttsEnabled ? "default" : "outline"} onClick={handleToggleTts}>
              {ttsEnabled ? t("settings.tts.enabled") : t("settings.tts.disabled")}
            </Button>
          </div>
        </div>

        <div className="pt-6 border-t">
          <Button
            variant="destructive"
            onClick={logout}
            className="w-full"
          >
            {t('auth.logout')}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Settings;