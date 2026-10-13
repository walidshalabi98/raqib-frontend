import type { AppLanguage } from "@/i18n";
import type { KpiSuggestion, ResultNode } from "@/types/api";

export interface KpiSuggestionCardProps {
  suggestion: KpiSuggestion;
  /** The result the suggestion is for. */
  result: ResultNode;
  /** Every result node of the framework (the Edit & accept dialog's result select). */
  nodes: readonly ResultNode[];
  /** Id of the list's AiSuggestedLabel (the card points to it with aria-describedby). */
  aiLabelId: string;
  lang: AppLanguage;
  /** After accept, reject or dismiss: the list moves focus (next card, previous card, else focusFallback). */
  onDecided?: (outcome: "accepted" | "rejected" | "dismissed", suggestion: KpiSuggestion) => void;
}

/**
 * One suggested indicator: names EN/AR, badges, rationale + Why?, warnings, Accept / Edit & accept / Reject / Show
 * alternatives (design section 9.4). Edit & accept opens IndicatorDialog in mode "accept".
 *
 * Step 0 shell (Phase 4 contracts): final props (not fixed by the design; E7 may refine them, the card is used only
 * by E7's KpiResultSuggestions); renders nothing until E7 implements it.
 */
export function KpiSuggestionCard(_props: KpiSuggestionCardProps) {
  return null;
}
