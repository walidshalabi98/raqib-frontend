import { useId, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { BarChart3, Database, Download, FileSpreadsheet, FileText, Info, Loader2, ShieldAlert, type LucideIcon } from "lucide-react";
import { api } from "@/services/api";
import { dirFor } from "@/i18n";
import { useUserLanguage } from "@/i18n/useUserLanguage";
import { apiErrorText } from "@/lib/apiError";
import { downloadCSV, downloadJSON, type CsvRow } from "@/lib/csv";
import { summaryCsvRows } from "@/lib/disclosure";
import { queryKeys } from "@/lib/queryKeys";
import { cn } from "@/lib/utils";
import type { Project } from "@/types/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export type ExportAudience = "staff" | "donor";

type ExportKind = "indicators" | "register" | "full" | "summary" | "results";

/**
 * Project exports. Org staff (default) get the indicators, the beneficiary register and the full
 * project, with a reminder under each file that holds personal data. Donor viewers get the
 * indicators, a beneficiary summary with small counts hidden, and the project results without
 * personal data; the register is never requested for them (backend docs/SECURITY_SETUP.md §8).
 */
export default function ExportPanel({ projectId, audience = "staff" }: { projectId: string; audience?: ExportAudience }) {
  const lang = useUserLanguage();
  const { t } = useTranslation(undefined, { lng: lang });
  const queryClient = useQueryClient();
  const headingId = useId();
  const [loading, setLoading] = useState<ExportKind | null>(null);

  /** The project name for file names: from the project page's cache, without another request. */
  const projectName = () => queryClient.getQueryData<Project>(queryKeys.project(projectId))?.name || "project";

  const run = async (kind: ExportKind, work: () => Promise<boolean>) => {
    setLoading(kind);
    try {
      if (await work()) toast.success(t("exportPanel.success"));
      else toast.error(t("exportPanel.noData"));
    } catch (err) {
      toast.error(apiErrorText(t, err, "exportPanel.failed"));
    } finally {
      setLoading(null);
    }
  };

  const exportIndicators = () =>
    run("indicators", async () => {
      const data = await api.exportIndicators(projectId);
      const rows: CsvRow[] = (data?.indicators ?? []).map((ind: Record<string, unknown> & { dataPoints?: unknown[] }) => ({
        Indicator: ind.indicator as string,
        "Indicator (AR)": (ind.indicatorAr as string) || "",
        Level: ind.level as string,
        Method: ind.method as string,
        Frequency: ind.frequency as string,
        Baseline: (ind.baseline as string) || "",
        Target: (ind.target as string) || "",
        Current: (ind.current as string) || "",
        Unit: (ind.unit as string) || "",
        Status: ind.status as string,
        "Data Points": ind.dataPoints?.length || 0,
      }));
      return downloadCSV(rows, `${data?.project?.name ?? projectName()}_indicators.csv`);
    });

  const exportRegister = () =>
    run("register", async () => {
      const data = await api.exportBeneficiaries(projectId);
      const rows: CsvRow[] = (data?.beneficiaries ?? []).map((b: Record<string, unknown>) => ({
        Name: b.name as string,
        "Name (AR)": (b.nameAr as string) || "",
        Gender: b.gender as string,
        Age: (b.age as number) || "",
        "Age Group": (b.ageGroup as string) || "",
        Location: (b.location as string) || "",
        Governorate: (b.governorate as string) || "",
        "Household Size": (b.householdSize as number) || "",
        Status: b.status as string,
        "Registered At": (b.registeredAt as string) || "",
        "Services Received": b.servicesReceived as number,
      }));
      return downloadCSV(rows, `${data?.project?.name ?? projectName()}_beneficiaries.csv`);
    });

  const exportFull = () =>
    run("full", async () => {
      const data = await api.exportProject(projectId);
      downloadJSON(data, `${data?.project?.name ?? projectName()}_full_export.json`);
      return true;
    });

  const exportSummary = () =>
    run("summary", async () => {
      const stats = await api.getBeneficiaryStats(projectId);
      return downloadCSV(summaryCsvRows(t, stats), `${projectName()}_beneficiary_summary.csv`);
    });

  const exportResults = () =>
    run("results", async () => {
      const data = await api.exportProject(projectId);
      // Never save a file with personal data as "results without personal data". The staff export
      // comes back when the role changed during the request (the token was refreshed with a staff
      // role): say so, and the panel then offers the staff exports. Any other answer, e.g. from an
      // older backend, is refused as a failure.
      if (data?.audience === "staff") throw new Error(t("access.export.roleChanged"));
      if (data?.audience !== "donor" || "beneficiaries" in data) throw new Error(t("exportPanel.failed"));
      downloadJSON(data, `${data.project?.name ?? projectName()}_results.json`);
      return true;
    });

  const cards: ExportCardProps[] =
    audience === "donor"
      ? [
          { kind: "indicators", icon: FileSpreadsheet, title: t("exportPanel.indicatorsTitle"), description: t("exportPanel.indicatorsDescription"), action: t("exportPanel.exportCsv"), onExport: exportIndicators },
          { kind: "summary", icon: BarChart3, title: t("exportPanel.summaryTitle"), description: t("exportPanel.summaryDescription"), action: t("exportPanel.exportCsv"), onExport: exportSummary },
          { kind: "results", icon: Database, title: t("exportPanel.resultsTitle"), description: t("exportPanel.resultsDescription"), action: t("exportPanel.exportJson"), onExport: exportResults },
        ]
      : [
          { kind: "indicators", icon: FileSpreadsheet, title: t("exportPanel.indicatorsTitle"), description: t("exportPanel.indicatorsDescription"), action: t("exportPanel.exportCsv"), onExport: exportIndicators },
          { kind: "register", icon: FileText, title: t("exportPanel.registerTitle"), description: t("exportPanel.registerDescription"), action: t("exportPanel.exportCsv"), onExport: exportRegister, note: t("access.export.personalDataNote") },
          { kind: "full", icon: Database, title: t("exportPanel.fullTitle"), description: t("exportPanel.fullDescription"), action: t("exportPanel.exportJson"), onExport: exportFull, note: t("access.export.personalDataNote") },
        ];

  return (
    <section aria-labelledby={headingId} lang={lang} dir={dirFor(lang)} className="min-w-0 space-y-4">
      <h3 id={headingId} className="flex items-center gap-2 text-lg font-semibold">
        <Download aria-hidden="true" className="h-5 w-5 shrink-0" />
        {t("exportPanel.title")}
      </h3>

      {audience === "donor" && (
        <Note icon={Info} className="border bg-muted/40 p-3 text-sm">
          {t("access.export.donorNote")}
        </Note>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        {cards.map((card) => (
          <ExportCard key={card.kind} {...card} busy={loading === card.kind} />
        ))}
      </div>
    </section>
  );
}

interface ExportCardProps {
  kind: ExportKind;
  icon: LucideIcon;
  title: string;
  description: string;
  action: string;
  onExport: () => void;
  /** A reminder under the button (files with personal data). */
  note?: string;
  busy?: boolean;
}

function ExportCard({ icon: Icon, title, description, action, onExport, note, busy }: ExportCardProps) {
  const titleId = useId();
  const actionId = useId();
  return (
    <Card className="min-w-0">
      <CardContent className="flex h-full flex-col gap-3 pt-6 text-center">
        <Icon aria-hidden="true" className="mx-auto h-10 w-10 text-muted-foreground" />
        <h4 id={titleId} className="font-medium">{title}</h4>
        <p className="text-xs text-muted-foreground">{description}</p>
        <Button
          // Not disabled while busy: a focused button that becomes disabled loses keyboard focus.
          onClick={() => {
            if (!busy) onExport();
          }}
          aria-disabled={busy || undefined}
          variant="outline"
          className="mt-auto min-h-11 w-full"
          // The name says which file ("Export CSV Indicators"): every card has the same button text.
          aria-labelledby={`${actionId} ${titleId}`}
        >
          {busy ? <Loader2 aria-hidden="true" className="me-2 h-4 w-4 animate-spin" /> : <Download aria-hidden="true" className="me-2 h-4 w-4" />}
          <span id={actionId}>{action}</span>
        </Button>
        {note && (
          <Note icon={ShieldAlert} className="text-xs font-medium">
            {note}
          </Note>
        )}
      </CardContent>
    </Card>
  );
}

/** An explanation with its icon (role="note"). */
function Note({ icon: Icon, className, children }: { icon: LucideIcon; className?: string; children: ReactNode }) {
  return (
    <p role="note" className={cn("flex items-start gap-2 rounded-md text-start", className)}>
      <Icon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}
