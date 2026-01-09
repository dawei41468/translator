export function getTtsLocale(language: string | null | undefined): string {
  switch ((language ?? "en").toLowerCase()) {
    case "zh":
      return "zh-CN";
    case "ko":
      return "ko-KR";
    case "it":
      return "it-IT";
    case "de":
      return "de-DE";
    case "nl":
      return "nl-NL";
    case "en":
    default:
      return "en-US";
  }
}

export function getSocketBaseUrl(): string {
  const base = import.meta.env.VITE_API_BASE_URL;
  if (typeof window === "undefined") return "";
  
  const host = window.location.hostname;
  const isLocalHost = host === "localhost" || host === "127.0.0.1";

  // If VITE_API_BASE_URL is set, use it (after normalizing)
  if (base) {
    if (base.startsWith("http")) {
      return base.replace(/\/api\/?$/, "");
    }
    // If it's a relative path like /api, use current origin
    if (base.startsWith("/")) {
      return window.location.origin;
    }
  }

  // Fallback for local development if VITE_API_BASE_URL is not set
  if (isLocalHost) {
    return "http://localhost:4003";
  }

  // Production fallback: same origin
  return window.location.origin;
}

export function getSpeechRecognitionLocale(language: string | null | undefined): string {
  switch ((language ?? "en").toLowerCase()) {
    case "zh":
      return "zh-CN";
    case "ko":
      return "ko-KR";
    case "it":
      return "it-IT";
    case "de":
      return "de-DE";
    case "nl":
      return "nl-NL";
    case "en":
    default:
      return "en-US";
  }
}
