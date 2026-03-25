export const mockOrg = {
  id: "org-1",
  name: "Palestinian Youth Development Association",
  type: "local_ngo" as const,
  country: "Palestine",
  city: "Ramallah",
  contact_email: "info@pyda.ps",
  subscription_status: "active" as const,
};

export const mockUsers = [
  { id: "user-1", name: "Walid Hamad", role: "org_admin" as const, email: "walid@pyda.ps" },
  { id: "user-2", name: "Sara Khalil", role: "me_officer" as const, email: "sara@pyda.ps" },
  { id: "user-3", name: "Thomas Mueller", role: "donor_viewer" as const, email: "thomas@giz.de" },
];

export const mockProjects = [
  {
    id: "proj-1",
    name: "Youth Economic Empowerment in Hebron",
    sector: "livelihoods" as const,
    donor: "European Union",
    donor_type: "eu" as const,
    budget_usd: 500000,
    start_date: "2025-01-01",
    end_date: "2026-12-31",
    target_beneficiaries: 1200,
    geographic_scope: "Hebron Governorate",
    status: "active" as const,
    indicators_on_track: 7,
    indicators_at_risk: 3,
    indicators_off_track: 2,
    total_indicators: 12,
  },
  {
    id: "proj-2",
    name: "Women's Health Access in Nablus",
    sector: "health" as const,
    donor: "GIZ",
    donor_type: "giz" as const,
    budget_usd: 320000,
    start_date: "2025-03-01",
    end_date: "2027-02-28",
    target_beneficiaries: 800,
    geographic_scope: "Nablus Governorate",
    status: "active" as const,
    indicators_on_track: 5,
    indicators_at_risk: 2,
    indicators_off_track: 0,
    total_indicators: 7,
  },
  {
    id: "proj-3",
    name: "WASH Infrastructure Rehabilitation",
    sector: "wash" as const,
    donor: "UNICEF",
    donor_type: "undp" as const,
    budget_usd: 750000,
    start_date: "2025-06-01",
    end_date: "2027-05-31",
    target_beneficiaries: 3500,
    geographic_scope: "Jenin, Tubas",
    status: "setup" as const,
    indicators_on_track: 0,
    indicators_at_risk: 0,
    indicators_off_track: 0,
    total_indicators: 0,
  },
];

export type Method = "hh_survey" | "fgd" | "kii" | "observation" | "document_review" | "participatory";
export type IndicatorStatus = "on_track" | "at_risk" | "off_track" | "not_started";
export type IndicatorLevel = "impact" | "outcome" | "output" | "activity";

export const mockIndicators = [
  {
    id: "ind-1", indicator_text: "% HH reporting income increase >25%",
    level: "outcome" as IndicatorLevel, method: "hh_survey" as Method, frequency: "biannual",
    baseline_value: "12%", target_value: "45%", current_value: "28%",
    status: "on_track" as IndicatorStatus, phases: ["baseline", "endline"],
    ai_rationale: "Outcome-level change requires statistical comparison across time points with representative sample",
  },
  {
    id: "ind-2", indicator_text: "Perceived barriers to market access",
    level: "outcome" as IndicatorLevel, method: "fgd" as Method, frequency: "quarterly",
    baseline_value: "High", target_value: "Low", current_value: "Medium",
    status: "at_risk" as IndicatorStatus, phases: ["baseline", "midterm", "endline"],
    ai_rationale: "Perception data needs qualitative depth; group dynamics reveal collective barriers surveys miss",
  },
  {
    id: "ind-3", indicator_text: "# cooperatives registered & operational",
    level: "output" as IndicatorLevel, method: "document_review" as Method, frequency: "monthly",
    baseline_value: "0", target_value: "15", current_value: "11",
    status: "on_track" as IndicatorStatus, phases: ["ongoing"],
    ai_rationale: "Output-level; verifiable from registration records with no field cost required",
  },
  {
    id: "ind-4", indicator_text: "Quality of vocational training delivered",
    level: "output" as IndicatorLevel, method: "observation" as Method, frequency: "per_cohort",
    baseline_value: "N/A", target_value: "Score ≥4/5", current_value: "3.2/5",
    status: "at_risk" as IndicatorStatus, phases: ["ongoing"],
    ai_rationale: "Service delivery quality needs in-person verification via structured checklist",
  },
  {
    id: "ind-5", indicator_text: "Local gov support for market linkages",
    level: "outcome" as IndicatorLevel, method: "kii" as Method, frequency: "biannual",
    baseline_value: "Weak", target_value: "Strong", current_value: "Moderate",
    status: "on_track" as IndicatorStatus, phases: ["midterm", "endline"],
    ai_rationale: "Institutional perspective requires semi-structured interviews with officials and decision-makers",
  },
  {
    id: "ind-6", indicator_text: "Beneficiary satisfaction with support",
    level: "outcome" as IndicatorLevel, method: "participatory" as Method, frequency: "annual",
    baseline_value: "62%", target_value: "85%", current_value: "71%",
    status: "on_track" as IndicatorStatus, phases: ["midterm", "endline"],
    ai_rationale: "Community voice and accountability best captured through scorecards and participatory ranking",
  },
  {
    id: "ind-7", indicator_text: "# beneficiaries completing training",
    level: "output" as IndicatorLevel, method: "document_review" as Method, frequency: "monthly",
    baseline_value: "0", target_value: "1200", current_value: "743",
    status: "on_track" as IndicatorStatus, phases: ["ongoing"],
    ai_rationale: "Tracked via training attendance records — no field data collection needed",
  },
  {
    id: "ind-8", indicator_text: "% women among beneficiaries",
    level: "output" as IndicatorLevel, method: "hh_survey" as Method, frequency: "quarterly",
    baseline_value: "0%", target_value: "50%", current_value: "38%",
    status: "off_track" as IndicatorStatus, phases: ["ongoing"],
    ai_rationale: "Gender disaggregation requirement from EU donor — tracked through beneficiary registration",
  },
  {
    id: "ind-9", indicator_text: "Average monthly savings per beneficiary",
    level: "outcome" as IndicatorLevel, method: "hh_survey" as Method, frequency: "biannual",
    baseline_value: "$0", target_value: "$45/mo", current_value: "$31/mo",
    status: "on_track" as IndicatorStatus, phases: ["baseline", "endline"],
    ai_rationale: "Financial behavior change measured through self-reported savings in HH survey",
  },
  {
    id: "ind-10", indicator_text: "# market linkage agreements signed",
    level: "output" as IndicatorLevel, method: "document_review" as Method, frequency: "quarterly",
    baseline_value: "0", target_value: "20", current_value: "8",
    status: "at_risk" as IndicatorStatus, phases: ["ongoing"],
    ai_rationale: "Verifiable from signed MOU documents — simple output tracking",
  },
  {
    id: "ind-11", indicator_text: "Community perception of economic opportunity",
    level: "impact" as IndicatorLevel, method: "fgd" as Method, frequency: "annual",
    baseline_value: "Low", target_value: "Moderate-High", current_value: "Low-Moderate",
    status: "on_track" as IndicatorStatus, phases: ["baseline", "endline"],
    ai_rationale: "Impact-level perception requires deep qualitative exploration through focus groups",
  },
  {
    id: "ind-12", indicator_text: "% trainees employed within 6 months",
    level: "outcome" as IndicatorLevel, method: "hh_survey" as Method, frequency: "biannual",
    baseline_value: "0%", target_value: "60%", current_value: "34%",
    status: "off_track" as IndicatorStatus, phases: ["midterm", "endline"],
    ai_rationale: "Employment outcome requires follow-up survey with trained beneficiaries after completion",
  },
];

export const mockTrendData: Record<string, number[]> = {
  "ind-1": [12, 16, 19, 22, 25, 28],
  "ind-3": [0, 2, 4, 7, 9, 11],
  "ind-7": [0, 85, 210, 390, 560, 743],
  "ind-8": [0, 22, 28, 32, 35, 38],
  "ind-9": [0, 8, 15, 22, 27, 31],
  "ind-12": [0, 0, 12, 20, 28, 34],
};

export const mockAssessments = [
  {
    id: "assess-1", project_id: "proj-1", type: "baseline" as const,
    status: "delivered" as const, methods_included: ["hh_survey", "fgd", "kii", "observation"] as Method[],
    sample_size: 400, price_usd: 5000,
    requested_at: "2025-01-15", delivered_at: "2025-03-01",
  },
  {
    id: "assess-2", project_id: "proj-1", type: "fgd_round" as const,
    status: "delivered" as const, methods_included: ["fgd"] as Method[],
    sample_size: null, price_usd: 1200,
    requested_at: "2025-06-01", delivered_at: "2025-06-20",
  },
  {
    id: "assess-3", project_id: "proj-1", type: "midterm" as const,
    status: "in_field" as const, methods_included: ["hh_survey", "fgd", "kii"] as Method[],
    sample_size: 300, price_usd: 4000,
    requested_at: "2025-12-01", delivered_at: null,
  },
  {
    id: "assess-4", project_id: "proj-1", type: "endline" as const,
    status: "requested" as const, methods_included: ["hh_survey", "fgd", "kii", "observation", "participatory"] as Method[],
    sample_size: 400, price_usd: 6000,
    requested_at: null, delivered_at: null,
  },
];

export const mockReports = [
  { id: "rpt-1", project_id: "proj-1", type: "assessment_report" as const, title: "Baseline Assessment Report", donor_format: "eu", period_start: "2025-01-01", period_end: "2025-02-28", status: "published" as const },
  { id: "rpt-2", project_id: "proj-1", type: "monthly_progress" as const, title: "Monthly Progress Report — March 2025", donor_format: "generic", period_start: "2025-03-01", period_end: "2025-03-31", status: "published" as const },
  { id: "rpt-3", project_id: "proj-1", type: "monthly_progress" as const, title: "Monthly Progress Report — April 2025", donor_format: "generic", period_start: "2025-04-01", period_end: "2025-04-30", status: "published" as const },
  { id: "rpt-4", project_id: "proj-1", type: "monthly_progress" as const, title: "Monthly Progress Report — May 2025", donor_format: "generic", period_start: "2025-05-01", period_end: "2025-05-31", status: "published" as const },
  { id: "rpt-5", project_id: "proj-1", type: "quarterly_summary" as const, title: "Q1 2025 Quarterly Summary", donor_format: "eu", period_start: "2025-01-01", period_end: "2025-03-31", status: "published" as const },
];

export const mockQualitativeEntries = [
  {
    id: "qual-1", assessment_id: "assess-1", type: "fgd_transcript" as const,
    title: "FGD with Women's Cooperative — Hebron Old City",
    participants: 8, location: "Hebron", date_conducted: "2025-02-10",
    themes: ["market_access", "gender_barriers", "transportation", "childcare"],
    sentiment: "mixed" as const,
    linked_indicators: ["ind-2", "ind-6", "ind-8"],
    content: "Participants discussed challenges accessing markets outside the Old City. Transportation costs were cited as a major barrier, especially for women with young children. Several participants noted improvement in cooperative management skills but expressed frustration with limited market linkages...",
  },
  {
    id: "qual-2", assessment_id: "assess-1", type: "kii_notes" as const,
    title: "KII with Hebron Municipality Economic Development Director",
    participants: 1, location: "Hebron", date_conducted: "2025-02-12",
    themes: ["institutional_support", "policy_alignment", "budget_constraints"],
    sentiment: "positive" as const,
    linked_indicators: ["ind-5", "ind-10"],
    content: "The director expressed strong support for the cooperative model and indicated willingness to include cooperative products in municipal procurement. However, budget constraints limit the municipality's ability to provide direct financial support...",
  },
  {
    id: "qual-3", assessment_id: "assess-2", type: "fgd_transcript" as const,
    title: "FGD with Youth Trainees — Cohort 2",
    participants: 10, location: "Hebron", date_conducted: "2025-06-08",
    themes: ["skills_relevance", "employment_prospects", "training_quality", "mentorship"],
    sentiment: "positive" as const,
    linked_indicators: ["ind-4", "ind-6", "ind-12"],
    content: "Participants generally rated the training positively, particularly the practical components. Several expressed concern about the gap between training completion and actual employment. Suggestions included extending the mentorship period and adding direct employer connections...",
  },
];

export const mockNotifications = [
  { id: "notif-1", type: "off_track_alert" as const, title: "Indicator off track", message: "% women among beneficiaries dropped to 38% — below the 50% target trajectory", is_read: false, created_at: "2025-11-20T09:30:00" },
  { id: "notif-2", type: "assessment_ready" as const, title: "Assessment update", message: "Midterm assessment moved to 'In Field' stage", is_read: false, created_at: "2025-12-02T14:00:00" },
  { id: "notif-3", type: "report_generated" as const, title: "Report ready", message: "Monthly Progress Report for November 2025 is ready for download", is_read: true, created_at: "2025-12-01T08:00:00" },
  { id: "notif-4", type: "off_track_alert" as const, title: "Indicator off track", message: "% trainees employed within 6 months at 34% — significantly below 60% target", is_read: true, created_at: "2025-11-15T11:00:00" },
];

export const mockDocuments = [
  { id: "doc-1", name: "Project Proposal — Youth Economic Empowerment.pdf", type: "proposal" as const, uploaded_at: "2024-12-15", uploaded_by: "Walid Hamad", size: "2.4 MB" },
  { id: "doc-2", name: "Logframe — Hebron Livelihoods.xlsx", type: "logframe" as const, uploaded_at: "2024-12-20", uploaded_by: "Sara Khalil", size: "156 KB" },
  { id: "doc-3", name: "Theory of Change Diagram.pdf", type: "theory_of_change" as const, uploaded_at: "2025-01-05", uploaded_by: "Sara Khalil", size: "890 KB" },
  { id: "doc-4", name: "EU Donor Reporting Guidelines 2025.pdf", type: "donor_guidelines" as const, uploaded_at: "2025-01-10", uploaded_by: "Walid Hamad", size: "1.1 MB" },
  { id: "doc-5", name: "Baseline Survey Instrument.docx", type: "other" as const, uploaded_at: "2025-01-20", uploaded_by: "Sara Khalil", size: "340 KB" },
];

export const mockActivityFeed = [
  { id: "act-1", icon: "alert", text: "Indicator '% women among beneficiaries' flagged as off-track", timestamp: "2 hours ago", project: "Youth Economic Empowerment in Hebron" },
  { id: "act-2", icon: "report", text: "Monthly Progress Report for November generated", timestamp: "Yesterday", project: "Youth Economic Empowerment in Hebron" },
  { id: "act-3", icon: "assessment", text: "Midterm assessment moved to 'In Field' status", timestamp: "2 days ago", project: "Youth Economic Empowerment in Hebron" },
  { id: "act-4", icon: "data", text: "New FGD transcript uploaded and processed", timestamp: "3 days ago", project: "Youth Economic Empowerment in Hebron" },
  { id: "act-5", icon: "indicator", text: "Indicator '# cooperatives registered' updated to 11", timestamp: "4 days ago", project: "Youth Economic Empowerment in Hebron" },
  { id: "act-6", icon: "user", text: "Thomas Mueller (GIZ) accessed project dashboard", timestamp: "5 days ago", project: "Women's Health Access in Nablus" },
  { id: "act-7", icon: "project", text: "WASH Infrastructure Rehabilitation project created", timestamp: "1 week ago", project: "WASH Infrastructure Rehabilitation" },
  { id: "act-8", icon: "report", text: "Q1 2025 Quarterly Summary published", timestamp: "1 week ago", project: "Youth Economic Empowerment in Hebron" },
];

// Async data fetching functions (easy to replace with real API calls later)
export async function getProjects() { return mockProjects; }
export async function getProject(id: string) { return mockProjects.find(p => p.id === id); }
export async function getIndicators(projectId: string) { 
  if (projectId === "proj-1") return mockIndicators;
  return [];
}
export async function getAssessments(projectId: string) { return mockAssessments.filter(a => a.project_id === projectId); }
export async function getReports(projectId: string) { return mockReports.filter(r => r.project_id === projectId); }
export async function getNotifications() { return mockNotifications; }
export async function getQualitativeEntries(projectId: string) { 
  if (projectId === "proj-1") return mockQualitativeEntries;
  return [];
}

export const METHOD_LABELS: Record<Method, string> = {
  hh_survey: "HH Survey",
  fgd: "FGD",
  kii: "KII",
  observation: "Observation",
  document_review: "Doc Review",
  participatory: "Participatory",
};

export const SECTOR_LABELS: Record<string, string> = {
  livelihoods: "Livelihoods",
  health: "Health",
  wash: "WASH",
  education: "Education",
  protection: "Protection",
};

export const ASSESSMENT_STAGES = [
  "requested", "scoping", "in_field", "data_cleaning", "analysis", "reporting", "delivered"
] as const;
