export interface Dataset {
  id: string;
  name: string;
  original_filename: string;
  file_format: string;
  row_count: number;
  columns: string[];
  column_types?: Record<string, string>;
  table_name: string;
  status: "pending" | "ready" | "failed";
  created_at: string;
}

export interface DashboardWidget {
  id: string;
  title: string;
  chart_type: string;
  query_sql?: string;
  query_nl?: string;
  x_key?: string;
  y_keys?: string[];
  position_x: number;
  position_y: number;
  width: number;
  height: number;
  refresh_interval_s?: number;
  date_filter_enabled: boolean;
  dataset_id?: string;
}

export interface Dashboard {
  id: string;
  title: string;
  description?: string;
  is_default: boolean;
  layout_config: Record<string, unknown>;
  widgets: DashboardWidget[];
  created_at: string;
}

export interface ChartSeries {
  name: string;
  data?: number[];
  value?: number;
}

export interface ChartData {
  chart_type: string;
  labels: string[];
  series: ChartSeries[];
  x_key: string;
  y_keys: string[];
  columns: string[];
  sql: string;
  row_count: number;
}

export interface ExploreResult {
  columns: string[];
  rows: Record<string, unknown>[];
  total: number;
  page: number;
  page_size: number;
  sql: string;
}
