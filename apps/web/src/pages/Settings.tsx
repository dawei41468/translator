// Live Translator Settings

import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";

const Settings = () => {
  const { logout } = useAuth();

  return (
    <div className="container mx-auto px-4 py-8 pb-20">
      <h1 className="text-2xl font-bold mb-6">Settings</h1>

      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold mb-2">Language</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Select your preferred language for translations.
          </p>
          {/* TODO: Language selection dropdown */}
          <p className="text-sm">Coming soon...</p>
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