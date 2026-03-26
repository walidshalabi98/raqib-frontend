const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

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

  getUser() {
    const raw = localStorage.getItem('raqib_user');
    return raw ? JSON.parse(raw) : null;
  }

  setUser(user: any) {
    localStorage.setItem('raqib_user', JSON.stringify(user));
  }

  private async request(endpoint: string, options: RequestInit = {}) {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...((options.headers as Record<string, string>) || {}),
    };

    const token = this.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
    });

    if (response.status === 401) {
      // Try refresh
      const refreshed = await this.tryRefresh();
      if (refreshed) {
        headers['Authorization'] = `Bearer ${this.getToken()}`;
        const retry = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
        if (retry.ok) return retry.json();
      }
      this.clearToken();
      window.location.href = '/';
      throw new Error('Unauthorized');
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || 'API request failed');
    }

    return response.json();
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
  async login(email: string, password: string) {
    const data = await this.request('/auth/login', {
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
    return this.request('/projects');
  }

  async getProject(id: string) {
    return this.request(`/projects/${id}`);
  }

  async createProject(data: any) {
    return this.request('/projects', { method: 'POST', body: JSON.stringify(data) });
  }

  // Dashboard
  async getDashboard(projectId: string) {
    return this.request(`/projects/${projectId}/dashboard`);
  }

  async getOrgOverview() {
    return this.request('/dashboard/overview');
  }

  // Framework
  async getFramework(projectId: string) {
    return this.request(`/projects/${projectId}/framework`);
  }

  async generateFramework(projectId: string) {
    return this.request(`/projects/${projectId}/framework/generate`, { method: 'POST' });
  }

  async checkGenerationStatus(frameworkId: string) {
    return this.request(`/frameworks/${frameworkId}/status`);
  }

  async approveFramework(frameworkId: string) {
    return this.request(`/frameworks/${frameworkId}/approve`, { method: 'PATCH' });
  }

  // Indicators
  async updateIndicator(id: string, data: any) {
    return this.request(`/indicators/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
  }

  async approveIndicator(id: string) {
    return this.request(`/indicators/${id}/approve`, { method: 'PATCH' });
  }

  async requestAlternative(indicatorId: string) {
    return this.request(`/indicators/${indicatorId}/alternative`, { method: 'POST' });
  }

  async deleteIndicator(id: string) {
    return this.request(`/indicators/${id}`, { method: 'DELETE' });
  }

  // Indicator data
  async getIndicatorData(indicatorId: string) {
    return this.request(`/indicators/${indicatorId}/data`);
  }

  async addDataPoint(indicatorId: string, data: any) {
    return this.request(`/indicators/${indicatorId}/data`, { method: 'POST', body: JSON.stringify(data) });
  }

  // Assessments
  async getAssessments(projectId: string) {
    return this.request(`/projects/${projectId}/assessments`);
  }

  async requestAssessment(projectId: string, data: any) {
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

  async generateReport(projectId: string, config: any) {
    return this.request(`/projects/${projectId}/reports/generate`, { method: 'POST', body: JSON.stringify(config) });
  }

  async getReportStatus(reportId: string) {
    return this.request(`/reports/${reportId}/status`);
  }

  // Qualitative
  async getQualitativeEntries(projectId: string) {
    return this.request(`/projects/${projectId}/qualitative`);
  }

  async addQualitativeEntry(projectId: string, data: any) {
    return this.request(`/projects/${projectId}/qualitative`, { method: 'POST', body: JSON.stringify(data) });
  }

  async codeQualitativeEntry(entryId: string) {
    return this.request(`/qualitative/${entryId}/code`, { method: 'POST' });
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

  async updateOrganization(id: string, data: any) {
    return this.request(`/organizations/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
  }

  // Users
  async getUsers() {
    return this.request('/users');
  }

  async inviteUser(data: any) {
    return this.request('/users/invite', { method: 'POST', body: JSON.stringify(data) });
  }

  // Beneficiaries
  async getBeneficiaries(projectId: string) {
    return this.request(`/projects/${projectId}/beneficiaries`);
  }
  async createBeneficiary(projectId: string, data: any) {
    return this.request(`/projects/${projectId}/beneficiaries`, { method: 'POST', body: JSON.stringify(data) });
  }
  async getBeneficiary(id: string) {
    return this.request(`/beneficiaries/${id}`);
  }
  async updateBeneficiary(id: string, data: any) {
    return this.request(`/beneficiaries/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
  }
  async addBeneficiaryService(beneficiaryId: string, data: any) {
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
