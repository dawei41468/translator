import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useUpdateLanguage } from "@/lib/hooks";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorState } from "@/components/ui/error-state";
import { LANGUAGES } from "@/lib/languages";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { User, Settings, LogOut, Check, Edit } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";

const Profile = () => {
  const { t } = useTranslation();
  const { user, logout, speechEngineRegistry } = useAuth();
  const queryClient = useQueryClient();

  const updateLanguageMutation = useUpdateLanguage();

  const [displayName, setDisplayName] = useState("");
  const [isEditingDisplayName, setIsEditingDisplayName] = useState(false);

  // Update display name when user changes
  useEffect(() => {
    if (user?.displayName) {
      setDisplayName(user.displayName);
    }
  }, [user?.displayName]);

  const updateProfileMutation = useMutation({
    mutationFn: (data: { displayName?: string; language?: string; preferences?: any }) =>
      apiClient.updateMe(data),
    onSuccess: () => {
      toast.success(t('profile.saveSuccess', 'Settings saved successfully'));
      queryClient.invalidateQueries({ queryKey: ['me'] });
      setIsEditingDisplayName(false);
    },
    onError: (error: any) => {
      toast.error(error.data?.error || t('profile.saveError', 'Failed to save settings'));
    },
  });

  const handleSaveDisplayName = () => {
    if (displayName.trim() !== user?.displayName) {
      updateProfileMutation.mutate({ displayName: displayName.trim() || undefined });
    } else {
      setIsEditingDisplayName(false);
    }
  };

  const handleLanguageChange = (language: string) => {
    updateLanguageMutation.mutate(language);
  };

  const handleEnginePreferenceChange = (type: 'stt' | 'tts' | 'translation', engineId: string) => {
    const currentPreferences = user?.preferences || {};
    const newPreferences = {
      ...currentPreferences,
      [type === 'stt' ? 'sttEngine' : type === 'tts' ? 'ttsEngine' : 'translationEngine']: engineId
    };

    // Update database - registry will be recreated automatically
    updateProfileMutation.mutate({ preferences: newPreferences });

    // Log the engine change
    const engineName = speechEngineRegistry.getAvailableSttEngines()
      .concat(speechEngineRegistry.getAvailableTtsEngines())
      .find(engine => engine.id === engineId)?.name || engineId;

    console.log(`Profile: ${type.toUpperCase()} engine changed to: ${engineName} (${engineId})`);
  };

  const handleLogout = () => {
    logout();
  };

  if (!user) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <ErrorState message="User not found" />
      </div>
    );
  }

  const preferences = user.preferences || {};

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <div className="flex items-center gap-3 mb-8">
        <User className="h-8 w-8" />
        <h1 className="text-3xl font-bold">{t('profile.title', 'Profile')}</h1>
      </div>

      <div className="space-y-6">
        {/* Account Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              {t('profile.accountInfo', 'Account Information')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="email">{t('profile.email', 'Email')}</Label>
              <Input
                id="email"
                type="email"
                value={user.email}
                disabled
                className="mt-1"
              />
              <p className="text-sm text-muted-foreground mt-1">
                {t('profile.emailDescription', 'Your email address cannot be changed')}
              </p>
            </div>

            <div>
              <Label htmlFor="displayName">{t('profile.displayName', 'Display Name')}</Label>
              <div className="flex gap-2 mt-1">
                <Input
                  id="displayName"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  disabled={!isEditingDisplayName}
                  placeholder={t('profile.displayNamePlaceholder', 'Enter your display name')}
                  maxLength={255}
                />
                {isEditingDisplayName ? (
                  <Button
                    onClick={handleSaveDisplayName}
                    disabled={updateProfileMutation.isPending}
                    size="icon"
                    variant="default"
                  >
                    <Check className="h-4 w-4" />
                  </Button>
                ) : (
                  <Button
                    onClick={() => setIsEditingDisplayName(true)}
                    size="icon"
                    variant="outline"
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                )}
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                {t('profile.displayNameDescription', 'This name will be shown in conversations')}
              </p>
            </div>

            <div>
              <Label htmlFor="language">{t('profile.language', 'Language')}</Label>
              <Select
                value={user.language || "en"}
                onValueChange={handleLanguageChange}
                disabled={updateLanguageMutation.isPending}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder={t('profile.selectLanguage', 'Select language')} />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map((lang) => (
                    <SelectItem key={lang.code} value={lang.code}>
                      {lang.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground mt-1">
                {t('profile.languageDescription', 'Your preferred language for the interface and speech recognition')}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Engine Preferences */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              {t('profile.enginePreferences', 'Engine Preferences')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="sttEngine">{t('profile.defaultSttEngine', 'Default STT Engine')}</Label>
              <Select
                value={preferences.sttEngine || "web-speech-api"}
                onValueChange={(value) => handleEnginePreferenceChange('stt', value)}
                disabled={updateProfileMutation.isPending}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="web-speech-api">
                    Web Speech API (Browser)
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground mt-1">
                {t('profile.sttEngineDescription', 'Engine used for speech-to-text conversion')}
              </p>
            </div>

            <div>
              <Label htmlFor="ttsEngine">{t('profile.defaultTtsEngine', 'Default TTS Engine')}</Label>
              <Select
                value={preferences.ttsEngine || "web-speech-api"}
                onValueChange={(value) => handleEnginePreferenceChange('tts', value)}
                disabled={updateProfileMutation.isPending}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="web-speech-api">
                    Web Speech API (Browser)
                  </SelectItem>
                  <SelectItem value="google-cloud">
                    Google Cloud TTS
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground mt-1">
                {t('profile.ttsEngineDescription', 'Engine used for text-to-speech playback')}
              </p>
            </div>

            <div>
              <Label htmlFor="translationEngine">{t('profile.defaultTranslationEngine', 'Default Translation Engine')}</Label>
              <Select
                value={preferences.translationEngine || "google-translate"}
                onValueChange={(value) => handleEnginePreferenceChange('translation', value)}
                disabled={updateProfileMutation.isPending}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="google-translate">
                    Google Cloud Translation
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground mt-1">
                {t('profile.translationEngineDescription', 'Engine used for language translation')}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Account Actions */}
        <Card>
          <CardHeader>
            <CardTitle>{t('profile.accountActions', 'Account Actions')}</CardTitle>
          </CardHeader>
          <CardContent>
            <Button
              onClick={handleLogout}
              variant="destructive"
              className="w-full"
            >
              <LogOut className="h-4 w-4 mr-2" />
              {t('profile.logout', 'Logout')}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Profile;