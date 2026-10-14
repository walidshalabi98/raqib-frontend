import { Fragment, useId, useState } from "react";
import type { TFunction } from "i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "@/services/api";
import type { Indicator, Milestone, ResultNode } from "@/types/api";
import { MethodPill } from "@/components/common/MethodPill";
import { StatusDot } from "@/components/common/StatusDot";
import { LevelBadge } from "@/components/common/LevelBadge";
import { AiSuggestedLabel } from "@/components/common/AiSuggestedLabel";
import { StandardBadge } from "@/components/kpi/StandardBadge";
import { labelWithName, nameLanguage } from "@/components/kpi/labelWithName";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { IndicatorDialog } from "@/components/project/IndicatorDialog";
import { ResultsChainPanel } from "@/components/project/ResultsChainPanel";
import { invalidateFrameworkData, useFrameworkResults } from "@/hooks/useFrameworkData";
import { usePermissions } from "@/hooks/usePermissions";
import { useUserLanguage } from "@/i18n/useUserLanguage";
import type { AppLanguage } from "@/i18n";
import { canApproveIndicator, needsAiReviewLabel } from "@/lib/indicatorForm";
import { queryKeys } from "@/lib/queryKeys";
import {
  ChevronDown, ChevronRight, Loader2, Plus, Pencil,
  AlertTriangle, Clock, CheckCircle2, Users, BadgeCheck,
} from "lucide-react";
import { toast } from "sonner";
import { errorMessage } from "@/lib/utils";

type TimelineFields = Pick<Indicator, "startDate" | "endDate" | "status">;

function formatDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" });
}

function getTimelineStatus(ind: TimelineFields) {
  if (!ind.startDate || !ind.endDate) return null;
  const now = new Date();
  const start = new Date(ind.startDate);
  const end = new Date(ind.endDate);
  const total = end.getTime() - start.getTime();
  const elapsed = now.getTime() - start.getTime();
  const progress = Math.max(0, Math.min(100, (elapsed / total) * 100));

  const isOverdue = now > end && ind.status !== "completed";
  const daysLeft = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  return { progress, isOverdue, daysLeft, start, end };
}

function TimelineBar({ ind }: { ind: TimelineFields }) {
  const tl = getTimelineStatus(ind);
  if (!tl) return <span className="text-xs text-muted-foreground">No timeline</span>;

  const barColor = tl.isOverdue
    ? "bg-danger"
    : ind.status === "completed"
    ? "bg-success"
    : ind.status === "at_risk"
    ? "bg-warning"
    : "bg-primary";

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span>{formatDate(ind.startDate)}</span>
        <span>{formatDate(ind.endDate)}</span>
      </div>
      <div className="h-2 rounded-full bg-secondary overflow-hidden">
        <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${tl.progress}%` }} />
      </div>
      <div className="text-[10px]">
        {tl.isOverdue ? (
          <span className="text-danger font-medium flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" /> Overdue by {Math.abs(tl.daysLeft)} days
          </span>
        ) : ind.status === "completed" ? (
          <span className="text-success font-medium flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3" /> Completed
          </span>
        ) : (
          <span className="text-muted-foreground flex items-center gap-1">
            <Clock className="h-3 w-3" /> {tl.daysLeft} days remaining
          </span>
        )}
      </div>
    </div>
  );
}

// Create manual framework dialog
function CreateFrameworkDialog({ projectId, onCreated }: { projectId: string; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");

  const handleCreate = async () => {
    if (!name.trim()) { toast.error("Please enter a framework name"); return; }
    setSaving(true);
    try {
      await api.createManualFramework(projectId, name);
      toast.success("Framework created — add your indicators");
      setOpen(false);
      setName("");
      onCreated();
    } catch (err) {
      toast.error(errorMessage(err, "Failed to create framework"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm"><Plus className="h-4 w-4 mr-1.5" /> New Framework</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>Create Manual Framework</DialogTitle></DialogHeader>
        <div className="space-y-4 pt-2">
          <div><Label>Framework Name *</Label><Input className="mt-1" placeholder="e.g. Custom Logframe v2" value={name} onChange={(e) => setName(e.target.value)} /></div>
          <Button className="w-full" onClick={handleCreate} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create Framework"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Where an indicator comes from (knowledge/me-foundations.md §3 provenance; design section 9.5): the provenance text,
 * the standard or library badge, and the library id when the badge shows the standard reference instead.
 */
function SourceCell({ indicator, lang }: { indicator: Indicator; lang: AppLanguage }) {
  const { t } = useTranslation(undefined, { lng: lang });
  return (
    <div lang={lang} className="flex min-w-0 flex-col items-start gap-1">
      <span className="text-xs text-muted-foreground">{t(`provenance.${indicator.provenance}`)}</span>
      <StandardBadge libraryId={indicator.libraryId} standardReferenceCode={indicator.standardReferenceCode} provenance={indicator.provenance} lang={lang} />
      {indicator.libraryId && indicator.standardReferenceCode && (
        <span className="font-mono text-[10px] text-muted-foreground" dir="ltr">{indicator.libraryId}</span>
      )}
    </div>
  );
}

/** An indicator's name in the user's language: the Arabic name when the user reads Arabic and there is one. */
function indicatorNameFor(indicator: Pick<Indicator, "indicatorText" | "indicatorTextAr">, lang: AppLanguage): string {
  return lang === "ar" && indicator.indicatorTextAr ? indicator.indicatorTextAr : indicator.indicatorText;
}

/** The name a row shows (indicatorNameFor); an Arabic name is marked as Arabic on this English screen. */
function IndicatorName({ indicator, lang }: { indicator: Indicator; lang: AppLanguage }) {
  const name = indicatorNameFor(indicator, lang);
  return nameLanguage(name) === "ar" ? <span lang="ar" dir="rtl">{name}</span> : <>{name}</>;
}

/**
 * Edit and Approve in a row: 44 px tall on phones (UX_STANDARDS §7), 28 px from sm up where the table has room.
 * Replaces size sm's padding; its h-9 stays, and min-h-11 lifts it below sm.
 */
const ROW_ACTION_CLASS = "min-h-11 px-2 sm:h-7 sm:min-h-0";

/**
 * The accessible name of a row action, "<action> <indicator name>" (`key`, e.g. "Approve {{name}}"), naming the
 * indicator as the row shows it (indicatorNameFor). A name in the label's language goes in aria-label. A name in the
 * other language (an English name in an Arabic label, when the indicator has no Arabic name) is marked with its own
 * language as labelWithName does (WCAG 3.1.2): the label is then a hidden element, referenced by aria-labelledby, so
 * the name is not repeated on screen or in find-in-page. The visible word starts the label either way (WCAG 2.5.3).
 */
function rowActionName(t: TFunction, key: string, name: string, lang: AppLanguage, labelId: string) {
  if (nameLanguage(name) === lang) return { props: { "aria-label": t(key, { name }) }, label: null };
  return {
    props: { "aria-labelledby": labelId },
    label: <span id={labelId} hidden>{labelWithName(t, key, name)}</span>,
  };
}

/**
 * The framework's indicators as a table or a timeline, with the results chain panel (and its KPI Assistant) above.
 * Phase 4 (design section 9.5, D18): a Source column, the "AI suggested — review before approval" label until the
 * indicator itself is approved (table and timeline), and for org and platform admins an Approve button on unapproved
 * AI-made indicators in any framework status, and on every unapproved indicator once the framework is approved or
 * active (canApproveIndicator).
 *
 * `canEdit` (org staff on a project that is not archived) shows adding, editing, approving and creating a framework,
 * and the results chain's controls; everyone else (donor viewers, an archived project) reads.
 */
export function IndicatorTable({ projectId, canEdit = true }: { projectId: string; canEdit?: boolean }) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [view, setView] = useState<"table" | "timeline">("table");

  const lang = useUserLanguage();
  const { t } = useTranslation(undefined, { lng: lang });
  const { role } = usePermissions();
  const baseId = useId();

  const { data: framework, isLoading } = useQuery({
    queryKey: queryKeys.framework(projectId),
    queryFn: () => api.getFramework(projectId),
  });
  // The results chain query carries the latest nodes after edits in the results panel.
  const { data: resultsData } = useFrameworkResults(framework?.id);
  const resultNodes: ResultNode[] = resultsData ?? framework?.resultNodes ?? [];

  const refresh = () => queryClient.invalidateQueries({ queryKey: queryKeys.framework(projectId) });

  const approveMutation = useMutation({
    mutationFn: (ind: Indicator) => api.approveIndicator(ind.id),
    onSuccess: (_saved, ind) => {
      toast.success(t("indicatorTable.toast.approved"));
      void invalidateFrameworkData(queryClient, { projectId, frameworkId: ind.frameworkId });
    },
    onError: (err) => {
      toast.error(t("indicatorTable.toast.approveFailed"), { description: errorMessage(err, "") || undefined });
    },
  });
  const approvingId = approveMutation.isPending ? approveMutation.variables?.id : undefined;

  // This screen is English apart from the translated parts, so those carry their own lang (WCAG 3.1.2).
  const editButton = (ind: Indicator) => {
    const name = rowActionName(t, "indicatorTable.editIndicator", indicatorNameFor(ind, lang), lang, `${baseId}-edit-${ind.id}`);
    return (
      <IndicatorDialog
        mode="edit"
        projectId={projectId}
        frameworkId={ind.frameworkId}
        indicator={ind}
        resultNodes={resultNodes}
        trigger={
          <Button variant="ghost" size="sm" className={ROW_ACTION_CLASS} lang={lang} {...name.props}>
            <Pencil aria-hidden="true" className="h-3 w-3 me-1" /> {t("indicatorTable.edit")}
            {name.label}
          </Button>
        }
      />
    );
  };
  const approveButton = (ind: Indicator) => {
    const name = rowActionName(t, "indicatorTable.approveIndicator", indicatorNameFor(ind, lang), lang, `${baseId}-approve-${ind.id}`);
    return (
      <Button
        variant="outline"
        size="sm"
        className={ROW_ACTION_CLASS}
        lang={lang}
        {...name.props}
        aria-disabled={approvingId ? "true" : undefined}
        onClick={() => { if (!approveMutation.isPending) approveMutation.mutate(ind); }}
      >
        {approvingId === ind.id
          ? <Loader2 aria-hidden="true" className="h-3 w-3 me-1 animate-spin" />
          : <BadgeCheck aria-hidden="true" className="h-3 w-3 me-1" />}
        {t("indicatorTable.approve")}
        {name.label}
      </Button>
    );
  };

  if (isLoading) return <div className="flex justify-center p-8"><Loader2 className="h-5 w-5 animate-spin" /></div>;

  const indicators = framework?.indicators || [];

  if (!framework) {
    return (
      <div className="space-y-4">
        <div className="card-surface p-8 text-center text-muted-foreground">
          <p>No framework generated yet.</p>
          {canEdit && <p className="text-sm mt-1">Generate one with AI or create a manual framework.</p>}
        </div>
        {canEdit && (
          <div className="flex justify-center">
            <CreateFrameworkDialog projectId={projectId} onCreated={refresh} />
          </div>
        )}
      </div>
    );
  }

  const overdue = indicators.filter((i) => {
    const tl = getTimelineStatus(i);
    return tl?.isOverdue;
  }).length;

  return (
    <div className="space-y-4">
      {/* Header with actions */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold">{framework.name || "M&E Framework"}</h3>
          <Badge variant="outline" className="text-[10px]">v{framework.version}</Badge>
          <Badge variant="outline" className="text-[10px] capitalize">{framework.status}</Badge>
          {overdue > 0 && (
            <Badge className="text-[10px] bg-red-100 text-red-700">
              <AlertTriangle className="h-3 w-3 mr-1" /> {overdue} overdue
            </Badge>
          )}
        </div>
        {/* Wraps at 375 px, so "New Framework" is never clipped. */}
        <div className="flex flex-wrap items-center gap-2">
          {/* View toggle */}
          <div className="flex rounded-lg border overflow-hidden">
            <button onClick={() => setView("table")} className={`px-3 py-1.5 text-xs font-medium ${view === "table" ? "bg-primary text-primary-foreground" : "hover:bg-secondary"}`}>Table</button>
            <button onClick={() => setView("timeline")} className={`px-3 py-1.5 text-xs font-medium ${view === "timeline" ? "bg-primary text-primary-foreground" : "hover:bg-secondary"}`}>Timeline</button>
          </div>
          {canEdit && (
            <>
              <IndicatorDialog
                mode="create"
                projectId={projectId}
                frameworkId={framework.id}
                resultNodes={resultNodes}
                trigger={
                  <Button variant="outline" size="sm" lang={lang}>
                    <Plus aria-hidden="true" className="h-4 w-4 me-1.5" /> {t("indicatorTable.addIndicator")}
                  </Button>
                }
              />
              <CreateFrameworkDialog projectId={projectId} onCreated={refresh} />
            </>
          )}
        </div>
      </div>

      <ResultsChainPanel projectId={projectId} frameworkId={framework.id} indicators={indicators} readOnly={!canEdit} />

      {/* Table View */}
      {view === "table" && (
        // Focusable so keyboard users can scroll it sideways on a phone too, also when it holds no buttons (donor
        // viewers, archived projects: WCAG 2.1.1, axe scrollable-region-focusable).
        <div
          role="region"
          aria-label={t("indicatorTable.regionLabel")}
          tabIndex={0}
          className="card-surface overflow-x-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {/* A minimum width: on a phone the table scrolls sideways instead of squeezing the indicator names. */}
          <table className="w-full min-w-[56rem] text-sm">
            <thead className="bg-secondary/50">
              <tr>
                <th className="w-8" />
                <th className="text-left px-3 py-3 font-medium text-muted-foreground">Indicator</th>
                <th className="text-left px-3 py-3 font-medium text-muted-foreground">Level</th>
                <th className="text-start px-3 py-3 font-medium text-muted-foreground" lang={lang}>{t("indicatorTable.source")}</th>
                <th className="text-left px-3 py-3 font-medium text-muted-foreground">Method</th>
                <th className="text-left px-3 py-3 font-medium text-muted-foreground hidden md:table-cell">Target</th>
                <th className="text-left px-3 py-3 font-medium text-muted-foreground">Current</th>
                <th className="text-left px-3 py-3 font-medium text-muted-foreground hidden lg:table-cell">Timeline</th>
                <th className="text-center px-3 py-3 font-medium text-muted-foreground">Status</th>
                {canEdit && <th className="text-center px-3 py-3 font-medium text-muted-foreground w-16">Edit</th>}
              </tr>
            </thead>
            <tbody className="divide-y">
              {indicators.map((ind) => (
                <Fragment key={ind.id}>
                  <tr
                    className="hover:bg-secondary/30 cursor-pointer transition-colors"
                    onClick={() => setExpanded(expanded === ind.id ? null : ind.id)}
                  >
                    <td className="pl-3">
                      {expanded === ind.id ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                    </td>
                    <td className="px-3 py-3 font-medium max-w-[250px]">
                      <div><IndicatorName indicator={ind} lang={lang} /></div>
                      {ind.result && (
                        <span className="mt-0.5 inline-block font-mono text-[10px] text-muted-foreground" title={ind.result.text} dir="ltr">
                          {ind.result.code}
                        </span>
                      )}
                      {needsAiReviewLabel(ind.provenance, ind.isApproved) && (
                        <div lang={lang} className="mt-1"><AiSuggestedLabel lang={lang} /></div>
                      )}
                      {ind.responsibility && (
                        <span className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                          <Users className="h-3 w-3" /> {ind.responsibility}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3"><LevelBadge level={ind.level} /></td>
                    <td className="px-3 py-3 min-w-[8rem]"><SourceCell indicator={ind} lang={lang} /></td>
                    <td className="px-3 py-3"><MethodPill method={ind.dataCollectionMethod} size="xs" /></td>
                    <td className="px-3 py-3 text-muted-foreground hidden md:table-cell">{ind.targetValue || "N/A"}</td>
                    <td className="px-3 py-3 font-medium">{ind.currentValue || "N/A"}</td>
                    <td className="px-3 py-3 hidden lg:table-cell w-44">
                      <TimelineBar ind={ind} />
                    </td>
                    <td className="px-3 py-3 text-center"><StatusDot status={ind.status} showLabel /></td>
                    {canEdit && (
                      <td className="px-3 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                        {/* 8 px apart on phones, so a slip of the finger on Edit does not approve. */}
                        <div className="flex flex-col items-center gap-2 sm:gap-1">
                          {editButton(ind)}
                          {canApproveIndicator(role, ind, framework.status) && approveButton(ind)}
                        </div>
                      </td>
                    )}
                  </tr>
                  {expanded === ind.id && (
                    <tr key={`${ind.id}-detail`}>
                      <td colSpan={canEdit ? 10 : 9} className="px-6 py-4 bg-secondary/20">
                        <div className="grid md:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            {ind.aiRationale && (
                              <div className="flex items-start gap-2">
                                <span className="text-xs font-semibold text-primary shrink-0">AI Rationale:</span>
                                <span className="text-xs text-muted-foreground">{ind.aiRationale}</span>
                              </div>
                            )}
                            <div className="flex gap-4 text-xs text-muted-foreground">
                              <span><strong>Frequency:</strong> {(ind.frequency || "").replace("_", " ")}</span>
                              <span><strong>Baseline:</strong> {ind.baselineValue || "N/A"}</span>
                              <span><strong>Unit:</strong> {ind.unit || "N/A"}</span>
                            </div>
                            {(Array.isArray(ind.phases) && ind.phases.length > 0) && (
                              <div className="flex gap-1 flex-wrap">
                                {ind.phases.map((p: string) => (
                                  <span key={p} className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground capitalize">{p}</span>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="space-y-2">
                            {(ind.startDate || ind.endDate) && (
                              <div className="text-xs space-y-1">
                                <div className="flex gap-4">
                                  <span><strong>Planned:</strong> {formatDate(ind.startDate)} → {formatDate(ind.endDate)}</span>
                                </div>
                                {(ind.actualStartDate || ind.actualEndDate) && (
                                  <div className="flex gap-4">
                                    <span><strong>Actual:</strong> {formatDate(ind.actualStartDate)} → {formatDate(ind.actualEndDate)}</span>
                                  </div>
                                )}
                              </div>
                            )}
                            {Array.isArray(ind.milestones) && ind.milestones.length > 0 && (
                              <div className="space-y-1">
                                <span className="text-xs font-semibold">Milestones:</span>
                                {ind.milestones.map((m: Milestone, i: number) => (
                                  <div key={i} className="flex items-center gap-2 text-xs">
                                    <span className={`h-2 w-2 rounded-full ${m.completed ? "bg-success" : "bg-muted-foreground/30"}`} />
                                    <span className="text-muted-foreground">{m.label}</span>
                                    <span className="text-[10px] text-muted-foreground">{formatDate(m.date)}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Timeline (Gantt-like) View */}
      {view === "timeline" && (
        <div className="card-surface p-5 space-y-3">
          <div className="space-y-2">
            {indicators.map((ind) => {
              const tl = getTimelineStatus(ind);
              return (
                <div key={ind.id} className="flex items-start gap-4 py-3 border-b last:border-0">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <LevelBadge level={ind.level} />
                      <span className="text-sm font-medium truncate"><IndicatorName indicator={ind} lang={lang} /></span>
                    </div>
                    {needsAiReviewLabel(ind.provenance, ind.isApproved) && (
                      <div lang={lang} className="mb-1"><AiSuggestedLabel lang={lang} /></div>
                    )}
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <StatusDot status={ind.status} showLabel />
                      {ind.responsibility && <span className="flex items-center gap-1"><Users className="h-3 w-3" />{ind.responsibility}</span>}
                      <span>{(ind.frequency || "").replace("_", " ")}</span>
                    </div>
                  </div>
                  <div className="w-52 shrink-0">
                    <TimelineBar ind={ind} />
                  </div>
                  {canEdit && (
                    <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                      {editButton(ind)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {indicators.length === 0 && (
            <p lang={lang} className="text-sm text-muted-foreground text-center py-6">{t(canEdit ? "indicatorTable.empty" : "indicatorTable.emptyReadOnly")}</p>
          )}
        </div>
      )}
    </div>
  );
}
