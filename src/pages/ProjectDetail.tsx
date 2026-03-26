import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/services/api";
import { SECTOR_LABELS } from "@/data/mockData";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { MetricCard } from "@/components/common/MetricCard";
import { IndicatorTable } from "@/components/project/IndicatorTable";
import { KPIScorecard } from "@/components/project/KPIScorecard";
import { TrendChart } from "@/components/project/TrendChart";
import { AssessmentPipeline } from "@/components/project/AssessmentPipeline";
import { AssessmentModal } from "@/components/project/AssessmentModal";
import { ReportsList } from "@/components/project/ReportsList";
import { QualitativeCards } from "@/components/project/QualitativeCards";
import DocumentManager from "@/components/project/DocumentManager";
import RiskAlerts from "@/components/project/RiskAlerts";
import ExportPanel from "@/components/project/ExportPanel";
import { ArrowLeft, Download, ClipboardCheck, BarChart3, Upload, Loader2, MapPin } from "lucide-react";
import { lazy, Suspense, Component, type ReactNode } from "react";

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

function getStageIndex(status: string): number {
  const map: Record<string, number> = { setup: 0, framework_review: 1, active: 2, completed: 5, archived: 5 };
  return map[status] || 0;
}

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();

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
  const onTrack = indicators.filter((i: any) => i.status === "on_track").length;
  const atRisk = indicators.filter((i: any) => i.status === "at_risk").length;
  const offTrack = indicators.filter((i: any) => i.status === "off_track").length;

  const tabs = [
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
        <Link to="/projects" className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{project.name}</h1>
          <p className="text-sm text-muted-foreground">{project.donor} · {SECTOR_LABELS[project.sector] || project.sector}</p>
        </div>
      </div>

      <Tabs defaultValue="overview" className="w-full">
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
            <h3 className="text-sm font-semibold mb-4">Project Timeline</h3>
            <div className="flex items-center overflow-x-auto pb-2">
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
            <Button variant="outline" size="sm"><ClipboardCheck className="h-4 w-4 mr-1.5" /> Order Assessment</Button>
          </div>
        </TabsContent>

        {/* M&E Framework */}
        <TabsContent value="me-framework" className="space-y-4 mt-5">
          {isSetup && (
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
        <TabsContent value="dashboard" className="space-y-5 mt-5">
          <KPIScorecard projectId={id!} />
          <TrendChart projectId={id!} />
        </TabsContent>

        {/* Risk Alerts */}
        <TabsContent value="risks" className="mt-5">
          <RiskAlerts projectId={id!} />
        </TabsContent>

        {/* Assessments */}
        <TabsContent value="assessments" className="space-y-4 mt-5">
          <div className="flex justify-end"><AssessmentModal /></div>
          <AssessmentPipeline projectId={id!} />
        </TabsContent>

        {/* Reports */}
        <TabsContent value="reports" className="mt-5">
          <ReportsList projectId={id!} />
        </TabsContent>

        {/* Documents */}
        <TabsContent value="documents" className="mt-5">
          <DocumentManager projectId={id!} />
        </TabsContent>

        {/* Qualitative */}
        <TabsContent value="qualitative" className="mt-5">
          <QualitativeCards projectId={id!} />
        </TabsContent>

        {/* Export */}
        <TabsContent value="export" className="mt-5">
          <ExportPanel projectId={id!} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
