// Live Translator Settings

import { useAuth } from "@/lib/auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

const LANGUAGES = [
  { code: "en", name: "English" },
  { code: "zh", name: "Chinese (中文)" },
  { code: "it", name: "Italian" },
  { code: "de", name: "German" },
  { code: "nl", name: "Dutch" },
];

const Settings = () => {
  const { logout, user } = useAuth();
  const queryClient = useQueryClient();

  // Get current user data
  const { data: userData } = useQuery({
    queryKey: ["me"],
    queryFn: () => apiClient.getMe(),
    enabled: !!user,
  });

  // Update language mutation
  const updateLanguageMutation = useMutation({
    mutationFn: (language: string) => apiClient.updateLanguage(language),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["me"] });
      toast.success("Language updated successfully");
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to update language");
    },
  });

  const handleLanguageChange = (languageCode: string) => {
    updateLanguageMutation.mutate(languageCode);
  };

  return (
    <div className="container mx-auto px-4 py-8 pb-20">
      <h1 className="text-2xl font-bold mb-6">Settings</h1>

      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold mb-2">Language</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Select your preferred language for translations. This will be used when others speak in the conversation.
          </p>
          <Select
            value={userData?.user?.language || ""}
            onValueChange={handleLanguageChange}
            disabled={updateLanguageMutation.isPending}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select your language" />
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
          <h2 className="text-lg font-semibold mb-2">Text-to-Speech</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Configure audio output settings.
          </p>
          {/* TODO: TTS toggles */}
          <p className="text-sm">Coming soon...</p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">Audio Output</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Choose where audio is played.
          </p>
          {/* TODO: Audio output selection */}
          <p className="text-sm">Coming soon...</p>
        </div>

        <div className="pt-6 border-t">
          <Button
            variant="destructive"
            onClick={logout}
            className="w-full"
          >
            Logout
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Settings;