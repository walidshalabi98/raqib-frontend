import { useParams, Link } from "react-router-dom";
import { mockProjects, mockIndicators, SECTOR_LABELS } from "@/data/mockData";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { MetricCard } from "@/components/common/MetricCard";
import { StatusDot } from "@/components/common/StatusDot";
import { IndicatorTable } from "@/components/project/IndicatorTable";
import { KPIScorecard } from "@/components/project/KPIScorecard";
import { TrendChart } from "@/components/project/TrendChart";
import { AssessmentPipeline } from "@/components/project/AssessmentPipeline";
import { AssessmentModal } from "@/components/project/AssessmentModal";
import { ReportsList } from "@/components/project/ReportsList";
import { DocumentUpload } from "@/components/project/DocumentUpload";
import { QualitativeCards } from "@/components/project/QualitativeCards";
import { ArrowLeft, Download, ClipboardCheck, BarChart3, Upload } from "lucide-react";

const timelineStages = ["Setup", "Baseline", "Implementation", "Midterm", "Endline", "Complete"];
const currentStage = 2; // Implementation

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const project = mockProjects.find(p => p.id === id) || mockProjects[0];
  const isSetup = project.status === "setup";

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center gap-3">
        <Link to="/projects" className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{project.name}</h1>
          <p className="text-sm text-muted-foreground">{project.donor} · {SECTOR_LABELS[project.sector]}</p>
        </div>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="w-full justify-start overflow-x-auto bg-transparent border-b rounded-none h-auto p-0 gap-0">
          {["Overview", "M&E Framework", "Dashboard", "Assessments", "Reports", "Documents", "Qualitative"].map(tab => (
            <TabsTrigger
              key={tab}
              value={tab.toLowerCase().replace(/ /g, "-").replace("&", "and")}
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary px-4 py-2.5 text-sm"
            >
              {tab}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* Tab 1: Overview */}
        <TabsContent value="overview" className="space-y-5 mt-5">
          <div className="grid lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 card-surface p-5">
              <h3 className="text-sm font-semibold mb-3">Project Details</h3>
              <div className="grid sm:grid-cols-2 gap-y-3 gap-x-6 text-sm">
                <div><span className="text-muted-foreground">Sector:</span> <span className="font-medium">{SECTOR_LABELS[project.sector]}</span></div>
                <div><span className="text-muted-foreground">Donor:</span> <span className="font-medium">{project.donor}</span></div>
                <div><span className="text-muted-foreground">Budget:</span> <span className="font-medium">${project.budget_usd.toLocaleString()}</span></div>
                <div><span className="text-muted-foreground">Beneficiaries:</span> <span className="font-medium">{project.target_beneficiaries.toLocaleString()}</span></div>
                <div><span className="text-muted-foreground">Period:</span> <span className="font-medium">{project.start_date} — {project.end_date}</span></div>
                <div><span className="text-muted-foreground">Location:</span> <span className="font-medium">{project.geographic_scope}</span></div>
              </div>
            </div>
            <div className="space-y-4">
              <MetricCard label="On Track" value={project.indicators_on_track} dotColor="bg-success" />
              <MetricCard label="At Risk" value={project.indicators_at_risk} dotColor="bg-warning" />
              <MetricCard label="Off Track" value={project.indicators_off_track} dotColor="bg-danger" />
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

          <div className="flex gap-3 flex-wrap">
            <Button variant="outline" size="sm"><BarChart3 className="h-4 w-4 mr-1.5" /> View Dashboard</Button>
            <Button variant="outline" size="sm"><Download className="h-4 w-4 mr-1.5" /> Download Report</Button>
            <Button variant="outline" size="sm"><ClipboardCheck className="h-4 w-4 mr-1.5" /> Order Assessment</Button>
          </div>
        </TabsContent>

        {/* Tab 2: M&E Framework */}
        <TabsContent value="mand-e-framework" className="mt-5">
          {isSetup ? (
            <div className="card-surface p-8 text-center">
              <Upload className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <h3 className="text-lg font-semibold mb-2">Generate M&E Framework</h3>
              <p className="text-sm text-muted-foreground mb-4 max-w-md mx-auto">Upload your project documents and our AI will generate a complete M&E framework with indicators, methods, and targets.</p>
              <Link to={`/wizard/${project.id}`}>
                <Button>Generate Framework</Button>
              </Link>
            </div>
          ) : (
            <IndicatorTable />
          )}
        </TabsContent>

        {/* Tab 3: Dashboard */}
        <TabsContent value="dashboard" className="space-y-5 mt-5">
          <div className="flex flex-wrap gap-3">
            <select className="text-sm rounded-lg border bg-card px-3 py-2">
              <option>All Phases</option><option>Baseline</option><option>Midterm</option><option>Endline</option>
            </select>
            <select className="text-sm rounded-lg border bg-card px-3 py-2">
              <option>All Methods</option><option>HH Survey</option><option>FGD</option><option>KII</option>
            </select>
            <select className="text-sm rounded-lg border bg-card px-3 py-2">
              <option>All Areas</option><option>Hebron City</option><option>Hebron Old City</option><option>Dura</option>
            </select>
          </div>
          <KPIScorecard />
          <TrendChart />
          <div className="card-surface p-5">
            <h3 className="text-sm font-semibold mb-3">Geographic Breakdown — Hebron Governorate</h3>
            <table className="w-full text-sm">
              <thead><tr className="border-b">
                <th className="text-left py-2 font-medium text-muted-foreground">Locality</th>
                <th className="text-left py-2 font-medium text-muted-foreground">Beneficiaries</th>
                <th className="text-left py-2 font-medium text-muted-foreground">Training Complete</th>
                <th className="text-left py-2 font-medium text-muted-foreground">Status</th>
              </tr></thead>
              <tbody className="divide-y">
                {[
                  { loc: "Hebron City", ben: 380, comp: 245, status: "on_track" as const },
                  { loc: "Hebron Old City", ben: 210, comp: 148, status: "on_track" as const },
                  { loc: "Dura", ben: 185, comp: 112, status: "at_risk" as const },
                  { loc: "Yatta", ben: 160, comp: 98, status: "at_risk" as const },
                  { loc: "Halhul", ben: 145, comp: 87, status: "on_track" as const },
                  { loc: "Beit Ummar", ben: 120, comp: 53, status: "off_track" as const },
                ].map(r => (
                  <tr key={r.loc} className="hover:bg-secondary/30">
                    <td className="py-2.5 font-medium">{r.loc}</td>
                    <td className="py-2.5 text-muted-foreground">{r.ben}</td>
                    <td className="py-2.5 text-muted-foreground">{r.comp}</td>
                    <td className="py-2.5"><StatusDot status={r.status} showLabel /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* Tab 4: Assessments */}
        <TabsContent value="assessments" className="space-y-4 mt-5">
          <div className="flex justify-end">
            <AssessmentModal />
          </div>
          <AssessmentPipeline />
        </TabsContent>

        {/* Tab 5: Reports */}
        <TabsContent value="reports" className="mt-5">
          <ReportsList />
        </TabsContent>

        {/* Tab 6: Documents */}
        <TabsContent value="documents" className="mt-5">
          <DocumentUpload />
        </TabsContent>

        {/* Tab 7: Qualitative */}
        <TabsContent value="qualitative" className="mt-5">
          <QualitativeCards />
        </TabsContent>
      </Tabs>
    </div>
  );
}
