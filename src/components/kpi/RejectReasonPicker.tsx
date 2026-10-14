import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Check, Info, Loader2 } from "lucide-react";
import type { AppLanguage } from "@/i18n";
import type { KpiSuggestion, SuggestionRejectReason } from "@/types/api";
import { useKpiAssistant } from "@/hooks/useKpiAssistant";
import { useRejectKpiSuggestion } from "@/hooks/useKpiSuggestions";
import { KPI_REJECT_REASONS } from "@/lib/constants";
import { rejectEffectKeys, requestErrorCode } from "@/lib/kpiSuggestions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FieldMessage } from "@/components/common/FieldMessage";

export interface RejectReasonPickerProps {
  suggestion: KpiSuggestion;
  lang: AppLanguage;
  /** The rejected suggestion as the API returned it (the card then becomes the "Rejected: …" stub). */
  onRejected: (suggestion: KpiSuggestion) => void;
  onCancel: () => void;
  /** The suggestion was decided elsewhere or expired (409): the list is refetched and the card leaves. */
  onStale?: () => void;
}

/** Longest note the API accepts (design 8.2). */
export const REJECT_NOTE_MAX = 1000;

/**
 * Inline reject (knowledge/kpi-assistant-spec.md §A7 "reject with a reason so the system learns"; design D8 and 9.4):
 * six reason chips (a radio group), the consequence of the chosen reason first (rejectEffect: organisation, donor
 * type, project, or a custom indicator), an optional note without personal data, then "Reject suggestion". Two taps,
 * so a mis-tap never excludes an indicator for the whole organisation. Without a reason the confirm button shows
 * "Choose a reason." Escape cancels.
 */
export function RejectReasonPicker({ suggestion, lang, onRejected, onCancel, onStale }: RejectReasonPickerProps) {
  const { projectId } = useKpiAssistant();
  const { t } = useTranslation(undefined, { lng: lang });
  const baseId = useId();
  const [reason, setReason] = useState<SuggestionRejectReason | null>(null);
  const [note, setNote] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const firstRadio = useRef<HTMLInputElement>(null);
  const reject = useRejectKpiSuggestion(projectId);
  const pending = reject.isPending;

  useEffect(() => {
    firstRadio.current?.focus();
  }, []);

  const ids = {
    legend: `${baseId}-legend`,
    error: `${baseId}-error`,
    effect: `${baseId}-effect`,
    note: `${baseId}-note`,
    noteHint: `${baseId}-note-hint`,
  };
  const error = submitted && !reason ? t("kpi.reject.chooseReason") : undefined;
  const effects = reason ? rejectEffectKeys(reason, Boolean(suggestion.libraryId)) : [];

  const confirm = () => {
    if (pending) return;
    setSubmitted(true);
    if (!reason) {
      firstRadio.current?.focus();
      return;
    }
    reject.mutateAsync({ id: suggestion.id, reason, note: note.trim() || undefined }).then(
      (response) => {
        toast.success(t("kpi.toast.rejected"));
        onRejected(response?.suggestion ?? { ...suggestion, status: "rejected", rejectReason: reason });
      },
      (err: unknown) => {
        const code = requestErrorCode(err);
        toast.error(t("kpi.toast.rejectFailed"), { description: code === "internal" ? undefined : t(`kpi.errors.${code}`) });
        if (code === "already_decided" || code === "stale") onStale?.();
      },
    );
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape" && !pending) {
      event.stopPropagation();
      onCancel();
    }
  };

  return (
    <div className="min-w-0 space-y-3 rounded-md border bg-background p-3" onKeyDown={onKeyDown}>
      <fieldset aria-describedby={ids.error} className="min-w-0 space-y-2">
        <legend id={ids.legend} className="text-sm font-medium">{t("kpi.reject.legend")}</legend>
        <div className="flex flex-wrap gap-2">
          {KPI_REJECT_REASONS.map((value, index) => {
            const checked = reason === value;
            return (
              <label
                key={value}
                className={
                  "inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-sm sm:min-h-9 "
                  + "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2 "
                  + (checked ? "border-primary bg-primary/10 font-medium" : "border-input hover:bg-accent")
                }
              >
                <input
                  ref={index === 0 ? firstRadio : undefined}
                  type="radio"
                  name={`${baseId}-reason`}
                  value={value}
                  checked={checked}
                  onChange={() => setReason(value)}
                  className="sr-only"
                />
                {checked && <Check aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />}
                {t(`kpi.reject.reasons.${value}`)}
              </label>
            );
          })}
        </div>
        <FieldMessage id={ids.error} message={error} />
      </fieldset>

      <div id={ids.effect} aria-live="polite" className="space-y-1">
        {effects.map((key) => (
          <p key={key} className="flex items-start gap-1.5 text-sm">
            <Info aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-info" />
            <span>{t(key)}</span>
          </p>
        ))}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={ids.note}>{t("kpi.reject.note")}</Label>
        <Textarea
          id={ids.note}
          value={note}
          maxLength={REJECT_NOTE_MAX}
          rows={2}
          aria-describedby={ids.noteHint}
          onChange={(event) => setNote(event.target.value)}
        />
        <p id={ids.noteHint} className="text-xs text-muted-foreground">{t("kpi.reject.noteHint")}</p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        <Button
          type="button"
          variant="destructive"
          className="min-h-11 whitespace-normal sm:min-h-9"
          aria-disabled={pending ? "true" : undefined}
          aria-describedby={reason ? ids.effect : ids.error}
          onClick={confirm}
        >
          {pending && <Loader2 aria-hidden="true" className="motion-safe:animate-spin" />}
          {t("kpi.reject.confirm")}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="min-h-11 sm:min-h-9"
          aria-disabled={pending ? "true" : undefined}
          onClick={() => { if (!pending) onCancel(); }}
        >
          {t("common.cancel")}
        </Button>
      </div>
    </div>
  );
}
