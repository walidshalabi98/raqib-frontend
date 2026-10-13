import { useState, type ReactNode } from "react";
import { DirectionProvider } from "@radix-ui/react-direction";
import { useTranslation } from "react-i18next";
import type { AcceptKpiSuggestionResponse, FrameworkStatus, Indicator, KpiSuggestion, ResultNode } from "@/types/api";
import { dirFor, type AppLanguage } from "@/i18n";
import { useUserLanguage } from "@/i18n/useUserLanguage";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { LanguageToggle } from "@/components/common/LanguageToggle";
import { IndicatorForm } from "@/components/project/IndicatorForm";

/**
 * Dialog around the indicator form. It opens in the signed-in user's language
 * (or `initialLang`) and has an EN/AR toggle; in Arabic the whole dialog is
 * right-to-left. Mode "accept" is Edit & accept of a KPI suggestion (design
 * section 9.5); it behaves like create until E8 completes it.
 */
export function IndicatorDialog({
  mode,
  projectId,
  frameworkId,
  indicator,
  frameworkStatus,
  resultNodes,
  defaultResultId,
  trigger,
  suggestion,
  initialLang,
  onCloseAutoFocus,
  onAccepted,
}: {
  mode: "create" | "edit" | "accept";
  projectId: string;
  frameworkId: string;
  indicator?: Indicator;
  /** Status of the framework; AI-made indicators of an approved framework are not labelled for review. */
  frameworkStatus?: FrameworkStatus | null;
  resultNodes: readonly ResultNode[];
  defaultResultId?: string;
  /** The button that opens the dialog. */
  trigger: ReactNode;
  /** Accept mode: the suggestion whose draft is edited and accepted. */
  suggestion?: KpiSuggestion;
  /** Language the dialog opens in (e.g. the suggestion panel's); default the user's language. */
  initialLang?: AppLanguage;
  /** Where focus goes when the dialog closes (the suggestion list moves it to the next card). */
  onCloseAutoFocus?: (event: Event) => void;
  /** Accept mode: called with the accept response. */
  onAccepted?: (response: AcceptKpiSuggestionResponse) => void;
}) {
  const userLang = useUserLanguage();
  const [chosenLang, setChosenLang] = useState<AppLanguage | null>(null);
  const lang = chosenLang ?? initialLang ?? userLang;
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
        onCloseAutoFocus={onCloseAutoFocus}
        className="flex max-h-[92vh] flex-col gap-0 p-0 sm:max-w-3xl"
      >
        <DirectionProvider dir={dir}>
          <DialogHeader className="space-y-2 px-6 pb-3 pt-6 text-start">
            <div className="flex flex-wrap items-center justify-between gap-3 pe-8">
              {/* TODO(E8): accept mode uses indicatorForm.titleAccept (added by E7 with the KPI strings). */}
              <DialogTitle>{t(mode === "edit" ? "indicatorForm.titleEdit" : "indicatorForm.titleCreate")}</DialogTitle>
              <LanguageToggle value={lang} onChange={setChosenLang} />
            </div>
            <DialogDescription>{t("indicatorForm.description")}</DialogDescription>
          </DialogHeader>
          <IndicatorForm
            key={indicator?.id ?? suggestion?.id ?? "new"}
            mode={mode}
            projectId={projectId}
            frameworkId={frameworkId}
            indicator={indicator}
            frameworkStatus={frameworkStatus}
            resultNodes={resultNodes}
            defaultResultId={defaultResultId}
            lang={lang}
            suggestion={suggestion}
            onAccepted={(response) => {
              setOpen(false);
              onAccepted?.(response);
            }}
            onSaved={() => setOpen(false)}
            onCancel={() => setOpen(false)}
          />
        </DirectionProvider>
      </DialogContent>
    </Dialog>
  );
}
