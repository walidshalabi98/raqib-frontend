import { useEffect } from "react";

/** The brand, last in every page title. */
export const BRAND = "Raqib by Momentum Labs";

/** "Screen · Raqib by Momentum Labs", or the brand alone. */
export function pageTitle(screen?: string): string {
  return screen ? `${screen} · ${BRAND}` : BRAND;
}

/**
 * Sets the page title (`screen`, already translated) and, when `lang` is given, `<html lang dir>`, so screen
 * readers use the right voice, browsers do not offer to translate an Arabic screen "from English", and every
 * screen has its own title in the tab list. Restores the previous values when the screen goes away.
 *
 * Only fully translated screens pass `lang`: the sign-in screens (AuthLayout). Signed-in pages keep
 * `<html lang="en">` until every screen is translated (Phase 6); they set their own `lang` and `dir` on
 * their content.
 */
export function useDocumentHead({ screen, lang }: { screen?: string; lang?: "en" | "ar" }) {
  useEffect(() => {
    const root = document.documentElement;
    const before = { lang: root.getAttribute("lang"), dir: root.getAttribute("dir"), title: document.title };
    if (lang) {
      root.setAttribute("lang", lang);
      root.setAttribute("dir", lang === "ar" ? "rtl" : "ltr");
    }
    document.title = pageTitle(screen);
    return () => {
      const restore = (name: "lang" | "dir", value: string | null) => {
        if (value === null) root.removeAttribute(name);
        else root.setAttribute(name, value);
      };
      if (lang) {
        restore("lang", before.lang);
        restore("dir", before.dir);
      }
      document.title = before.title;
    };
  }, [screen, lang]);
}
