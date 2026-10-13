import type { AppLanguage } from "@/i18n";
import type { KpiSuggestion } from "@/types/api";

export interface RejectReasonPickerProps {
  suggestion: KpiSuggestion;
  lang: AppLanguage;
  /** The rejected suggestion as the API returned it (the card then becomes the "Rejected: …" stub). */
  onRejected: (suggestion: KpiSuggestion) => void;
  onCancel: () => void;
}

/**
 * Inline reject: six reason chips (radio group), the consequence of the chosen reason (rejectEffect), an optional
 * note and a confirm button — two taps, consequence first (design section 9.4, D8).
 *
 * Step 0 shell (Phase 4 contracts): final props (not fixed by the design; used only by E7's card); renders nothing
 * until E7 implements it.
 */
export function RejectReasonPicker(_props: RejectReasonPickerProps) {
  return null;
}
