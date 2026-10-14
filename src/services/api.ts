import type {
  AuthUser,
  BeneficiaryStats,
  BulkDataPointInput,
  BulkDataPointResponse,
  DataPoint,
  DataPointInput,
  Framework,
  GenerateFrameworkResponse,
  GenerationStatus,
  Indicator,
  IndicatorDataResponse,
  IndicatorInput,
  IndicatorQuality,
  InviteUserResponse,
  KpiAssistantStatus,
  KpiSuggestion,
  KpiSuggestionFilters,
  KpiSuggestionList,
  KpiSuggestionRunResponse,
  LibraryEntry,
  LibraryFilters,
  LoginResponse,
  OrgUser,
  Project,
  ProjectDeleteResponse,
  ProjectDetail,
  ProjectDocument,
  ProjectExport,
  ProjectDashboard,
  ProjectInput,
  ProjectListOptions,
  ProjectUpdateInput,
  QualitativeEntryCreateResponse,
  AcceptKpiSuggestionBody,
  AcceptKpiSuggestionResponse,
  RejectKpiSuggestionBody,
  RequestKpiSuggestionsBody,
  RequestKpiSuggestionsResponse,
  Report,
  ReportDetail,
  ReportGenerateInput,
  ReportGenerateResponse,
  ReportListItem,
  ResetUserPasswordResponse,
  ResultDeleteResponse,
  ResultNode,
  ResultNodeInput,
  ResultUpdateResponse,
  SessionTokens,
  UserInviteInput,
} from '@/types/api';
import { ApiError, PROJECT_ARCHIVED_CODE } from '@/lib/apiError';
import { emitAuthChange } from '@/lib/authEvents';
import { emitProjectArchivedRefusal } from '@/lib/projectEvents';
import { sessionUser } from '@/lib/session';

interface QualitativeUploadMetadata {
  entryType?: string;
  title?: string;
  participants?: number | string;
  location?: string;
  dateConducted?: string;
  facilitator?: string;
}

const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:3001/api').trim();

/** What a token refresh came to (ApiClient.tryRefresh). */
type RefreshOutcome = { outcome: 'refreshed' | 'ended' } | { outcome: 'unavailable'; status?: number };

class ApiClient {
  private token: string | null = null;
  /** The token refresh in flight, shared by every request that got a 401 meanwhile (tryRefresh). */
  private refreshing: Promise<RefreshOutcome> | null = null;

  /**
   * Stores a new access token (sign-in or refresh). The saved profile takes the token's role, so a
   * role an admin changed reaches the UI with the next refresh, and the auth context is told.
   */
  setToken(token: string) {
    this.token = token;
    localStorage.setItem('raqib_token', token);
    const user = this.getUser();
    if (user) localStorage.setItem('raqib_user', JSON.stringify(user));
    emitAuthChange();
  }

  getToken(): string | null {
    if (!this.token) {
      this.token = localStorage.getItem('raqib_token');
    }
    return this.token;
  }

  clearToken() {
    this.token = null;
    localStorage.removeItem('raqib_token');
    localStorage.removeItem('raqib_refresh_token');
    localStorage.removeItem('raqib_user');
    emitAuthChange();
  }

  /**
   * The signed-in user: the profile saved at sign-in, with the role from the current access token
   * (src/lib/session.ts). The role is "" when the token carries none (deny by default).
   */
  getUser(): AuthUser | null {
    const raw = localStorage.getItem('raqib_user');
    if (!raw) return null;
    let profile: AuthUser | null;
    try {
      profile = JSON.parse(raw) as AuthUser;
    } catch {
      return null;
    }
    return profile && typeof profile === 'object' ? sessionUser(profile, this.getToken()) : null;
  }

  setUser(user: object) {
    localStorage.setItem('raqib_user', JSON.stringify(user));
    emitAuthChange();
  }

  /**
   * Calls the API and returns the parsed JSON body; a failed response throws an
   * ApiError carrying the HTTP status (and the error body's `code` and `details`).
   * `T` is the response type; endpoints without a model in src/types/api.ts keep
   * the untyped default until their screens are rebuilt (Phase 6).
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- default for endpoints not yet modelled
  private async request<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
    return (await this.send<T>(endpoint, options)).data;
  }

  /** Like request(), but also returns the HTTP status of the successful response (e.g. 200 vs 202). */
  private async send<T>(endpoint: string, options: RequestInit = {}): Promise<{ data: T; status: number }> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...((options.headers as Record<string, string>) || {}),
    };

    const token = this.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    let response = await this.fetchOnce(endpoint, options, headers);

    if (response.status === 401) {
      // The access token expired (or the session ended): refresh once, then send the request again. Requests
      // that expire together (e.g. the KPI run polls and the suggestion list) share one refresh (tryRefresh).
      const refresh = await this.tryRefresh();
      if (refresh.outcome === 'ended') return this.signOut();
      if (refresh.outcome === 'unavailable') {
        // The server could not refresh just now (429, a server error, offline): keep the session; the screen
        // says "try again" (its status, or none when offline).
        if (refresh.status === undefined) throw new Error('Network error — please check your connection');
        throw new ApiError('Raqib could not continue your session just now. Wait a few minutes and try again.', refresh.status);
      }
      headers['Authorization'] = `Bearer ${this.getToken()}`;
      response = await this.fetchOnce(endpoint, options, headers);
      // Only a second 401 means the session is over; any other answer to the repeated request is handled like a
      // first answer, so its status, code and details (400, 403, 409 already_decided, 409 project_archived…) reach
      // the screen.
      if (response.status === 401) return this.signOut();
    }

    if (!response.ok) throw await this.failure(response, 'API request failed');
    return { data: await this.parseBody<T>(response), status: response.status };
  }

  /** One fetch of `endpoint`; a request that never got an answer (offline) throws an Error without a status. */
  private async fetchOnce(endpoint: string, options: RequestInit, headers: Record<string, string>): Promise<Response> {
    try {
      return await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
    } catch (err) {
      throw new Error(err instanceof Error && err.message ? err.message : 'Network error — please check your connection');
    }
  }

  /**
   * The ApiError for a failed response (status, the server's message, its reason code and `details`). A write
   * refused because the project is archived (409 `project_archived`) is also announced (src/lib/projectEvents.ts),
   * so an open project page switches to its read-only view.
   */
  private async failure(response: Response, fallbackMessage: string): Promise<ApiError> {
    const error = await response.json().catch(() => ({}));
    const code = typeof error?.code === 'string' ? error.code : undefined;
    const details =
      error?.details && typeof error.details === 'object' && !Array.isArray(error.details)
        ? (error.details as Record<string, unknown>)
        : undefined;
    if (response.status === 409 && code === PROJECT_ARCHIVED_CODE) emitProjectArchivedRefusal();
    return new ApiError(
      typeof error?.message === 'string' && error.message ? error.message : fallbackMessage,
      response.status,
      code,
      details,
    );
  }

  /** The session is over (refresh refused, or still 401 after refreshing): forget it and go to sign in. */
  private signOut(): never {
    this.clearToken();
    window.location.href = '/';
    throw new ApiError('Unauthorized', 401);
  }

  /**
   * A POST made before sign-in: sign-in, forgot password, and reset password with an emailed link. It
   * sends no access token, and a 401 is the server's answer to this request (a wrong password, an invalid
   * or expired reset link), so it is passed on with its status and message instead of the token refresh
   * and sign-out that a signed-in call does on 401.
   */
  private async publicRequest<T>(endpoint: string, body: unknown): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${API_BASE}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (err) {
      throw new Error(err instanceof Error && err.message ? err.message : 'Network error — please check your connection');
    }
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new ApiError(error.message || 'API request failed', response.status, typeof error.code === 'string' ? error.code : undefined);
    }
    return this.parseBody<T>(response);
  }

  /** JSON body of a successful response; undefined for an empty body (e.g. 204). */
  private async parseBody<T>(response: Response): Promise<T> {
    const text = await response.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  /**
   * Trades the refresh token for a new pair. `ended`: there is no session to continue (no refresh token, or
   * the server refused it: signed out elsewhere, or the password changed). `unavailable`: the server could not
   * answer now (rate limit, server error, offline), so the session is kept and the user can try again.
   * Requests that expire together (e.g. the KPI run polls and the suggestion list) share one refresh, so a burst
   * of 401s sends one POST /auth/refresh: the per-IP authLimiter counts every refresh, and a refused refresh
   * signs the user out.
   */
  private tryRefresh(): Promise<RefreshOutcome> {
    if (!this.refreshing) {
      this.refreshing = this.refreshOnce().finally(() => {
        this.refreshing = null;
      });
    }
    return this.refreshing;
  }

  private async refreshOnce(): Promise<RefreshOutcome> {
    const refreshToken = localStorage.getItem('raqib_refresh_token');
    if (!refreshToken) return { outcome: 'ended' };
    let res: Response;
    try {
      res = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
    } catch {
      return { outcome: 'unavailable' };
    }
    if (res.status === 429 || res.status >= 500) return { outcome: 'unavailable', status: res.status };
    if (!res.ok) return { outcome: 'ended' };
    try {
      this.storeSession(await res.json());
      return { outcome: 'refreshed' };
    } catch {
      return { outcome: 'ended' };
    }
  }

  /** Keeps a new token pair (sign-in, refresh, change password). */
  private storeSession(data: { accessToken: string; refreshToken: string }) {
    if (typeof data?.accessToken !== 'string' || typeof data?.refreshToken !== 'string') throw new Error('No tokens in the answer');
    this.setToken(data.accessToken);
    localStorage.setItem('raqib_refresh_token', data.refreshToken);
  }

  // Auth
  /** Signs in. A wrong email or password is an ApiError with status 401 (the page stays, with its message). */
  async login(email: string, password: string): Promise<LoginResponse> {
    const data = await this.publicRequest<LoginResponse>('/auth/login', { email, password });
    this.storeSession(data);
    this.setUser(data.user);
    return data;
  }

  /** Asks for a reset link. The server answers the same whether or not the account exists. */
  async forgotPassword(email: string): Promise<void> {
    await this.publicRequest<unknown>('/auth/forgot-password', { email });
  }

  /**
   * Sets a new password with the token from a reset link (no sign-in). An invalid or expired link is an
   * ApiError with status 401; a password the policy refuses is a 400 with the server's message.
   */
  async resetPassword(token: string, newPassword: string): Promise<void> {
    await this.publicRequest<unknown>('/auth/reset-password', { token, newPassword });
  }

  /**
   * The signed-in user changes their own password. The server ends every other session of the account and
   * answers with a new token pair, which is kept so this session continues. A wrong current password or a
   * refused new one is a 400 with its code.
   */
  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    const tokens = await this.request<SessionTokens>('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    this.storeSession(tokens);
  }

  logout() {
    this.clearToken();
    window.location.href = '/';
  }

  // Projects
  /**
   * The organisation's projects. Active ones by default (archived projects are left out); `{ archived: true }`
   * lists the archived ones only.
   */
  async getProjects(options: ProjectListOptions = {}) {
    return this.request<Project[]>(options.archived === true ? '/projects?archived=true' : '/projects');
  }

  async getProject(id: string) {
    return this.request<ProjectDetail>(`/projects/${id}`);
  }

  async createProject(data: ProjectInput) {
    return this.request<Project>('/projects', { method: 'POST', body: JSON.stringify(data) });
  }

  async updateProject(id: string, data: ProjectUpdateInput) {
    return this.request<Project>(`/projects/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
  }

  /**
   * Org admins and platform admins: hides the project from the active list and makes it read-only; nothing is
   * deleted. 409 `project_already_archived` when it is archived already.
   */
  async archiveProject(id: string) {
    return this.request<Project>(`/projects/${encodeURIComponent(id)}/archive`, { method: 'POST' });
  }

  /**
   * Org admins and platform admins: brings an archived project back with the status it had before (the
   * server reads it from the audit log). 409 `project_not_archived` when it is not archived.
   */
  async restoreProject(id: string) {
    return this.request<Project>(`/projects/${encodeURIComponent(id)}/restore`, { method: 'POST' });
  }

  /**
   * Org admins and platform admins: deletes the project and everything in it for good, its document files
   * included; the server records it in the audit log. `confirmName` must be the project's exact name (the
   * server compares both trimmed, case-sensitive): 400 `confirm_name_mismatch` otherwise.
   */
  async deleteProject(id: string, confirmName: string) {
    return this.request<ProjectDeleteResponse>(`/projects/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      body: JSON.stringify({ confirmName }),
    });
  }

  // Dashboard (mounted at /api/dashboard in the backend's src/app.ts)
  /** Org staff and donor viewers get the same keys; the donor rows differ (see ProjectDashboard). */
  async getDashboard(projectId: string) {
    return this.request<ProjectDashboard>(`/dashboard/projects/${projectId}/dashboard`);
  }

  async getOrgOverview() {
    return this.request('/dashboard/overview');
  }

  // Framework
  /** The project's current framework (newest version whose AI generation did not fail) with its results chain and indicators, or null. */
  async getFramework(projectId: string) {
    return this.request<Framework | null>(`/projects/${projectId}/framework`);
  }

  async generateFramework(projectId: string) {
    return this.request<GenerateFrameworkResponse>(`/projects/${projectId}/framework/generate`, { method: 'POST' });
  }

  /** processing, completed (with the framework) or failed (with a message that is safe to show); an interrupted run is reported as failed. */
  async checkGenerationStatus(frameworkId: string) {
    return this.request<GenerationStatus>(`/frameworks/${frameworkId}/status`);
  }

  async approveFramework(frameworkId: string) {
    return this.request<Framework>(`/frameworks/${frameworkId}/approve`, { method: 'PATCH' });
  }

  async createManualFramework(projectId: string, name: string) {
    return this.request<Omit<Framework, 'resultNodes' | 'indicators'>>(`/projects/${projectId}/framework/manual`, { method: 'POST', body: JSON.stringify({ name }) });
  }

  async addIndicatorToFramework(frameworkId: string, data: IndicatorInput) {
    return this.request<Indicator>(`/frameworks/${frameworkId}/indicators`, { method: 'POST', body: JSON.stringify(data) });
  }

  // Results chain
  async getFrameworkResults(frameworkId: string) {
    return this.request<ResultNode[]>(`/frameworks/${frameworkId}/results`);
  }

  async createResultNode(frameworkId: string, data: ResultNodeInput) {
    return this.request<ResultNode>(`/frameworks/${frameworkId}/results`, { method: 'POST', body: JSON.stringify(data) });
  }

  /** A level change moves the result's indicators too (updatedIndicators); refetch them afterwards. */
  async updateResultNode(id: string, data: Partial<ResultNodeInput>) {
    return this.request<ResultUpdateResponse>(`/results/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
  }

  /** Fails with 409 while the result has child results; its indicators become unlinked. */
  async deleteResultNode(id: string) {
    return this.request<ResultDeleteResponse>(`/results/${id}`, { method: 'DELETE' });
  }

  // Indicator library
  async getIndicatorLibrary(filters: LibraryFilters = {}) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) {
      if (value === undefined || value === null || value === '') continue;
      params.set(key, String(value));
    }
    const query = params.toString();
    return this.request<LibraryEntry[]>(`/indicator-library${query ? `?${query}` : ''}`);
  }

  async getLibraryEntry(id: string) {
    return this.request<LibraryEntry>(`/indicator-library/${encodeURIComponent(id)}`);
  }

  // Indicators
  async updateIndicator(id: string, data: IndicatorInput) {
    return this.request<Indicator>(`/indicators/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
  }

  async approveIndicator(id: string) {
    return this.request<Indicator>(`/indicators/${id}/approve`, { method: 'PATCH' });
  }

  /** Alternatives to an indicator through the KPI Assistant (same answers as requestKpiSuggestions with scope alternatives). */
  async requestAlternative(indicatorId: string): Promise<RequestKpiSuggestionsResponse> {
    const { data, status } = await this.send<Omit<RequestKpiSuggestionsResponse, 'httpStatus'>>(
      `/indicators/${indicatorId}/alternative`, { method: 'POST' },
    );
    return { ...data, httpStatus: status };
  }

  async deleteIndicator(id: string) {
    return this.request(`/indicators/${id}`, { method: 'DELETE' });
  }

  // KPI Assistant (Phase 4; knowledge/kpi-assistant-spec.md §A6)
  /** Whether the server can call the AI (aiConfigured false until the Anthropic key is set). */
  async getKpiAssistantStatus() {
    return this.request<KpiAssistantStatus>('/kpi-assistant/status');
  }

  /**
   * Starts a KPI run: 200 when it finished within the server's wait (run + suggestions), 202 while it runs (poll
   * getKpiSuggestionRun). `httpStatus` tells them apart. Errors carry ApiError.code (e.g. run_in_progress with
   * details.runId, ai_not_configured, nothing_to_suggest).
   */
  async requestKpiSuggestions(projectId: string, body: RequestKpiSuggestionsBody): Promise<RequestKpiSuggestionsResponse> {
    const { data, status } = await this.send<Omit<RequestKpiSuggestionsResponse, 'httpStatus'>>(
      `/projects/${projectId}/kpi-suggestions`, { method: 'POST', body: JSON.stringify(body) },
    );
    return { ...data, httpStatus: status };
  }

  /** Suggestions of the project's current framework (pending by default), its active runs and latest framework run. */
  async getKpiSuggestions(projectId: string, filters: KpiSuggestionFilters = {}) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) {
      if (value) params.set(key, String(value));
    }
    const query = params.toString();
    return this.request<KpiSuggestionList>(`/projects/${projectId}/kpi-suggestions${query ? `?${query}` : ''}`);
  }

  /** A run and all its suggestions (any status), polled while it runs (design 7.4). */
  async getKpiSuggestionRun(runId: string) {
    return this.request<KpiSuggestionRunResponse>(`/kpi-suggestion-runs/${runId}`);
  }

  /** Accepts a suggestion; `edits` holds only the fields the user changed (none: accepted as suggested). */
  /**
   * Accepts a suggestion, with the user's edits (draft fields only) and, for an alternative to an existing indicator,
   * `replaceSource` to remove that indicator in the same transaction (409 source_has_data when it holds data).
   */
  async acceptKpiSuggestion(id: string, edits?: IndicatorInput, options: { replaceSource?: boolean } = {}) {
    const body: AcceptKpiSuggestionBody = {
      ...(edits && { edits }),
      ...(options.replaceSource && { replaceSource: true }),
    };
    return this.request<AcceptKpiSuggestionResponse>(`/kpi-suggestions/${id}/accept`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  /** Rejects a suggestion with a reason (design 8.2); the note is stored redacted and never sent to a model. */
  async rejectKpiSuggestion(id: string, body: RejectKpiSuggestionBody) {
    return this.request<{ suggestion: KpiSuggestion }>(`/kpi-suggestions/${id}/reject`, { method: 'POST', body: JSON.stringify(body) });
  }

  /** Deterministic quality check of every indicator of a framework (no AI call). */
  async getIndicatorQuality(frameworkId: string): Promise<IndicatorQuality[]> {
    const data = await this.request<{ indicators: IndicatorQuality[] }>(`/frameworks/${frameworkId}/indicator-quality`);
    return data?.indicators ?? [];
  }

  // Indicator data
  async getIndicatorData(indicatorId: string) {
    return this.request<IndicatorDataResponse>(`/indicators/${indicatorId}/data`);
  }

  async addDataPoint(indicatorId: string, data: DataPointInput) {
    return this.request<DataPoint>(`/indicators/${indicatorId}/data`, { method: 'POST', body: JSON.stringify(data) });
  }

  /** Each row may carry a `breakdown`; the whole batch is rejected (400) when any row is invalid. */
  async addDataPointsBulk(projectId: string, dataPoints: BulkDataPointInput[]) {
    return this.request<BulkDataPointResponse>(`/projects/${projectId}/data/bulk`, { method: 'POST', body: JSON.stringify({ dataPoints }) });
  }

  // Assessments
  async getAssessments(projectId: string) {
    return this.request(`/projects/${projectId}/assessments`);
  }

  async requestAssessment(projectId: string, data: object) {
    return this.request(`/projects/${projectId}/assessments`, { method: 'POST', body: JSON.stringify(data) });
  }

  // Documents
  /** Newest first, with textLength and the stored AI analysis (aiAnalysis); never the extracted text or the storage key. */
  async getDocuments(projectId: string) {
    return this.request<ProjectDocument[]>(`/projects/${projectId}/documents`);
  }

  /**
   * Uploads to private storage; parsing and AI analysis run afterwards (parsingStatus starts as "pending").
   * PDF, Word (.docx) and Excel (.xlsx) only: the backend refuses Word 97–2003 (.doc) files (400).
   */
  async uploadDocument(projectId: string, file: File, fileType: string): Promise<ProjectDocument> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('fileType', fileType);

    const token = this.getToken();
    const response = await fetch(`${API_BASE}/projects/${projectId}/documents`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    if (!response.ok) throw await this.failure(response, 'Upload failed');
    return response.json();
  }

  // Reports
  /** Newest first. Org staff get every report; donor viewers get published reports only (DonorReport). */
  async getReports(projectId: string) {
    return this.request<ReportListItem[]>(`/projects/${projectId}/reports`);
  }

  /** Org admins and platform admins: donor viewers can see the report (and its text) from now on. */
  async publishReport(reportId: string) {
    return this.request<Report>(`/reports/${reportId}/publish`, { method: 'PATCH' });
  }

  /** Org admins and platform admins: the report goes back to draft and donor viewers no longer see it. */
  async unpublishReport(reportId: string) {
    return this.request<Report>(`/reports/${reportId}/unpublish`, { method: 'PATCH' });
  }

  /** Org staff: `type` and `title` are required (400 otherwise); the AI narrative is written in the background. */
  async generateReport(projectId: string, config: ReportGenerateInput) {
    return this.request<ReportGenerateResponse>(`/projects/${projectId}/reports/generate`, { method: 'POST', body: JSON.stringify(config) });
  }

  async getReportStatus(reportId: string) {
    return this.request(`/reports/${reportId}/status`);
  }

  // Qualitative
  async getQualitativeEntries(projectId: string) {
    return this.request(`/projects/${projectId}/qualitative`);
  }

  /** The saved entry; `redactions` counts what was removed from its text (absent from older backends). */
  async addQualitativeEntry(projectId: string, data: object) {
    return this.request<QualitativeEntryCreateResponse>(`/projects/${projectId}/qualitative`, { method: 'POST', body: JSON.stringify(data) });
  }

  async codeQualitativeEntry(entryId: string) {
    return this.request(`/qualitative/${entryId}/code`, { method: 'POST' });
  }

  async uploadQualitativeDocument(projectId: string, file: File, metadata: QualitativeUploadMetadata) {
    const formData = new FormData();
    formData.append('file', file);
    if (metadata.entryType) formData.append('entryType', metadata.entryType);
    if (metadata.title) formData.append('title', metadata.title);
    if (metadata.participants) formData.append('participants', String(metadata.participants));
    if (metadata.location) formData.append('location', metadata.location);
    if (metadata.dateConducted) formData.append('dateConducted', metadata.dateConducted);
    if (metadata.facilitator) formData.append('facilitator', metadata.facilitator);

    const token = this.getToken();
    const response = await fetch(`${API_BASE}/projects/${projectId}/qualitative/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    if (!response.ok) throw await this.failure(response, 'Upload failed');
    return response.json();
  }

  // Assessment report
  async getAssessmentReport(assessmentId: string) {
    return this.request(`/assessments/${assessmentId}/report`);
  }

  // Notifications
  async getNotifications() {
    return this.request('/notifications');
  }

  async markNotificationRead(id: string) {
    return this.request(`/notifications/${id}/read`, { method: 'PATCH' });
  }

  async markAllNotificationsRead() {
    return this.request('/notifications/read-all', { method: 'PATCH' });
  }

  // Organization
  async getOrganization(id: string) {
    return this.request(`/organizations/${id}`);
  }

  async updateOrganization(id: string, data: object) {
    return this.request(`/organizations/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
  }

  // Users
  /** The organisation's members (org admins and platform admins). */
  async getUsers(): Promise<OrgUser[]> {
    return this.request<OrgUser[]>('/users');
  }

  /** Adds a user. While email is off, the response carries their temporary password once (`temporaryPassword`). */
  async inviteUser(data: UserInviteInput): Promise<InviteUserResponse> {
    return this.request<InviteUserResponse>('/users/invite', { method: 'POST', body: JSON.stringify(data) });
  }

  /** An admin sets a new temporary password for a member; while email is off it is returned once. */
  async resetUserPassword(userId: string): Promise<ResetUserPasswordResponse> {
    return this.request<ResetUserPasswordResponse>(`/users/${encodeURIComponent(userId)}/reset-password`, { method: 'POST' });
  }

  // Beneficiaries
  async getBeneficiaries(projectId: string) {
    return this.request(`/projects/${projectId}/beneficiaries`);
  }
  async createBeneficiary(projectId: string, data: object) {
    return this.request(`/projects/${projectId}/beneficiaries`, { method: 'POST', body: JSON.stringify(data) });
  }
  async getBeneficiary(id: string) {
    return this.request(`/beneficiaries/${id}`);
  }
  async updateBeneficiary(id: string, data: object) {
    return this.request(`/beneficiaries/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
  }
  async addBeneficiaryService(beneficiaryId: string, data: object) {
    return this.request(`/beneficiaries/${beneficiaryId}/services`, { method: 'POST', body: JSON.stringify(data) });
  }
  /** Org staff get exact counts; donor viewers get a summary with small counts hidden (`audience` tells them apart). */
  async getBeneficiaryStats(projectId: string): Promise<BeneficiaryStats> {
    return this.request<BeneficiaryStats>(`/projects/${projectId}/beneficiaries/stats`);
  }

  // Risk Analysis
  async getRiskAnalysis(projectId: string) {
    return this.request(`/dashboard/projects/${projectId}/risks`);
  }

  // Exports
  async exportIndicators(projectId: string) {
    return this.request(`/projects/${projectId}/export/indicators`);
  }
  /** The beneficiary register (personal data): org staff only; donor viewers get 403. */
  async exportBeneficiaries(projectId: string) {
    return this.request(`/projects/${projectId}/export/beneficiaries`);
  }
  /** The whole project as JSON. Donor viewers get results without personal data (`audience: "donor"`, no `beneficiaries`). */
  async exportProject(projectId: string): Promise<ProjectExport> {
    return this.request<ProjectExport>(`/projects/${projectId}/export`);
  }

  // Report detail
  /** One report with its narrative: any report for org staff; published ones only for donor viewers (404 otherwise). */
  async getReport(reportId: string) {
    return this.request<ReportDetail>(`/reports/${reportId}`);
  }
}

export const api = new ApiClient();
