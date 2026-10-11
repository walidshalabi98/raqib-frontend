import type {
  AuthUser,
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
  LibraryEntry,
  LibraryFilters,
  LoginResponse,
  Project,
  ProjectDetail,
  ProjectInput,
  ProjectUpdateInput,
  ResultDeleteResponse,
  ResultNode,
  ResultNodeInput,
} from '@/types/api';

interface QualitativeUploadMetadata {
  entryType?: string;
  title?: string;
  participants?: number | string;
  location?: string;
  dateConducted?: string;
  facilitator?: string;
}

const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:3001/api').trim();

class ApiClient {
  private token: string | null = null;

  setToken(token: string) {
    this.token = token;
    localStorage.setItem('raqib_token', token);
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
  }

  getUser(): AuthUser | null {
    const raw = localStorage.getItem('raqib_user');
    if (!raw) return null;
    try {
      return JSON.parse(raw) as AuthUser;
    } catch {
      return null;
    }
  }

  setUser(user: object) {
    localStorage.setItem('raqib_user', JSON.stringify(user));
  }

  /**
   * Calls the API and returns the parsed JSON body. `T` is the response type;
   * endpoints without a model in src/types/api.ts keep the untyped default
   * until their screens are rebuilt (Phase 6).
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- default for endpoints not yet modelled
  private async request<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...((options.headers as Record<string, string>) || {}),
    };

    const token = this.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    let response: Response;
    try {
      response = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers,
      });
    } catch (err) {
      throw new Error(err instanceof Error && err.message ? err.message : 'Network error — please check your connection');
    }

    if (response.status === 401) {
      // Try refresh
      const refreshed = await this.tryRefresh();
      if (refreshed) {
        headers['Authorization'] = `Bearer ${this.getToken()}`;
        const retry = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
        if (retry.ok) return this.parseBody<T>(retry);
      }
      this.clearToken();
      window.location.href = '/';
      throw new Error('Unauthorized');
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || 'API request failed');
    }

    return this.parseBody<T>(response);
  }

  /** JSON body of a successful response; undefined for an empty body (e.g. 204). */
  private async parseBody<T>(response: Response): Promise<T> {
    const text = await response.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  private async tryRefresh(): Promise<boolean> {
    const refreshToken = localStorage.getItem('raqib_refresh_token');
    if (!refreshToken) return false;
    try {
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) return false;
      const data = await res.json();
      this.setToken(data.accessToken);
      localStorage.setItem('raqib_refresh_token', data.refreshToken);
      return true;
    } catch {
      return false;
    }
  }

  // Auth
  async login(email: string, password: string): Promise<LoginResponse> {
    const data = await this.request<LoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    this.setToken(data.accessToken);
    localStorage.setItem('raqib_refresh_token', data.refreshToken);
    this.setUser(data.user);
    return data;
  }

  async forgotPassword(email: string) {
    return this.request('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  }

  logout() {
    this.clearToken();
    window.location.href = '/';
  }

  // Projects
  async getProjects() {
    return this.request<Project[]>('/projects');
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

  // Dashboard
  async getDashboard(projectId: string) {
    return this.request(`/projects/${projectId}/dashboard`);
  }

  async getOrgOverview() {
    return this.request('/dashboard/overview');
  }

  // Framework
  /** Latest framework of the project with its results chain and indicators, or null. */
  async getFramework(projectId: string) {
    return this.request<Framework | null>(`/projects/${projectId}/framework`);
  }

  async generateFramework(projectId: string) {
    return this.request<GenerateFrameworkResponse>(`/projects/${projectId}/framework/generate`, { method: 'POST' });
  }

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

  async updateResultNode(id: string, data: Partial<ResultNodeInput>) {
    return this.request<ResultNode>(`/results/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
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

  async requestAlternative(indicatorId: string) {
    return this.request(`/indicators/${indicatorId}/alternative`, { method: 'POST' });
  }

  async deleteIndicator(id: string) {
    return this.request(`/indicators/${id}`, { method: 'DELETE' });
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
  async getDocuments(projectId: string) {
    return this.request(`/projects/${projectId}/documents`);
  }

  async uploadDocument(projectId: string, file: File, fileType: string) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('fileType', fileType);

    const token = this.getToken();
    const response = await fetch(`${API_BASE}/projects/${projectId}/documents`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || 'Upload failed');
    }
    return response.json();
  }

  // Reports
  async getReports(projectId: string) {
    return this.request(`/projects/${projectId}/reports`);
  }

  async generateReport(projectId: string, config: object) {
    return this.request(`/projects/${projectId}/reports/generate`, { method: 'POST', body: JSON.stringify(config) });
  }

  async getReportStatus(reportId: string) {
    return this.request(`/reports/${reportId}/status`);
  }

  // Qualitative
  async getQualitativeEntries(projectId: string) {
    return this.request(`/projects/${projectId}/qualitative`);
  }

  async addQualitativeEntry(projectId: string, data: object) {
    return this.request(`/projects/${projectId}/qualitative`, { method: 'POST', body: JSON.stringify(data) });
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
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || 'Upload failed');
    }
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
  async getUsers() {
    return this.request('/users');
  }

  async inviteUser(data: object) {
    return this.request('/users/invite', { method: 'POST', body: JSON.stringify(data) });
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
  async getBeneficiaryStats(projectId: string) {
    return this.request(`/projects/${projectId}/beneficiaries/stats`);
  }

  // Risk Analysis
  async getRiskAnalysis(projectId: string) {
    return this.request(`/dashboard/projects/${projectId}/risks`);
  }

  // Exports
  async exportIndicators(projectId: string) {
    return this.request(`/projects/${projectId}/export/indicators`);
  }
  async exportBeneficiaries(projectId: string) {
    return this.request(`/projects/${projectId}/export/beneficiaries`);
  }
  async exportFullProject(projectId: string) {
    return this.request(`/projects/${projectId}/export/full`);
  }

  // Report detail
  async getReport(reportId: string) {
    return this.request(`/reports/${reportId}`);
  }
}

export const api = new ApiClient();
