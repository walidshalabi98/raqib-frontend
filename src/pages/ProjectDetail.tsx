import { useParams, useSearchParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "@/services/api";
import { dirFor } from "@/i18n";
import { useUserLanguage } from "@/i18n/useUserLanguage";
import { usePermissions } from "@/hooks/usePermissions";
import { SECTOR_LABELS } from "@/lib/constants";
import { PROJECT_TAB_VALUES, projectTabFrom, type ProjectTab } from "@/lib/projectTabs";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { MetricCard } from "@/components/common/MetricCard";
import { IndicatorTable } from "@/components/project/IndicatorTable";
import { ProjectDashboard } from "@/components/project/ProjectDashboard";
import { AssessmentPipeline } from "@/components/project/AssessmentPipeline";
import { AssessmentModal } from "@/components/project/AssessmentModal";
import { ReportsList } from "@/components/project/ReportsList";
import { QualitativeCards } from "@/components/project/QualitativeCards";
import DocumentManager from "@/components/project/DocumentManager";
import RiskAlerts from "@/components/project/RiskAlerts";
import ExportPanel from "@/components/project/ExportPanel";
import { ArrowLeft, Download, ClipboardCheck, BarChart3, Upload, Loader2, MapPin, Eye } from "lucide-react";
import { lazy, Suspense, Component, useId, type ReactNode } from "react";

const PalestineMap = lazy(() => import("@/components/project/PalestineMap"));

// Error boundary to prevent map crashes from breaking the whole page
class MapErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  render() {
    if (this.state.hasError) {
      return (
        <div className="h-[350px] flex items-center justify-center bg-muted/30 rounded-lg border">
          <div className="text-center text-muted-foreground">
            <MapPin className="h-8 w-8 mx-auto mb-2" />
            <p className="text-sm">Map could not be loaded</p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const timelineStages = ["Setup", "Baseline", "Implementation", "Midterm", "Endline", "Complete"];

/**
 * The project page's tabs are PROJECT_TAB_VALUES (src/lib/projectTabs.ts). `?tab=<value>` opens one (links from the
 * Reports page, notifications and the AI Wizard's "Open the framework" action).
 */
const isProjectTab = (value: string | null): value is ProjectTab => (PROJECT_TAB_VALUES as readonly (string | null)[]).includes(value);

function getStageIndex(status: string): number {
  const map: Record<string, number> = { setup: 0, framework_review: 1, active: 2, completed: 5, archived: 5 };
  return map[status] || 0;
}

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  // The page decides what each role sees and passes it down; the server enforces every rule.
  const { can, readOnly } = usePermissions();
  const lang = useUserLanguage();
  const { t } = useTranslation(undefined, { lng: lang });
  const timelineHeadingId = useId();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab: ProjectTab = projectTabFrom(searchParams.get("tab"));
  // The open tab is in the address, so it can be linked to and survives a reload; switching replaces the entry.
  const selectTab = (value: string) => {
    if (!isProjectTab(value)) return;
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value === "overview") next.delete("tab");
        else next.set("tab", value);
        return next;
      },
      { replace: true },
    );
  };

  const { data: project, isLoading } = useQuery({
    queryKey: ['project', id],
    queryFn: () => api.getProject(id!),
    enabled: !!id,
  });

  if (isLoading || !project) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const isSetup = project.status === "setup";
  const currentStage = getStageIndex(project.status);
  const framework = project.frameworks?.[0];
  const indicators = framework?.indicators || [];
  const onTrack = indicators.filter((i) => i.status === "on_track").length;
  const atRisk = indicators.filter((i) => i.status === "at_risk").length;
  const offTrack = indicators.filter((i) => i.status === "off_track").length;

  const tabs: { label: string; value: ProjectTab }[] = [
    { label: "Overview", value: "overview" },
    { label: "M&E Framework", value: "me-framework" },
    { label: "Dashboard", value: "dashboard" },
    { label: "Risk Alerts", value: "risks" },
    { label: "Assessments", value: "assessments" },
    { label: "Reports", value: "reports" },
    { label: "Documents", value: "documents" },
    { label: "Qualitative", value: "qualitative" },
    { label: "Export", value: "export" },
  ];

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center gap-3">
        <Link to="/projects" aria-label={t("projectDetail.backToProjects")} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{project.name}</h1>
          <p className="text-sm text-muted-foreground">{project.donor} · {SECTOR_LABELS[project.sector] || project.sector}</p>
        </div>
      </div>

      {readOnly && (
        <p role="note" lang={lang} dir={dirFor(lang)} className="flex items-start gap-2 rounded-md border bg-muted/40 px-3 py-2 text-start text-sm">
          <Eye aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{t("access.readOnlyBanner")}</span>
        </p>
      )}

      <Tabs value={tab} onValueChange={selectTab} className="w-full">
        <TabsList className="w-full justify-start overflow-x-auto bg-transparent border-b rounded-none h-auto p-0 gap-0">
          {tabs.map(tab => (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary px-4 py-2.5 text-sm whitespace-nowrap"
            >
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* Overview */}
        <TabsContent value="overview" className="space-y-5 mt-5">
          <div className="grid lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 card-surface p-5">
              <h3 className="text-sm font-semibold mb-3">Project Details</h3>
              <div className="grid sm:grid-cols-2 gap-y-3 gap-x-6 text-sm">
                <div><span className="text-muted-foreground">Sector:</span> <span className="font-medium">{SECTOR_LABELS[project.sector] || project.sector}</span></div>
                <div><span className="text-muted-foreground">Donor:</span> <span className="font-medium">{project.donor}</span></div>
                <div><span className="text-muted-foreground">Budget:</span> <span className="font-medium">${Number(project.budgetUsd || 0).toLocaleString()}</span></div>
                <div><span className="text-muted-foreground">Beneficiaries:</span> <span className="font-medium">{(project.targetBeneficiaries || 0).toLocaleString()}</span></div>
                <div><span className="text-muted-foreground">Period:</span> <span className="font-medium">{new Date(project.startDate).toLocaleDateString()} — {new Date(project.endDate).toLocaleDateString()}</span></div>
                <div><span className="text-muted-foreground">Location:</span> <span className="font-medium">{project.geographicScope || 'N/A'}</span></div>
              </div>
            </div>
            <div className="space-y-4">
              <MetricCard label="On Track" value={onTrack} dotColor="bg-success" />
              <MetricCard label="At Risk" value={atRisk} dotColor="bg-warning" />
              <MetricCard label="Off Track" value={offTrack} dotColor="bg-danger" />
            </div>
          </div>

          {/* Timeline */}
          <div className="card-surface p-5">
            <h3 id={timelineHeadingId} className="text-sm font-semibold mb-4">Project Timeline</h3>
            {/* Scrolls sideways on phones: focusable so keyboard users can scroll it too. */}
            <div role="region" aria-labelledby={timelineHeadingId} tabIndex={0} className="flex items-center overflow-x-auto pb-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              {timelineStages.map((stage, i) => (
                <div key={stage} className="flex items-center">
                  <div className="flex flex-col items-center">
                    <div className={`h-4 w-4 rounded-full border-2 ${
                      i < currentStage ? "bg-success border-success" : i === currentStage ? "bg-primary border-primary" : "bg-card border-muted-foreground/30"
                    }`} />
                    <span className={`text-[11px] mt-1.5 whitespace-nowrap ${i === currentStage ? "font-semibold text-primary" : "text-muted-foreground"}`}>{stage}</span>
                  </div>
                  {i < timelineStages.length - 1 && <div className={`h-0.5 w-12 mx-1 ${i < currentStage ? "bg-success" : "bg-muted-foreground/20"}`} />}
                </div>
              ))}
            </div>
          </div>

          {/* Map — always show, use project location or default to Palestine */}
          <div className="card-surface p-5">
            <h3 className="text-sm font-semibold mb-3">Geographic Coverage</h3>
            <MapErrorBoundary>
              <Suspense fallback={<div className="h-[350px] flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>}>
                <PalestineMap
                  data={[{
                    location: project.geographicScope || "Palestine",
                    value: project._count?.dataPoints || 1,
                    label: project.geographicScope ? "Data Points" : "Project Area",
                    status: project.status === "active" ? "on_track" : "not_started"
                  }]}
                  height="350px"
                />
              </Suspense>
            </MapErrorBoundary>
          </div>

          <div className="flex gap-3 flex-wrap">
            <Button variant="outline" size="sm"><BarChart3 className="h-4 w-4 mr-1.5" /> View Dashboard</Button>
            <Button variant="outline" size="sm"><Download className="h-4 w-4 mr-1.5" /> Download Report</Button>
            {can("assessment.request") && <Button variant="outline" size="sm"><ClipboardCheck className="h-4 w-4 mr-1.5" /> Order Assessment</Button>}
          </div>
        </TabsContent>

        {/* M&E Framework */}
        <TabsContent value="me-framework" className="space-y-4 mt-5">
          {isSetup && can("ai.run") && (
            <div className="card-surface p-6 text-center">
              <Upload className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <h3 className="text-lg font-semibold mb-2">Generate M&E Framework</h3>
              <p className="text-sm text-muted-foreground mb-4 max-w-md mx-auto">Upload your project documents and our AI will generate a complete M&E framework with indicators, timelines, and targets.</p>
              <Link to={`/wizard/${project.id}`}>
                <Button>Generate with AI</Button>
              </Link>
              <p className="text-xs text-muted-foreground mt-3">Or create a manual framework below</p>
            </div>
          )}
          <IndicatorTable projectId={id!} />
        </TabsContent>

        {/* Dashboard */}
        <TabsContent value="dashboard" className="mt-5">
          <ProjectDashboard projectId={id!} />
        </TabsContent>

        {/* Risk Alerts */}
        <TabsContent value="risks" className="mt-5">
          <RiskAlerts projectId={id!} readOnly={!can("ai.run")} />
        </TabsContent>

        {/* Assessments */}
        <TabsContent value="assessments" className="space-y-4 mt-5">
          {can("assessment.request") && <div className="flex justify-end"><AssessmentModal /></div>}
          <AssessmentPipeline projectId={id!} readOnly={!can("ai.review")} />
        </TabsContent>

        {/* Reports */}
        <TabsContent value="reports" className="mt-5">
          <ReportsList projectId={id!} canGenerate={can("report.generate")} canPublish={can("report.publish")} />
        </TabsContent>

        {/* Documents */}
        <TabsContent value="documents" className="mt-5">
          <DocumentManager projectId={id!} canManage={can("document.manage")} />
        </TabsContent>

        {/* Qualitative */}
        <TabsContent value="qualitative" className="mt-5">
          <QualitativeCards projectId={id!} readOnly={!can("qualitative.manage")} />
        </TabsContent>

        {/* Export */}
        <TabsContent value="export" className="mt-5">
          <ExportPanel projectId={id!} audience={can("export.personalData") ? "staff" : "donor"} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
