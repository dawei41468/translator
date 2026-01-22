import { useState } from "react";
import { getMobilePlatform, isStandalone, PWA_INSTALL_BANNER_DISMISSED_KEY } from "./pwa";

export interface UsePwaBannerReturn {
  hidePwaBanner: boolean;
  setHidePwaBanner: (hide: boolean) => void;
  shouldShowPwaBanner: boolean;
  dismissPwaBannerForever: () => void;
  platform: string;
}

export const usePwaBanner = (): UsePwaBannerReturn => {
  const platform = getMobilePlatform();
  const [hidePwaBanner, setHidePwaBanner] = useState(() => {
    try {
      return window.localStorage.getItem(PWA_INSTALL_BANNER_DISMISSED_KEY) === "1";
    } catch {
      return false;
    }
  });

  const shouldShowPwaBanner =
    !hidePwaBanner &&
    platform !== "other" &&
    !isStandalone();

  const dismissPwaBannerForever = () => {
    try {
      window.localStorage.setItem(PWA_INSTALL_BANNER_DISMISSED_KEY, "1");
    } catch {
      // ignore storage errors
    }
    setHidePwaBanner(true);
  };

  return {
    hidePwaBanner,
    setHidePwaBanner,
    shouldShowPwaBanner,
    dismissPwaBannerForever,
    platform,
  };
};