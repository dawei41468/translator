import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import en from '../locales/en.json';
import zh from '../locales/zh.json';
import ko from '../locales/ko.json';
import es from '../locales/es.json';
import it from '../locales/it.json';
import de from '../locales/de.json';
import nl from '../locales/nl.json';

const resources = {
  en: { translation: en },
  zh: { translation: zh },
  ko: { translation: ko },
  es: { translation: es },
  it: { translation: it },
  de: { translation: de },
  nl: { translation: nl },
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    debug: false,

    interpolation: {
      escapeValue: false, // React already escapes
    },

    detection: {
      order: ['localStorage', 'navigator', 'htmlTag'],
      caches: ['localStorage'],
    },
  });

export default i18n;