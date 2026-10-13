import { useId } from "react";
import { useTranslation } from "react-i18next";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import type { AppLanguage } from "@/i18n";
import { formatMonthYear } from "@/lib/dates";
import { trendChartRows } from "@/lib/trends";
import type { DashboardTrend } from "@/types/api";

const colors = ["hsl(var(--success))", "hsl(var(--info))", "hsl(var(--danger))", "hsl(var(--warning))", "hsl(var(--primary))"];

/** At most this many indicators share the chart, so the lines stay readable on a phone. */
const MAX_LINES = 3;

const shortName = (text: string) => (text.length > 30 ? `${text.slice(0, 30)}…` : text);

/**
 * Trend lines for the first indicators with numeric values, one point per month, with the same values as a
 * table for screen readers and keyboard users (docs/UX_STANDARDS.md §7). Donor survey results are plotted as
 * monthly aggregates (sums and means only: src/lib/trends.ts). The time axis is not mirrored in Arabic.
 */
export function TrendChart({ trends, lang }: { trends: readonly DashboardTrend[]; lang: AppLanguage }) {
  const { t } = useTranslation(undefined, { lng: lang });
  const headingId = useId();

  const charted = trends.filter((trend) => trendChartRows([trend]).some((row) => row.values[0] !== null)).slice(0, MAX_LINES);
  const rows = trendChartRows(charted);
  const names = charted.map((trend) => (typeof trend.indicatorText === "string" ? trend.indicatorText : ""));

  return (
    <section className="card-surface p-5">
      <h3 id={headingId} className="mb-4 text-sm font-semibold">{t("dashboard.trendsTitle")}</h3>
      {rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{t("dashboard.trendsEmpty")}</p>
      ) : (
        <>
          {/* Charts keep a left-to-right time axis in Arabic too (docs/UX_STANDARDS.md §6); SVG text would
              otherwise be anchored right to left and overlap the axes. */}
          <div dir="ltr">
            <ResponsiveContainer width="100%" height={280}>
              <LineChart
                data={rows.map((row) => ({
                  month: formatMonthYear(row.month, lang, "short"),
                  ...Object.fromEntries(row.values.map((value, i) => [`ind${i}`, value])),
                }))}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid hsl(var(--border))", fontSize: 13 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {charted.map((trend, i) => (
                  <Line
                    key={trend.indicatorId ?? i}
                    type="monotone"
                    dataKey={`ind${i}`}
                    name={shortName(names[i])}
                    stroke={colors[i % colors.length]}
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <details className="mt-3 text-sm">
            <summary className="min-h-11 cursor-pointer rounded-md py-3 text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              {t("dashboard.trendsTable")}
            </summary>
            {/* Scrolls sideways on phones: focusable so keyboard users can scroll it too. */}
            <div role="region" aria-labelledby={headingId} tabIndex={0} className="overflow-x-auto rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <table className="w-full text-xs">
                <caption className="sr-only">{t("dashboard.trendsTitle")}</caption>
                <thead>
                  <tr className="border-b">
                    <th scope="col" className="py-2 pe-3 text-start font-medium">{t("dashboard.month")}</th>
                    {names.map((name, i) => (
                      <th key={charted[i].indicatorId ?? i} scope="col" className="py-2 pe-3 text-start font-medium">
                        <span dir="auto">{name}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.month} className="border-b last:border-0">
                      <th scope="row" className="whitespace-nowrap py-2 pe-3 text-start font-normal">{formatMonthYear(row.month, lang)}</th>
                      {row.values.map((value, i) => (
                        <td key={i} className="py-2 pe-3 tabular-nums">{value === null ? t("dashboard.noPoint") : value}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </section>
  );
}
