import { useState, type ReactNode } from "react";
import { DirectionProvider } from "@radix-ui/react-direction";
import { useTranslation } from "react-i18next";
import type { Indicator, ResultNode } from "@/types/api";
import { dirFor, type AppLanguage } from "@/i18n";
import { useUserLanguage } from "@/i18n/useUserLanguage";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { LanguageToggle } from "@/components/common/LanguageToggle";
import { IndicatorForm } from "@/components/project/IndicatorForm";

/**
 * Dialog around the indicator form. It opens in the signed-in user's language
 * and has an EN/AR toggle; in Arabic the whole dialog is right-to-left.
 */
export function IndicatorDialog({
  mode,
  projectId,
  frameworkId,
  indicator,
  resultNodes,
  defaultResultId,
  trigger,
}: {
  mode: "create" | "edit";
  projectId: string;
  frameworkId: string;
  indicator?: Indicator;
  resultNodes: readonly ResultNode[];
  defaultResultId?: string;
  /** The button that opens the dialog. */
  trigger: ReactNode;
}) {
  const userLang = useUserLanguage();
  const [chosenLang, setChosenLang] = useState<AppLanguage | null>(null);
  const lang = chosenLang ?? userLang;
  const dir = dirFor(lang);
  const [open, setOpen] = useState(false);
  const { t } = useTranslation(undefined, { lng: lang });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent
        dir={dir}
        lang={lang}
        closeLabel={t("common.close")}
        className="flex max-h-[92vh] flex-col gap-0 p-0 sm:max-w-3xl"
      >
        <DirectionProvider dir={dir}>
          <DialogHeader className="space-y-2 px-6 pb-3 pt-6 text-start">
            <div className="flex flex-wrap items-center justify-between gap-3 pe-8">
              <DialogTitle>{t(mode === "create" ? "indicatorForm.titleCreate" : "indicatorForm.titleEdit")}</DialogTitle>
              <LanguageToggle value={lang} onChange={setChosenLang} />
            </div>
            <DialogDescription>{t("indicatorForm.description")}</DialogDescription>
          </DialogHeader>
          <IndicatorForm
            key={indicator?.id ?? "new"}
            mode={mode}
            projectId={projectId}
            frameworkId={frameworkId}
            indicator={indicator}
            resultNodes={resultNodes}
            defaultResultId={defaultResultId}
            lang={lang}
            onSaved={() => setOpen(false)}
            onCancel={() => setOpen(false)}
          />
        </DirectionProvider>
      </DialogContent>
    </Dialog>
  );
}
