import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";
import { LANGUAGES } from "@/lib/languages";

export function LanguageSelectorGrid({ className }: { className?: string }) {
  const { i18n } = useTranslation();

  const currentLang = (i18n.resolvedLanguage ?? i18n.language ?? "en").split("-")[0];

  return (
    <div className={className}>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {LANGUAGES.map((opt) => {
          const isActive = currentLang === opt.code;

          return (
            <Button
              key={opt.code}
              type="button"
              variant={isActive ? "default" : "outline"}
              size="sm"
              className="w-full justify-start gap-2"
              onClick={() => {
                void i18n.changeLanguage(opt.code);
              }}
              aria-label={`Switch language to ${opt.nativeName}`}
              data-testid={`lang-${opt.code}`}
            >
              <span className="text-base" aria-hidden="true">
                {opt.flag}
              </span>
              <span className="text-sm font-medium">{opt.nativeName}</span>
            </Button>
          );
        })}
      </div>
    </div>
  );
}
