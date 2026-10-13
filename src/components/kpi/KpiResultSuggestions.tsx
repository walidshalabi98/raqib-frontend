import type { ResultNode } from "@/types/api";

export interface KpiResultSuggestionsProps {
  /** The result whose suggestions are shown. */
  result: ResultNode;
  /** Every result node of the framework (codes, the accept dialog's result select). */
  nodes: readonly ResultNode[];
  /** Where focus goes when the last card is decided (the result's Suggest KPIs button). */
  focusFallback: () => HTMLElement | null;
}

/**
 * Suggestions under one result: progress (KpiProgressSteps), error, empty state, the list of KpiSuggestionCard, the
 * rejected stub and alternatives groups (design sections 9.1 and 9.4).
 *
 * Step 0 shell (Phase 4 contracts): final props; renders nothing until E7 implements it.
 */
export function KpiResultSuggestions(_props: KpiResultSuggestionsProps) {
  return null;
}
