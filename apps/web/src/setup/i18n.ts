import i18n from "i18next";
import HttpBackend from "i18next-http-backend";
import { initReactI18next } from "react-i18next";

import { locales } from "@/assets/languages";
import { getLocaleInfo } from "@/utils/language";

// Language metadata (codes only) — translations are lazy-loaded via HTTP backend
const langCodes = Object.keys(locales);

i18n
  .use(HttpBackend)
  .use(initReactI18next)
  .init({
    lng: localStorage.getItem("__MW::language") ?? "en",
    fallbackLng: "en",
    backend: {
      loadPath: "/locales/{{lng}}.json",
    },
    interpolation: {
      escapeValue: false, // not needed for react as it escapes by default
    },
  });

// Exported for language selector in Settings — contains metadata but NOT translation content
export const appLanguageOptions = langCodes.map((lang) => {
  const langObj = getLocaleInfo(lang);
  if (!langObj)
    throw new Error(`Language with code ${lang} cannot be found in database`);
  return langObj;
});

export default i18n;
