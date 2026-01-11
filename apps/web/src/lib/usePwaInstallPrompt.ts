import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

export function usePwaInstallPrompt() {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handler = (e: Event) => {
      // Allow us to trigger the prompt later.
      e.preventDefault();
      setPromptEvent(e as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handler);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
    };
  }, []);

  const promptToInstall = async () => {
    if (!promptEvent) return { outcome: "unavailable" as const };

    await promptEvent.prompt();
    const choice = await promptEvent.userChoice;
    setPromptEvent(null);

    return choice;
  };

  return {
    canPrompt: !!promptEvent,
    promptToInstall,
  };
}
