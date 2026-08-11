import axios from "axios";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

export const api = axios.create({
  baseURL: BASE_URL,
  headers: { "Content-Type": "application/json" },
  timeout: 120000,
});

// Attach token from localStorage on every request
api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
        const token = localStorage.getItem("chai_analysis_token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

// Handle 401 globally
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    if (error.response?.status === 401) {
      if (typeof window !== "undefined") {
        localStorage.removeItem("chai_analysis_token");
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);

// Auth
export const authApi = {
  login: (email: string, password: string) =>
    api.post("/auth/login", { email, password }).then((r) => r.data),
  register: (data: { email: string; password: string; full_name: string; tenant_name: string; industry?: string }) =>
    api.post("/auth/register", data).then((r) => r.data),
  refresh: (refresh_token: string) =>
    api.post("/auth/refresh", { refresh_token }).then((r) => r.data),
};

// Chat
export const chatApi = {
  send: (message: string, conversation_id?: string, data?: Record<string, unknown>) =>
    api.post("/chat/", { message, conversation_id, data }).then((r) => r.data),
  listConversations: () => api.get("/chat/conversations").then((r) => r.data),
  getMessages: (conversationId: string) =>
    api.get(`/chat/conversations/${conversationId}/messages`).then((r) => r.data),
  streamUrl: (message: string, agent?: string) => {
    const token = typeof window !== "undefined" ? localStorage.getItem("chai_analysis_token") : "";
    const params = new URLSearchParams({ message, ...(agent ? { agent } : {}) });
    return `${BASE_URL}/chat/stream?${params}&token=${token}`;
  },
};

// Users
export const usersApi = {
  me: () => api.get("/users/me").then((r) => r.data),
  list: () => api.get("/users/").then((r) => r.data),
  create: (data: { email: string; password: string; full_name: string; role: string }) =>
    api.post("/users/", data).then((r) => r.data),
  update: (id: string, data: Record<string, unknown>) =>
    api.patch(`/users/${id}`, data).then((r) => r.data),
};

// Tenant Settings
export const settingsApi = {
  getDatabase: () => api.get("/settings/database").then((r) => r.data),
  saveDatabase: (db_url: string) =>
    api.post("/settings/database", { db_url }).then((r) => r.data),
  testDatabase: (db_url: string) =>
    api.post("/settings/database/test", { db_url }).then((r) => r.data),
  disconnectDatabase: () => api.delete("/settings/database").then((r) => r.data),
};

// Data (chart + explore)
export const dataApi = {
  chart: (params: {
    sql?: string;
    nl_query?: string;
    chart_type?: string;
    x_key?: string;
    y_keys?: string[];
    date_from?: string;
    date_to?: string;
    db_url?: string;
    dataset_table?: string;
    limit?: number;
  }) => api.post("/data/chart", params).then((r) => r.data),
  explore: (params: {
    sql?: string;
    nl_query?: string;
    db_url?: string;
    dataset_table?: string;
    page?: number;
    page_size?: number;
  }) => api.post("/data/explore", params).then((r) => r.data),
  navigator: () => api.get("/data/navigator").then((r) => r.data),
  aiGenerate: (prompt: string, dbUrl?: string) => api.post("/data/ai/generate", { prompt, db_url: dbUrl }).then((r) => r.data),
  aiExplain: (sql: string, dbUrl?: string) => api.post("/data/ai/explain", { sql, db_url: dbUrl }).then((r) => r.data),
  aiDebug: (sql: string, error: string, dbUrl?: string) => api.post("/data/ai/debug", { sql, error, db_url: dbUrl }).then((r) => r.data),
  listHistory: () => api.get("/data/history").then((r) => r.data),
  toggleFavorite: (id: string) => api.post(`/data/history/${id}/favorite`).then((r) => r.data),
  togglePin: (id: string) => api.post(`/data/history/${id}/pin`).then((r) => r.data),
  deleteHistory: (id: string) => api.delete(`/data/history/${id}`).then((r) => r.data),
  listConnectors: () => api.get("/data/connectors").then((r) => r.data),
  createConnector: (data: { name: string; type: string; credentials: Record<string, any> }) =>
    api.post("/data/connectors", data).then((r) => r.data),
  testConnector: (data: { name: string; type: string; credentials: Record<string, any> }) =>
    api.post("/data/connectors/test", data).then((r) => r.data),
  deleteConnector: (id: string) => api.delete(`/data/connectors/${id}`).then((r) => r.data),
};

// Datasets (CSV / Excel uploads)
export const datasetsApi = {
  upload: (file: File, name?: string, dashboardId?: string) => {
    const form = new FormData();
    form.append("file", file);
    if (name) form.append("name", name);
    if (dashboardId) form.append("dashboard_id", dashboardId);
    return api.post("/datasets/upload", form, {
      headers: { "Content-Type": "multipart/form-data" },
    }).then((r) => r.data);
  },
  list: (dashboardId?: string) =>
    api.get(`/datasets/${dashboardId ? `?dashboard_id=${dashboardId}` : ""}`).then((r) => r.data),
  preview: (id: string, limit = 50) =>
    api.get(`/datasets/${id}/preview?limit=${limit}`).then((r) => r.data),
  delete: (id: string) => api.delete(`/datasets/${id}`).then((r) => r.data),
  stats: (id: string) => api.get(`/datasets/${id}/stats`).then((r) => r.data),
  clean: (id: string, params: { action: string; column?: string; fill_value?: string }) =>
    api.post(`/datasets/${id}/clean`, params).then((r) => r.data),
};

// Dashboards
export const dashboardsApi = {
  list: () => api.get("/dashboards/").then((r) => r.data),
  get: (id: string) => api.get(`/dashboards/${id}`).then((r) => r.data),
  create: (data: {
    title: string;
    description?: string;
    is_default?: boolean;
    widgets?: unknown[];
  }) => api.post("/dashboards/", data).then((r) => r.data),
  update: (id: string, data: Record<string, unknown>) =>
    api.patch(`/dashboards/${id}`, data).then((r) => r.data),
  delete: (id: string) => api.delete(`/dashboards/${id}`).then((r) => r.data),
  addWidget: (dashboardId: string, widget: Record<string, unknown>) =>
    api.post(`/dashboards/${dashboardId}/widgets`, widget).then((r) => r.data),
  updateWidget: (dashboardId: string, widgetId: string, widget: Record<string, unknown>) =>
    api.patch(`/dashboards/${dashboardId}/widgets/${widgetId}`, widget).then((r) => r.data),
  deleteWidget: (dashboardId: string, widgetId: string) =>
    api.delete(`/dashboards/${dashboardId}/widgets/${widgetId}`).then((r) => r.data),
  updateLayout: (dashboardId: string, items: { id: string; position_x: number; position_y: number; width: number; height: number }[]) =>
    api.put(`/dashboards/${dashboardId}/layout`, items).then((r) => r.data),
  getWidgetData: (dashboardId: string, widgetId: string, dateFrom?: string, dateTo?: string) => {
    const params = new URLSearchParams();
    if (dateFrom) params.set("date_from", dateFrom);
    if (dateTo) params.set("date_to", dateTo);
    params.set("_t", Date.now().toString());
    return api.get(`/dashboards/${dashboardId}/widgets/${widgetId}/data?${params}`).then((r) => r.data);
  },
  exportExcel: (id: string) => api.get(`/dashboards/${id}/export/excel`, { responseType: "blob" }).then((r) => r.data),
  exportDocx: (id: string) => api.get(`/dashboards/${id}/export/docx`, { responseType: "blob" }).then((r) => r.data),
  exportPptx: (id: string) => api.get(`/dashboards/${id}/export/pptx`, { responseType: "blob" }).then((r) => r.data),
  
  // Dashboard Templates & Scheduled Reports
  listTemplates: () => api.get("/dashboards/templates/all").then((r) => r.data),
  createFromTemplate: (params: { template_id: string; dataset_id: string; title?: string }) =>
    api.post("/dashboards/create-from-template", params).then((r) => r.data),
  createSchedule: (dashboardId: string, params: { frequency: string; recipients: string[]; is_active?: boolean }) =>
    api.post(`/dashboards/${dashboardId}/schedule`, params).then((r) => r.data),
  getSchedules: (dashboardId: string) => api.get(`/dashboards/${dashboardId}/schedules`).then((r) => r.data),
  deleteSchedule: (scheduleId: string) => api.delete(`/dashboards/schedules/${scheduleId}`).then((r) => r.data),
};

export const mlApi = {
  forecast: (params: { dataset_id: string; date_column: string; metric_column: string; periods: number }) =>
    api.post("/ml/forecast", params).then((r) => r.data),
  anomalies: (params: { dataset_id: string; date_column: string; metric_columns: string[] }) =>
    api.post("/ml/anomalies", params).then((r) => r.data),
  segmentation: (params: { dataset_id: string; features: string[]; n_clusters: number }) =>
    api.post("/ml/segmentation", params).then((r) => r.data),
  recommend: (datasetId: string) => api.post("/ml/recommend", { dataset_id: datasetId }).then((r) => r.data),
  compareModels: (params: { dataset_id: string; date_column: string; metric_column: string }) =>
    api.post("/ml/compare-models", params).then((r) => r.data),
};



export const teamApi = {
  listInvitations: () => api.get("/users/invitations/all").then((r) => r.data),
  createInvitation: (data: { email: string; role: string }) => api.post("/users/invitations", data).then((r) => r.data),
  revokeInvitation: (id: string) => api.delete(`/users/invitations/${id}`).then((r) => r.data),
};

