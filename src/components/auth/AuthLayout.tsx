import { useEffect, useRef, type ReactNode } from "react";
import { dirFor, type AppLanguage } from "@/i18n";
import { useDocumentHead } from "@/lib/documentHead";
import { RaqibLogo } from "@/components/common/RaqibLogo";
import { LanguageToggle } from "@/components/common/LanguageToggle";

/**
 * The frame of the screens before sign-in (sign in, forgot password, reset password): the logo, the
 * screen's heading, its content, and the English / Arabic switch. Everything inside follows `lang`, and so do
 * `<html lang dir>` and the page title. With `focusHeading`, the heading takes the focus (on arrival, and
 * whenever the title changes while it is set), so keyboard and screen-reader users start at the new screen
 * instead of the top of the page.
 */
export function AuthLayout({
  lang,
  onLangChange,
  title,
  focusHeading = false,
  children,
}: {
  lang: AppLanguage;
  onLangChange: (lang: AppLanguage) => void;
  title: string;
  focusHeading?: boolean;
  children: ReactNode;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useDocumentHead({ screen: title, lang });

  useEffect(() => {
    if (focusHeading) headingRef.current?.focus();
  }, [focusHeading, title]);

  return (
    <main lang={lang} dir={dirFor(lang)} className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="card-surface w-full max-w-sm p-6 animate-fade-in sm:p-8">
        {/* Logos are not mirrored in right-to-left layouts. */}
        <div dir="ltr" className="mb-6 flex justify-center">
          <RaqibLogo size="lg" />
        </div>
        <h1 ref={headingRef} tabIndex={-1} className="mb-5 text-center text-lg font-semibold tracking-tight focus:outline-none">
          {title}
        </h1>
        {children}
        <div className="mt-8 flex justify-center">
          <LanguageToggle value={lang} onChange={onLangChange} size="lg" />
        </div>
      </div>
    </main>
  );
}
