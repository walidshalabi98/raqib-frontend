import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./en.json";
import ar from "./ar.json";

/**
 * Translations for English and Arabic (Modern Standard Arabic). Every UI
 * string lives in en.json and ar.json; English is the fallback.
 *
 * Phase 2 translates the screens it builds (indicator form, results chain,
 * project form). Components pass the language they render in
 * (`useTranslation(undefined, { lng })`) instead of switching the global
 * language, so untranslated screens are not affected. Phase 6 sets
 * <html lang dir> for the whole app.
 */

export const SUPPORTED_LANGUAGES = ["en", "ar"] as const;
export type AppLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const resources = {
  en: { translation: en },
  ar: { translation: ar },
} as const;

if (!i18n.isInitialized) {
  void i18n.use(initReactI18next).init({
    resources,
    lng: "en",
    fallbackLng: "en",
    supportedLngs: [...SUPPORTED_LANGUAGES],
    interpolation: { escapeValue: false }, // React escapes output
    returnNull: false,
    initAsync: false,
  });
}

/** The app language for a stored preference ("en" | "ar"); anything else is English. */
export function toAppLanguage(pref: string | null | undefined): AppLanguage {
  return pref === "ar" ? "ar" : "en";
}

/** Text direction for a language. */
export function dirFor(lang: AppLanguage): "rtl" | "ltr" {
  return lang === "ar" ? "rtl" : "ltr";
}

export default i18n;
