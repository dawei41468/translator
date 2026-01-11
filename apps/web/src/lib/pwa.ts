export type MobilePlatform = "ios" | "android" | "other";

export const PWA_INSTALL_BANNER_DISMISSED_KEY = "pwa_install_banner_dismissed_v1";

export function getMobilePlatform(): MobilePlatform {
  if (typeof navigator === "undefined") return "other";

  const ua = navigator.userAgent || "";

  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Android/i.test(ua)) return "android";

  return "other";
}

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;

  const matchMedia = typeof window.matchMedia === "function" ? window.matchMedia.bind(window) : undefined;

  const displayModeStandalone =
    (matchMedia?.("(display-mode: standalone)").matches ?? false) ||
    (matchMedia?.("(display-mode: fullscreen)").matches ?? false) ||
    (matchMedia?.("(display-mode: minimal-ui)").matches ?? false);

  const iosStandalone = (window.navigator as any)?.standalone === true;

  return Boolean(displayModeStandalone || iosStandalone);
}
