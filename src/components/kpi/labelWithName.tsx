import { Fragment, type ReactNode } from "react";
import type { TFunction } from "i18next";
import type { AppLanguage } from "@/i18n";

const ARABIC_LETTER = /[\u0600-\u06FF]/;

/** Stands for the name while the label is translated (a private-use character no translation contains). */
const NAME_SLOT = "\uE000";

/** The language of a name: Arabic when it has an Arabic letter, else English. */
export function nameLanguage(name: string): AppLanguage {
  return ARABIC_LETTER.test(name) ? "ar" : "en";
}

/**
 * A translated label with `{{name}}` in a <bdi> carrying the name's own language (nameLanguage), so an
 * English indicator name inside an Arabic label keeps its reading order and is read with the English voice (WCAG
 * 3.1.2; review UX-12).
 */
export function labelWithName(t: TFunction, key: string, name: string): ReactNode {
  const nameLang = nameLanguage(name);
  const parts = (t(key, { name: NAME_SLOT }) as string).split(NAME_SLOT);
  return parts.map((part, index) => (index === 0 ? part : (
    <Fragment key={index}>
      <bdi lang={nameLang} dir="auto">{name}</bdi>
      {part}
    </Fragment>
  )));
}

