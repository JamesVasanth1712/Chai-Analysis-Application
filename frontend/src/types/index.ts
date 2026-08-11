export interface User {
  id: string;
  email: string;
  full_name: string;
  role: "admin" | "manager" | "analyst" | "viewer";
  tenant_id: string;
  preferred_language: string;
}

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  industry: string;
  plan: string;
}

export interface AgentResponse {
  executive_summary: string;
  key_findings?: string[];
  supporting_evidence?: string[];
  recommendations?: string[];
  confidence_level?: "high" | "medium" | "low";
  risks?: string[];
  missing_data?: string[];
  next_actions?: string[];
  insights?: string[];
  calculations?: Record<string, unknown>;
  charts?: Record<string, unknown>[];
  dashboard?: { id: string; title: string; widgets_created: number } | null;
  raw_data?: Record<string, unknown>;
  visualizations?: Visualization[];
  requires_approval?: boolean;
}

export interface Visualization {
  type: "line" | "bar" | "pie" | "area" | "scatter";
  title: string;
  data: Record<string, unknown>[];
  x_key?: string;
  y_keys?: string[];
}

export interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  agent_used?: string;
  structured_response?: AgentResponse;
  created_at: string;
}

export interface Conversation {
  id: string;
  title: string;
  created_at: string;
}

export interface KPI {
  name: string;
  value: number | string;
  unit?: string;
  change_pct?: number;
  trend?: number[];
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}
