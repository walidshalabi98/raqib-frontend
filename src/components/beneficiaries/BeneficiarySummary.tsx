import { useId } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { AlertCircle, EyeOff, Info, Users } from "lucide-react";
import { dirFor } from "@/i18n";
import { useUserLanguage } from "@/i18n/useUserLanguage";
import { useBeneficiaryStats } from "@/hooks/useBeneficiaryStats";
import { isForbidden } from "@/lib/apiError";
import { OTHER_KEY, cellText, dimensionLabel, hiddenLegend, isHidden, toSummaryView, type SummaryTable, type SummaryView } from "@/lib/disclosure";
import type { DisclosedCell } from "@/types/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * The beneficiary figures donor viewers see instead of the register: totals and one-way
 * breakdowns without names, phone numbers or ID numbers, with small counts hidden and every other
 * figure rounded to the nearest 5 by the backend (docs/SECURITY_SETUP.md §8 in the backend repo).
 * Hidden counts are shown as an icon plus text, never by colour alone; the legend says what is
 * hidden and that figures are rounded. It carries its own lang and dir, so it reads correctly on a
 * page that is not translated yet (Phase 6).
 */
export function BeneficiarySummary({ projectId }: { projectId: string }) {
  const lang = useUserLanguage();
  const { t } = useTranslation(undefined, { lng: lang });
  const headingId = useId();
  const { data, isLoading, isError, error, refetch } = useBeneficiaryStats(projectId);

  return (
    <section aria-labelledby={headingId} lang={lang} dir={dirFor(lang)} className="min-w-0 space-y-4">
      <h2 id={headingId} className="flex items-center gap-2 text-lg font-semibold">
        <Users aria-hidden="true" className="h-5 w-5 shrink-0" />
        {t("beneficiarySummary.title")}
      </h2>

      <p role="note" className="flex items-start gap-2 rounded-md border bg-muted/40 p-3 text-start text-sm">
        <Info aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
        <span>{t("access.beneficiaries.staffOnly")}</span>
      </p>

      {isLoading ? (
        <div role="status" className="space-y-3">
          <span className="sr-only">{t("common.loading")}</span>
          <div className="grid gap-3 sm:grid-cols-2">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
          <Skeleton className="h-40 w-full" />
        </div>
      ) : isError || !data ? (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-md border p-4 text-sm">
          <AlertCircle aria-hidden="true" className="h-4 w-4 shrink-0 text-destructive" />
          {/* A translated sentence, not the server's English text; a 403 says why. */}
          <span className="min-w-0 flex-1">{t(isForbidden(error) ? "errors.forbidden" : "beneficiarySummary.error")}</span>
          <Button size="sm" variant="outline" className="min-h-11" onClick={() => void refetch()}>
            {t("common.retry")}
          </Button>
        </div>
      ) : (
        <SummaryBody view={toSummaryView(data)} t={t} />
      )}
    </section>
  );
}

function SummaryBody({ view, t }: { view: SummaryView; t: TFunction }) {
  const legendId = useId();

  if (view.suppressedAll) {
    return (
      <Card>
        <CardContent className="flex items-start gap-2 py-6 text-start text-sm">
          <EyeOff aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{t("beneficiarySummary.allHidden", { min: view.minCell })}</p>
        </CardContent>
      </Card>
    );
  }

  if (!isHidden(view.total) && view.total.count === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          <Users aria-hidden="true" className="mx-auto mb-3 h-10 w-10 opacity-30" />
          <p>{t("beneficiarySummary.empty")}</p>
        </CardContent>
      </Card>
    );
  }

  const legend = hiddenLegend(t, view);
  const hasLegend = legend !== "";
  return (
    <div className="min-w-0 space-y-4">
      {/* The legend also explains the rounded totals. */}
      <dl className="grid gap-3 sm:grid-cols-2" aria-describedby={hasLegend ? legendId : undefined}>
        <Figure label={t("beneficiarySummary.total")} cell={view.total} t={t} />
        <Figure label={t("beneficiarySummary.services")} cell={view.serviceCount} t={t} />
      </dl>

      <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2">
        {view.tables.map((table) => (
          <DimensionTable key={table.dimension} table={table} t={t} legendId={hasLegend ? legendId : undefined} />
        ))}
      </div>

      {hasLegend && (
        <p id={legendId} className="flex items-start gap-2 text-start text-xs text-muted-foreground">
          <EyeOff aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{legend}</span>
        </p>
      )}
    </div>
  );
}

/** A count, or the "Hidden" text with its icon. */
function CellValue({ cell, t }: { cell: DisclosedCell; t: TFunction }) {
  if (!isHidden(cell)) return <>{cellText(t, cell)}</>;
  return (
    <span className="inline-flex items-center gap-1 font-medium">
      <EyeOff aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
      {t("beneficiarySummary.hidden")}
    </span>
  );
}

function Figure({ label, cell, t }: { label: string; cell: DisclosedCell; t: TFunction }) {
  return (
    <div className="card-surface min-w-0 p-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold tabular-nums">
        <CellValue cell={cell} t={t} />
      </dd>
    </div>
  );
}

function DimensionTable({ table, t, legendId }: { table: SummaryTable; t: TFunction; legendId?: string }) {
  return (
    <div className="card-surface min-w-0 p-4">
      <table className="w-full text-sm" aria-describedby={legendId}>
        <caption className="pb-2 text-start font-medium">{t(table.captionKey)}</caption>
        <thead>
          <tr className="border-b text-xs text-muted-foreground">
            <th scope="col" className="py-2 pe-3 text-start font-medium">{t("beneficiarySummary.category")}</th>
            <th scope="col" className="py-2 text-end font-medium">{t("beneficiarySummary.people")}</th>
          </tr>
        </thead>
        <tbody>
          {table.cells.length === 0 ? (
            <tr>
              <td colSpan={2} className="py-2 text-start text-muted-foreground">{t(table.emptyKey)}</td>
            </tr>
          ) : (
            table.cells.map((cell) => (
              <tr key={cell.key ?? "\u0000null"} className="border-b last:border-0">
                <th scope="row" className="break-words py-2 pe-3 text-start font-normal">
                  {/* Values typed by users keep their own direction (an English name on an Arabic page). */}
                  {table.freeText && cell.key !== null && cell.key !== OTHER_KEY ? (
                    <bdi dir="auto">{dimensionLabel(t, table.dimension, cell.key)}</bdi>
                  ) : (
                    dimensionLabel(t, table.dimension, cell.key)
                  )}
                </th>
                <td className="whitespace-nowrap py-2 text-end tabular-nums">
                  <CellValue cell={cell} t={t} />
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
