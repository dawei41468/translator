export const LANGUAGES = [
  { code: "en", flag: "🇺🇸", nativeName: "English" },
  { code: "zh", flag: "🇨🇳", nativeName: "中文" },
  { code: "ko", flag: "🇰🇷", nativeName: "한국어" },
  { code: "es", flag: "🇪🇸", nativeName: "Español" },
  { code: "ja", flag: "🇯🇵", nativeName: "日本語" },
  { code: "it", flag: "🇮🇹", nativeName: "Italiano" },
  { code: "de", flag: "🇩🇪", nativeName: "Deutsch" },
  { code: "nl", flag: "🇳🇱", nativeName: "Nederlands" },
] as const;

export type LanguageOption = (typeof LANGUAGES)[number];

export function formatLanguageLabel(lang: Pick<LanguageOption, "flag" | "nativeName">) {
  return `${lang.flag} ${lang.nativeName}`;
}
