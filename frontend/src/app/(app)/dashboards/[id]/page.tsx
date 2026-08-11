"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useParams } from "next/navigation";
import {
  AreaChart,
  BarChart3,
  Boxes,
  Braces,
  Calculator,
  Calendar,
  ChartColumn,
  ChartNoAxesColumn,
  ChartScatter,
  CircleDot,
  Database,
  FileSpreadsheet,
  FileText,
  Filter,
  Presentation,
  Gauge,
  Grid2X2,
  Image,
  LayoutDashboard,
  LineChart,
  ListFilter,
  Loader2,
  MousePointer2,
  Paintbrush,
  LayoutGrid,
  PieChart,
  Plus,
  RefreshCw,
  Save,
  Search,
  Sigma,
  Table2,
  TrendingUp,
  Trash2,
  Trophy,
  Type,
  Upload,
  WandSparkles,
  X,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Sparkles,
  Grid,
  Columns,
  Lock,
  Maximize2,
  MoreHorizontal,
  SlidersHorizontal,
  Share2,
  Eye,
  EyeOff,
} from "lucide-react";
import { dashboardsApi, dataApi, datasetsApi } from "@/lib/api";
import { ChartData, Dashboard, DashboardWidget, Dataset } from "@/types/bi";
import { ChartWidget } from "@/components/charts/ChartWidget";
import { DateRangeFilter } from "@/components/dashboard/DateRangeFilter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";
import { useAuthStore } from "@/stores/auth";

type ChartType = "bar" | "line" | "area" | "pie" | "table" | "card" | "donut" | "scatter" | "slicer" | "gauge" | "treemap" | "funnel" | "waterfall" | "heatmap" | "sankey" | "radar" | "map" | "combo" | "calendar" | "boxplot";

type Aggregation = "sum" | "avg" | "count" | "min" | "max";
type FieldWell = "axis" | "values" | "legend" | "smallMultiples" | "tooltips" | "drillThrough";

interface WidgetWithData extends Omit<DashboardWidget, "chart_type"> {
  chart_type: ChartType;
  chartData?: ChartData;
  loading?: boolean;
  error?: string;
  z_index?: number;
}

interface VisualDraft {
  title: string;
  chart_type: ChartType;
  axis: string;
  values: string[];
  legend: string;
  aggregation: Aggregation;
  dax: string;
  date_filter_enabled: boolean;
  smallMultiples: string;
  tooltips: string[];
  crossReport: boolean;
  keepAllFilters: boolean;
  drillThroughFields: string[];
}

function cleanErrorMessage(err: string): string {
  if (!err) return "";
  if (err.includes("UndefinedFunctionError") && err.includes("sum(")) {
    return "Database Error: Cannot perform SUM aggregation on text/categorical values. Please change aggregate function to COUNT, or select a numeric column.";
  }
  if (err.includes("UndefinedFunctionError") && err.includes("avg(")) {
    return "Database Error: Cannot perform AVERAGE aggregation on text/categorical values. Please change aggregate function to COUNT, or select a numeric column.";
  }
  if (err.includes("UndefinedFunctionError")) {
    return "Database Error: Invalid aggregation function for the selected column data type.";
  }
  const clean = err.replace(/\(sqlalchemy\.dialects\.[a-z\.]+\.[a-zA-Z]+\)/g, "")
                   .replace(/<class 'asyncpg\.exceptions\.[a-zA-Z]+'>:/g, "")
                   .replace(/\[SQL:.*?\]/g, "")
                   .replace(/\(Background on this error at:.*?\)/g, "")
                   .trim();
  return clean || err;
}

function getColumnIcon(columnName: string, dataset?: Dataset, dashboard?: any) {
  if (dashboard && dashboard.layout_config && dataset) {
    const cc = (dashboard.layout_config.calculated_columns || []) as Array<{ table_name: string; column_name: string }>;
    const isCc = cc.some(item => item.table_name === dataset.table_name && item.column_name === columnName);
    if (isCc) return Calculator;
  }
  if (!dataset || !dataset.column_types) return Type;
  const type = dataset.column_types[columnName]?.toUpperCase() ?? "";
  if (
    type.includes("INT") ||
    type.includes("DOUBLE") ||
    type.includes("PRECISION") ||
    type.includes("REAL") ||
    type.includes("NUMERIC") ||
    type.includes("FLOAT") ||
    type.includes("DECIMAL")
  ) {
    return Sigma;
  }
  if (type.includes("TIME") || type.includes("DATE") || type.includes("TIMESTAMP")) {
    return Calendar;
  }
  return Type;
}

const EMPTY_VISUAL: VisualDraft = {
  title: "",
  chart_type: "bar",
  axis: "",
  values: [],
  legend: "",
  aggregation: "sum",
  dax: "",
  date_filter_enabled: false,
  smallMultiples: "",
  tooltips: [],
  crossReport: false,
  keepAllFilters: true,
  drillThroughFields: [],
};

const VISUAL_TYPES: Array<{ value: ChartType; label: string; icon: any; disabled?: boolean }> = [
  { value: "bar", label: "Bar chart", icon: BarChart3 },
  { value: "line", label: "Line chart", icon: LineChart },
  { value: "area", label: "Area chart", icon: AreaChart },
  { value: "pie", label: "Pie chart", icon: PieChart },
  { value: "donut", label: "Donut chart", icon: CircleDot },
  { value: "scatter", label: "Scatter plot", icon: ChartScatter },
  { value: "table", label: "Table visual", icon: Table2 },
  { value: "card", label: "Card KPI", icon: Trophy },
  { value: "slicer", label: "Slicer filter", icon: ListFilter },
  { value: "gauge", label: "Gauge scale", icon: Gauge },
  { value: "treemap", label: "Treemap visual", icon: Grid },
  { value: "funnel", label: "Funnel chart", icon: Filter },
  { value: "waterfall", label: "Waterfall chart", icon: TrendingUp },
  { value: "heatmap", label: "Heatmap grid", icon: Grid2X2 },
  { value: "sankey", label: "Sankey flow", icon: Share2 },
  { value: "radar", label: "Radar spider", icon: CircleDot },
  { value: "map", label: "Geographic map", icon: Database },
  { value: "combo", label: "Combo chart", icon: SlidersHorizontal },
  { value: "calendar", label: "Calendar heatmap", icon: Calendar },
  { value: "boxplot", label: "Boxplot visual", icon: SlidersHorizontal },
];


function quoteIdentifier(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

function aliasFor(field: string, aggregation: Aggregation) {
  if (aggregation === "count") return `${field}_count`;
  return field;
}

function uniqueFields(fields: Array<string | undefined | null>) {
  return fields.filter((field, index, arr): field is string =>
    Boolean(field) && arr.indexOf(field) === index
  );
}

function getWidgetMapping(draft: VisualDraft, yKeys: string[]) {
  if (draft.chart_type === "card") {
    return { x_key: undefined, y_keys: yKeys };
  }
  if (draft.chart_type === "table") {
    return {
      x_key: draft.axis || undefined,
      y_keys: uniqueFields([draft.axis, ...draft.values]),
    };
  }
  return { x_key: draft.axis || undefined, y_keys: yKeys };
}

function parseDaxMeasure(expression: string) {
  const trimmed = expression.trim();
  if (!trimmed) return null;

  const withName = trimmed.match(/^([A-Za-z_][\w\s-]*)\s*=\s*([A-Z]+)\s*\(\s*\[?([A-Za-z_][\w\s-]*)\]?\s*\)$/i);
  const noName = trimmed.match(/^([A-Z]+)\s*\(\s*\[?([A-Za-z_][\w\s-]*)\]?\s*\)$/i);
  const match = withName || noName;
  if (!match) return null;

  const daxFn = withName ? match[2].toUpperCase() : match[1].toUpperCase();
  const field = (withName ? match[3] : match[2]).trim();
  const name = withName ? match[1].trim().replace(/\s+/g, "_").toLowerCase() : `${field}_${daxFn.toLowerCase()}`;
  const sqlFn: Record<string, string> = {
    SUM: "SUM",
    AVERAGE: "AVG",
    AVG: "AVG",
    COUNT: "COUNT",
    MIN: "MIN",
    MAX: "MAX",
  };

  if (!sqlFn[daxFn]) return null;
  return { field, alias: name, sqlFn: sqlFn[daxFn] };
}

function buildDatasetSql(draft: VisualDraft) {
  if (draft.chart_type === "slicer") {
    if (!draft.axis) return "";
    const axis = quoteIdentifier(draft.axis);
    return `SELECT DISTINCT ${axis} AS ${axis} FROM dataset LIMIT 500`;
  }

  if (draft.chart_type === "table") {
    let select = "*";
    const tableFields = uniqueFields([draft.axis, ...(draft.values || [])]);
    if (tableFields.length > 0) {
      select = tableFields.map(v => quoteIdentifier(v)).join(", ");
    }
    return `SELECT ${select} FROM dataset LIMIT 100`;
  }

  const daxMeasure = parseDaxMeasure(draft.dax);
  const fields = daxMeasure ? [daxMeasure.field] : draft.values;
  if (draft.chart_type !== "card" && (!draft.axis || fields.length === 0)) return "";
  if (draft.chart_type === "card" && fields.length === 0) return "";

  const axis = quoteIdentifier(draft.axis);
  const metrics = daxMeasure ? [
    `${daxMeasure.sqlFn}(${quoteIdentifier(daxMeasure.field)}) AS ${quoteIdentifier(daxMeasure.alias)}`,
  ] : draft.values.map((field) => {
    const quoted = quoteIdentifier(field);
    const alias = quoteIdentifier(aliasFor(field, draft.aggregation));
    if (draft.aggregation === "count") return `COUNT(${quoted}) AS ${alias}`;
    if (draft.aggregation === "min") return `MIN(${quoted}) AS ${alias}`;
    if (draft.aggregation === "max") return `MAX(${quoted}) AS ${alias}`;
    return `${draft.aggregation.toUpperCase()}(${quoted}) AS ${alias}`;
  });

  const tooltipMetrics = (draft.tooltips || []).map((field) => {
    const quoted = quoteIdentifier(field);
    const alias = quoteIdentifier(`${field}_tooltip`);
    return `MAX(${quoted}) AS ${alias}`;
  });

  if (draft.chart_type === "card") {
    return [
      `SELECT ${metrics[0]}`,
      "FROM dataset",
      "LIMIT 1",
    ].join("\n");
  }

  const selectCols = [
    `${axis} AS ${quoteIdentifier(draft.axis)}`,
    ...(draft.smallMultiples ? [`${quoteIdentifier(draft.smallMultiples)} AS ${quoteIdentifier(draft.smallMultiples)}`] : []),
    ...metrics,
    ...tooltipMetrics
  ].join(", ");

  const groupCols = [
    axis,
    ...(draft.smallMultiples ? [quoteIdentifier(draft.smallMultiples)] : [])
  ].join(", ");

  return [
    `SELECT ${selectCols}`,
    "FROM dataset",
    `GROUP BY ${groupCols}`,
    `ORDER BY ${axis}`,
    "LIMIT 500",
  ].join("\n");
}

export interface DashboardFilter {
  id: string;
  columnName: string;
  level: "global" | "page" | "visual";
  targetWidgetId?: string;
  pageName?: string;
  filterType: "basic" | "date" | "search";
  selectedValues: any[];
  dateRelative?: {
    type: "days" | "quarter" | "year";
    value: number;
  };
  searchTerm?: string;
}

function buildSqlForWidget(
  chartType: string,
  axis: string,
  values: string[],
  aggregation: Aggregation,
  dax: string,
  tableName: string,
  drillThroughFields: string[],
  drillPath: Array<{ field: string; value: any }>,
  tooltips: string[] = [],
  whereClause = ""
) {
  if (!tableName) return "";
  if (chartType === "slicer") {
    if (!axis) return "";
    const axisQuoted = quoteIdentifier(axis);
    return `SELECT DISTINCT ${axisQuoted} AS ${axisQuoted} FROM ${quoteIdentifier(tableName)} ${whereClause} LIMIT 500`;
  }

  if (chartType === "table") {
    let select = "*";
    const tableFields = uniqueFields([axis, ...(values || [])]);
    if (tableFields.length > 0) {
      select = tableFields.map(v => quoteIdentifier(v)).join(", ");
    }
    return `SELECT ${select} FROM ${quoteIdentifier(tableName)} ${whereClause} LIMIT 100`;
  }

  let currentAxis = axis;
  if (drillPath && drillPath.length > 0 && drillThroughFields && drillThroughFields.length >= drillPath.length) {
    currentAxis = drillThroughFields[drillPath.length - 1];
  }

  const daxMeasure = parseDaxMeasure(dax);
  const fields = daxMeasure ? [daxMeasure.field] : values;
  if (chartType !== "card" && (!currentAxis || fields.length === 0)) return "";
  if (chartType === "card" && fields.length === 0) return "";

  const axisQuoted = quoteIdentifier(currentAxis);
  const metrics = daxMeasure ? [
    `${daxMeasure.sqlFn}(${quoteIdentifier(daxMeasure.field)}) AS ${quoteIdentifier(daxMeasure.alias)}`,
  ] : values.map((field) => {
    const quoted = quoteIdentifier(field);
    const alias = quoteIdentifier(aliasFor(field, aggregation));
    if (aggregation === "count") return `COUNT(${quoted}) AS ${alias}`;
    if (aggregation === "min") return `MIN(${quoted}) AS ${alias}`;
    if (aggregation === "max") return `MAX(${quoted}) AS ${alias}`;
    return `${aggregation.toUpperCase()}(${quoted}) AS ${alias}`;
  });

  const tooltipMetrics = (tooltips || []).map((field) => {
    const quoted = quoteIdentifier(field);
    const alias = quoteIdentifier(`${field}_tooltip`);
    return `MAX(${quoted}) AS ${alias}`;
  });

  if (chartType === "card") {
    return [
      `SELECT ${metrics[0]}`,
      `FROM ${quoteIdentifier(tableName)}`,
      whereClause,
      "LIMIT 1",
    ].filter(Boolean).join("\n");
  }

  const selectCols = [
    `${axisQuoted} AS ${quoteIdentifier(currentAxis)}`,
    ...metrics,
    ...tooltipMetrics
  ].join(", ");

  const groupCols = axisQuoted;

  return [
    `SELECT ${selectCols}`,
    `FROM ${quoteIdentifier(tableName)}`,
    whereClause,
    `GROUP BY ${groupCols}`,
    `ORDER BY ${axisQuoted}`,
    "LIMIT 500",
  ].filter(Boolean).join("\n");
}

function compileWhereClause(
  widget: any,
  tableName: string,
  panelFilters: DashboardFilter[],
  activePage: string,
  activeFiltersByCol: Record<string, any[]>,
  drillPath: Array<{ field: string; value: any }>,
  activeFilters: Record<string, any> = {}
): string {
  const conditions: string[] = [];

  // 1. Drill-down/Drill-through conditions
  if (drillPath && drillPath.length > 0) {
    drillPath.forEach(p => {
      const valStr = typeof p.value === "number" ? p.value : `'${String(p.value).replace(/'/g, "''")}'`;
      conditions.push(`${quoteIdentifier(p.field)} = ${valStr}`);
    });
  }

  // 2. Dashboard Panel Filters (Global, Page, Visual)
  panelFilters.forEach(f => {
    const isGlobal = f.level === "global";
    const isPage = f.level === "page";
    const isVisual = f.level === "visual" && f.targetWidgetId === widget.id;

    if (isGlobal || isPage || isVisual) {
      const colQuoted = quoteIdentifier(f.columnName);
      if (f.filterType === "basic" && f.selectedValues.length > 0) {
        const valList = f.selectedValues.map(v => {
          return typeof v === "number" ? v : `'${String(v).replace(/'/g, "''")}'`;
        }).join(", ");
        conditions.push(`${colQuoted} IN (${valList})`);
      } else if (f.filterType === "search" && f.searchTerm) {
        conditions.push(`${colQuoted} ILIKE '%${f.searchTerm.replace(/'/g, "''")}%'`);
      } else if (f.filterType === "date" && f.dateRelative) {
        const rel = f.dateRelative;
        if (rel.type === "days") {
          conditions.push(`${colQuoted} >= NOW() - INTERVAL '${rel.value} days'`);
        } else if (rel.type === "quarter") {
          conditions.push(`${colQuoted} >= DATE_TRUNC('quarter', NOW())`);
        } else if (rel.type === "year") {
          conditions.push(`${colQuoted} >= DATE_TRUNC('year', NOW())`);
        }
      }
    }
  });

  // 3. Slicers and Cross-Filtering (activeFiltersByCol)
  Object.keys(activeFiltersByCol).forEach(colName => {
    const isSlicerColumnForThisWidget = widget.chart_type === "slicer" && widget.x_key === colName;
    const isCrossFilterColumnForThisWidget = widget.chart_type !== "slicer" && widget.x_key === colName;
    
    if (!isSlicerColumnForThisWidget && !isCrossFilterColumnForThisWidget) {
      const selections = activeFiltersByCol[colName];
      if (selections && selections.length > 0) {
        const colQuoted = quoteIdentifier(colName);
        const valList = selections.map(v => {
          return typeof v === "number" ? v : `'${String(v).replace(/'/g, "''")}'`;
        }).join(", ");
        conditions.push(`${colQuoted} IN (${valList})`);
      }
    }
  });

  // 4. Slicer Date Filters (not from panel, but direct from visual slicers)
  Object.keys(activeFilters).forEach(colName => {
    const filter = activeFilters[colName];
    if (filter && typeof filter === "object" && filter.type === "date" && filter.dateRelative) {
      const isSlicerColumnForThisWidget = widget.chart_type === "slicer" && widget.x_key === colName;
      if (!isSlicerColumnForThisWidget) {
        const colQuoted = quoteIdentifier(colName);
        const rel = filter.dateRelative;
        if (rel.type === "days") {
          conditions.push(`${colQuoted} >= NOW() - INTERVAL '${rel.value} days'`);
        } else if (rel.type === "quarter") {
          conditions.push(`${colQuoted} >= DATE_TRUNC('quarter', NOW())`);
        } else if (rel.type === "year") {
          conditions.push(`${colQuoted} >= DATE_TRUNC('year', NOW())`);
        }
      }
    }
  });

  if (conditions.length === 0) return "";
  return "WHERE " + conditions.join(" AND ");
}

function FieldDropZone({
  title,
  description,
  fields,
  onDropField,
  onRemove,
  multiple = false,
}: {
  title: string;
  description: string;
  fields: string[];
  onDropField: (field: string) => void;
  onRemove: (field: string) => void;
  multiple?: boolean;
}) {
  const [over, setOver] = useState(false);

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-800">{title}</span>
        <span className="text-[10px] text-muted-foreground">{description}</span>
      </div>
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setOver(false);
          const field = event.dataTransfer.getData("text/plain");
          if (field) onDropField(field);
        }}
        className={cn(
          "min-h-12 rounded border border-dashed px-2 py-1.5 text-xs transition-colors bg-slate-50",
          over ? "border-primary bg-primary/5" : "border-slate-300"
        )}
      >
        {fields.length === 0 ? (
          <span className="text-muted-foreground text-[11px]">Drop data fields here</span>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {fields.map((field) => (
              <button
                key={field}
                type="button"
                onClick={() => onRemove(field)}
                className="inline-flex max-w-full items-center gap-1 rounded border border-slate-300 bg-white px-2 py-0.5 text-left text-slate-800 text-[11px] hover:border-red-400 hover:text-red-500 transition-colors"
              >
                <span className="truncate">{field}</span>
                <X className="h-3 w-3 shrink-0" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function FilterSectionDropZone({
  level,
  onDrop,
  children,
  title,
  isEmpty
}: {
  level: "global" | "page" | "visual";
  onDrop: (column: string, level: "global" | "page" | "visual") => void;
  children: React.ReactNode;
  title: string;
  isEmpty: boolean;
}) {
  const [dragOver, setDragOver] = useState(false);
  return (
    <div className="space-y-2 border-b border-slate-200 pb-3">
      <p className="font-bold text-slate-800 text-[11px]">{title}</p>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const colName = e.dataTransfer.getData("text/plain");
          if (colName) onDrop(colName, level);
        }}
        className={cn(
          "rounded border border-dashed p-1.5 transition-all min-h-12 bg-white",
          dragOver ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-slate-300"
        )}
      >
        {isEmpty ? (
          <div className="text-center text-slate-400 text-[10px] py-3.5 select-none">
            Drag data fields here
          </div>
        ) : (
          <div className="space-y-1.5">{children}</div>
        )}
      </div>
    </div>
  );
}

function FilterCardComponent({
  filter,
  dataset,
  onUpdateFilter,
  onDeleteFilter
}: {
  filter: DashboardFilter;
  dataset?: Dataset;
  onUpdateFilter: (updated: DashboardFilter) => void;
  onDeleteFilter: (id: string) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [distinctValues, setDistinctValues] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    if (isExpanded && distinctValues.length === 0 && dataset) {
      setLoading(true);
      dataApi.chart({
        sql: `SELECT DISTINCT "${filter.columnName}" AS val FROM "${dataset.table_name}" LIMIT 100`,
        chart_type: "table",
        dataset_table: dataset.table_name
      }).then(res => {
        if (res && res.series) {
          const vals = res.series.map((row: any) => row.val ?? row[filter.columnName] ?? "");
          setDistinctValues(vals);
        }
      }).catch(err => {
        console.error("Failed to load distinct values:", err);
      }).finally(() => {
        setLoading(false);
      });
    }
  }, [isExpanded, dataset, filter.columnName]);

  const filteredValues = distinctValues.filter(val =>
    String(val ?? "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleCheckboxChange = (val: any) => {
    const isChecked = filter.selectedValues.includes(val);
    const nextSelected = isChecked
      ? filter.selectedValues.filter(v => v !== val)
      : [...filter.selectedValues, val];
    onUpdateFilter({ ...filter, selectedValues: nextSelected });
  };

  const handleTypeChange = (type: "basic" | "date" | "search") => {
    onUpdateFilter({
      ...filter,
      filterType: type,
      selectedValues: [],
      searchTerm: "",
      dateRelative: type === "date" ? { type: "days", value: 30 } : undefined
    });
  };

  return (
    <div className="rounded border border-slate-200 bg-slate-50 dark:bg-slate-900 overflow-hidden text-[11px] shadow-sm">
      <div className="flex items-center justify-between px-2 py-1.5 bg-white dark:bg-slate-850 border-b border-slate-100 font-semibold text-slate-700">
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-1 hover:text-primary transition-colors text-left truncate flex-1"
        >
          <ChevronDown className={cn("h-3 w-3 shrink-0 transition-transform text-slate-400", !isExpanded && "-rotate-90")} />
          <span className="truncate">{filter.columnName}</span>
        </button>
        <button
          type="button"
          onClick={() => onDeleteFilter(filter.id)}
          className="text-slate-400 hover:text-red-500 p-0.5 rounded transition-colors"
          title="Remove Filter"
        >
          <X className="h-3 w-3" />
        </button>
      </div>

      {isExpanded && (
        <div className="p-2 space-y-2">
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] text-slate-400 font-bold">Filter type</span>
            <select
              value={filter.filterType}
              onChange={(e) => handleTypeChange(e.target.value as any)}
              className="h-6.5 w-full rounded border border-slate-300 bg-white px-1 text-[10px] text-slate-800 focus:ring-1 focus:ring-primary outline-none"
            >
              <option value="basic">Basic filtering</option>
              <option value="search">Text search</option>
              {dataset && (
                <option value="date">Relative date</option>
              )}
            </select>
          </div>

          {filter.filterType === "basic" && (
            <div className="space-y-1.5 flex flex-col min-h-0">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search..."
                className="h-6 w-full border border-slate-300 rounded px-1.5 focus:outline-none focus:ring-1 focus:ring-primary bg-white text-slate-850"
              />
              {loading ? (
                <div className="flex justify-center items-center py-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />
                </div>
              ) : (
                <div className="space-y-0.5 overflow-y-auto pr-0.5 max-h-24">
                  {filteredValues.map(val => {
                    const isChecked = filter.selectedValues.includes(val);
                    return (
                      <label key={val} className="flex items-center gap-1.5 cursor-pointer py-0.5 hover:bg-slate-100 rounded px-1 transition-colors">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleCheckboxChange(val)}
                          className="rounded border-slate-300 text-[#118d95] focus:ring-[#118d95] h-3.5 w-3.5"
                        />
                        <span className="truncate text-slate-600">{String(val)}</span>
                      </label>
                    );
                  })}
                  {filteredValues.length === 0 && (
                    <div className="text-[9px] text-slate-400 italic text-center py-1">No items</div>
                  )}
                </div>
              )}
            </div>
          )}

          {filter.filterType === "search" && (
            <div className="space-y-1">
              <span className="text-[10px] text-slate-400 font-bold">Contains</span>
              <input
                type="text"
                value={filter.searchTerm || ""}
                onChange={(e) => onUpdateFilter({ ...filter, searchTerm: e.target.value })}
                placeholder="Search term..."
                className="h-6.5 w-full border border-slate-300 rounded px-1.5 focus:outline-none focus:ring-1 focus:ring-primary bg-white text-slate-850"
              />
            </div>
          )}

          {filter.filterType === "date" && filter.dateRelative && (
            <div className="space-y-1.5">
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] text-slate-400 font-bold">Show items in</span>
                <select
                  value={filter.dateRelative.type}
                  onChange={(e) => onUpdateFilter({
                    ...filter,
                    dateRelative: { ...filter.dateRelative!, type: e.target.value as any }
                  })}
                  className="h-6.5 w-full border border-slate-300 rounded bg-white px-1 text-[10px] text-slate-800 focus:outline-none"
                >
                  <option value="days">Last N Days</option>
                  <option value="quarter">This Quarter</option>
                  <option value="year">This Year</option>
                </select>
              </div>
              {filter.dateRelative.type === "days" && (
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] text-slate-400 font-bold">Number of Days</span>
                  <input
                    type="number"
                    min={1}
                    value={filter.dateRelative.value}
                    onChange={(e) => onUpdateFilter({
                      ...filter,
                      dateRelative: { ...filter.dateRelative!, value: Number(e.target.value) }
                    })}
                    className="h-6.5 w-full border border-slate-300 rounded px-1.5 text-slate-800"
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const hexToRgba = (hex: string, alpha: number) => {
  if (!hex) return `rgba(255, 255, 255, ${alpha})`;
  let cleanHex = hex.replace("#", "");
  if (cleanHex.length === 3) {
    cleanHex = cleanHex.split("").map(char => char + char).join("");
  }
  const r = parseInt(cleanHex.substring(0, 2), 16) || 0;
  const g = parseInt(cleanHex.substring(2, 4), 16) || 0;
  const b = parseInt(cleanHex.substring(4, 6), 16) || 0;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const DEFAULT_PAGE_FORMATTING = {
  pageName: "",
  isLandingPage: false,
  useAsTooltip: false,
  allowQA: false,
  canvasSettings: {
    type: "16:9",
    width: 1280,
    height: 720,
    verticalAlignment: "Top",
  },
  canvasBackground: {
    color: "#ffffff",
    imageUrl: "",
    imageFit: "Fit",
    transparency: 0,
  },
  wallpaper: {
    color: "#e1dfdd",
    imageUrl: "",
    imageFit: "Fit",
    transparency: 0,
  }
};

export default function DashboardDetailPage() {
  const { id } = useParams<{ id: string }>();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const jsonInputRef = useRef<HTMLInputElement>(null);
  
  // Real-Time Refresh states
  const [refreshInterval, setRefreshInterval] = useState<number>(0);
  const [lastRefreshedTime, setLastRefreshedTime] = useState<Date | null>(new Date());

  // Scheduled Reports states
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [scheduleFrequency, setScheduleFrequency] = useState("daily");
  const [scheduleRecipients, setScheduleRecipients] = useState("");
  const [schedules, setSchedules] = useState<any[]>([]);
  const [loadingSchedules, setLoadingSchedules] = useState(false);
  
  // Model View States
  const [modelTab, setModelTab] = useState<"relationships" | "calculations">("relationships");
  const [selectedModelTable, setSelectedModelTable] = useState<string>("");
  const [newColName, setNewColName] = useState("");
  const [newColExpression, setNewColExpression] = useState("");
  
  const [relFromTable, setRelFromTable] = useState("");
  const [relFromCol, setRelFromCol] = useState("");
  const [relToTable, setRelToTable] = useState("");
  const [relToCol, setRelToCol] = useState("");
  const [relCardinality, setRelCardinality] = useState("1:N");

  const handleAddCalculatedColumn = async () => {
    if (!selectedModelTable || !newColName.trim() || !newColExpression.trim()) {
      toast.error("Please fill all calculated column fields");
      return;
    }
    const colName = newColName.trim();
    const expr = newColExpression.trim();

    if (expr.includes(`[${colName}]`)) {
      toast.error("Circular reference: a column cannot refer to itself!");
      return;
    }

    const currentLayoutConfig = (dashboard?.layout_config || {}) as Record<string, any>;
    const ccList = [...(currentLayoutConfig.calculated_columns || [])];
    
    if (ccList.some((item: any) => item.table_name === selectedModelTable && item.column_name === colName)) {
      toast.error("A calculated column with this name already exists on this table.");
      return;
    }

    ccList.push({
      table_name: selectedModelTable,
      column_name: colName,
      expression: expr,
    });

    const updatedConfig = { ...currentLayoutConfig, calculated_columns: ccList };
    try {
      await dashboardsApi.update(id, { layout_config: updatedConfig });
      setDashboard((prev: any) => prev ? { ...prev, layout_config: updatedConfig } : prev);
      toast.success(`Calculated column "${colName}" created successfully!`);
      setNewColName("");
      setNewColExpression("");
    } catch (err) {
      toast.error("Failed to save calculated column");
    }
  };

  const handleDeleteCalculatedColumn = async (tableName: string, colName: string) => {
    const currentLayoutConfig = (dashboard?.layout_config || {}) as Record<string, any>;
    const ccList = (currentLayoutConfig.calculated_columns || []) as any[];
    const nextCc = ccList.filter((item: any) => !(item.table_name === tableName && item.column_name === colName));

    const updatedConfig = { ...currentLayoutConfig, calculated_columns: nextCc };
    try {
      await dashboardsApi.update(id, { layout_config: updatedConfig });
      setDashboard((prev: any) => prev ? { ...prev, layout_config: updatedConfig } : prev);
      toast.success("Calculated column deleted");
    } catch (err) {
      toast.error("Failed to delete calculated column");
    }
  };

  const handleAddRelationship = async () => {
    if (!relFromTable || !relFromCol || !relToTable || !relToCol) {
      toast.error("Please select all table and column fields for relationship");
      return;
    }
    if (relFromTable === relToTable) {
      toast.error("Self-relationships are not supported.");
      return;
    }

    const currentLayoutConfig = (dashboard?.layout_config || {}) as Record<string, any>;
    const relList = [...(currentLayoutConfig.relationships || [])];

    const exists = relList.some(
      (item: any) =>
        (item.from_table === relFromTable && item.from_col === relFromCol && item.to_table === relToTable && item.to_col === relToCol) ||
        (item.from_table === relToTable && item.from_col === relToCol && item.to_table === relFromTable && item.to_col === relFromCol)
    );
    if (exists) {
      toast.error("This relationship already exists!");
      return;
    }

    relList.push({
      from_table: relFromTable,
      from_col: relFromCol,
      to_table: relToTable,
      to_col: relToCol,
      cardinality: relCardinality,
    });

    const updatedConfig = { ...currentLayoutConfig, relationships: relList };
    try {
      await dashboardsApi.update(id, { layout_config: updatedConfig });
      setDashboard((prev: any) => prev ? { ...prev, layout_config: updatedConfig } : prev);
      toast.success("Relationship created!");
      setRelFromCol("");
      setRelToCol("");
    } catch (err) {
      toast.error("Failed to save relationship");
    }
  };

  const handleDeleteRelationship = async (index: number) => {
    const currentLayoutConfig = (dashboard?.layout_config || {}) as Record<string, any>;
    const relList = [...(currentLayoutConfig.relationships || [])];
    relList.splice(index, 1);

    const updatedConfig = { ...currentLayoutConfig, relationships: relList };
    try {
      await dashboardsApi.update(id, { layout_config: updatedConfig });
      setDashboard((prev: any) => prev ? { ...prev, layout_config: updatedConfig } : prev);
      toast.success("Relationship deleted");
    } catch (err) {
      toast.error("Failed to delete relationship");
    }
  };

  // Real-time Collaboration States
  const [collaborators, setCollaborators] = useState<Record<string, { x: number; y: number; name: string; color: string }>>({});
  const [lockedWidgets, setLockedWidgets] = useState<Record<string, { userId: string; name: string }>>({});
  const [selectedWidgetId, setSelectedWidgetId] = useState<string>("");
  const wsRef = useRef<WebSocket | null>(null);
  const prevSelectedWidgetIdRef = useRef<string | null>(null);
  const { user } = useAuthStore();

  useEffect(() => {
    if (!id || !user) return;

    const colors = ["#ef4444", "#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899", "#14b8a6"];
    const myColor = colors[Math.floor(Math.random() * colors.length)];

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.hostname === "localhost" ? "localhost:8000" : window.location.host;
    const wsUrl = `${protocol}//${host}/api/v1/dashboards/ws/${id}?user_id=${user.id}&user_name=${encodeURIComponent(user.full_name)}`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "cursor_move") {
          setCollaborators((prev) => ({
            ...prev,
            [msg.user_id]: { x: msg.x, y: msg.y, name: msg.user_name, color: msg.color || "#6366f1" },
          }));
        } else if (msg.type === "user_left") {
          setCollaborators((prev) => {
            const next = { ...prev };
            delete next[msg.user_id];
            return next;
          });
        } else if (msg.type === "card_lock") {
          setLockedWidgets((prev) => ({
            ...prev,
            [msg.widget_id]: { userId: msg.user_id, name: msg.user_name },
          }));
        } else if (msg.type === "card_unlock") {
          setLockedWidgets((prev) => {
            const next = { ...prev };
            delete next[msg.widget_id];
            return next;
          });
        }
      } catch (err) {
        console.error("Failed to parse websocket message", err);
      }
    };

    ws.onclose = () => {
      console.log("Websocket connection closed");
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [id, user]);

  useEffect(() => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN || !user) return;

    let lastSent = 0;
    const handleMouseMove = (e: MouseEvent) => {
      if (!viewportRef.current) return;
      const rect = viewportRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      const now = Date.now();
      if (now - lastSent > 80) {
        lastSent = now;
        try {
          wsRef.current?.send(JSON.stringify({
            type: "cursor_move",
            x,
            y,
            color: "#118d95",
          }));
        } catch (err) {}
      }
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
    };
  }, [user]);

  useEffect(() => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN || !user) return;
    
    const prev = prevSelectedWidgetIdRef.current;
    if (prev && prev !== selectedWidgetId) {
      try {
        wsRef.current.send(JSON.stringify({
          type: "card_unlock",
          widget_id: prev
        }));
      } catch (err) {}
    }
    
    if (selectedWidgetId) {
      try {
        wsRef.current.send(JSON.stringify({
          type: "card_lock",
          widget_id: selectedWidgetId
        }));
      } catch (err) {}
    }
    
    prevSelectedWidgetIdRef.current = selectedWidgetId;
  }, [selectedWidgetId, user]);

  // Power BI Replication UI States
  const [activeRibbonTab, setActiveRibbonTab] = useState("Home");
  const [showFiltersPane, setShowFiltersPane] = useState(true);
  const [showVisualizationsPane, setShowVisualizationsPane] = useState(true);
  const [showDataPane, setShowDataPane] = useState(true);
  const [showGridlines, setShowGridlines] = useState(true);
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [lockObjects, setLockObjects] = useState(false);
  const [dashboardTheme, setDashboardTheme] = useState("default");
  const [zoomPercent, setZoomPercent] = useState(100);

  // Zoom & Pan Offset States
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [canvasMode, setCanvasMode] = useState<"select" | "pan">("select");
  const startPanRef = useRef({ x: 0, y: 0 });
  const viewportRef = useRef<HTMLDivElement>(null);

  // Spacing indicators
  interface SpacingIndicator {
    x: number;
    y: number;
    width?: number;
    height?: number;
    value: string;
  }
  const [spacingIndicators, setSpacingIndicators] = useState<SpacingIndicator[]>([]);

  // Locked & Hidden Pages lists
  const [lockedPages, setLockedPages] = useState<string[]>([]);
  const [hiddenPages, setHiddenPages] = useState<string[]>([]);

  // Page tab context menu state
  const [tabContextMenu, setTabContextMenu] = useState<{ x: number; y: number; pageName: string } | null>(null);

  // Alignment guides
  const [alignX, setAlignX] = useState<number | null>(null);
  const [alignY, setAlignY] = useState<number | null>(null);

  // Undo/Redo history stack
  const [history, setHistory] = useState<WidgetWithData[][]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  const pushToHistory = (newWidgets: WidgetWithData[]) => {
    setHistory((prev) => {
      const nextHistory = prev.slice(0, historyIndex + 1);
      nextHistory.push(newWidgets);
      if (nextHistory.length > 50) nextHistory.shift();
      return nextHistory;
    });
    setHistoryIndex((prev) => Math.min(49, prev + 1));
  };

  // Clipboard Copied Widget
  const [copiedWidget, setCopiedWidget] = useState<WidgetWithData | null>(null);

  // Visual option states (Focus mode and More menu dropdown)
  const [focusedWidget, setFocusedWidget] = useState<WidgetWithData | null>(null);
  const [activeDropdownWidgetId, setActiveDropdownWidgetId] = useState<string | null>(null);

  // Cross-filtering states
  const [activeFilters, setActiveFilters] = useState<Record<string, any>>({});

  // Phase 3 Panel filters state (Global, Page, Visual)
  const [panelFilters, setPanelFilters] = useState<DashboardFilter[]>([]);

  const saveFiltersToLayoutConfig = async (nextFilters: DashboardFilter[]) => {
    const currentLayoutConfig = (dashboard?.layout_config || {}) as Record<string, any>;
    const updatedConfig = { ...currentLayoutConfig, panel_filters: nextFilters };
    try {
      await dashboardsApi.update(id, { layout_config: updatedConfig });
      setDashboard((prev: any) => prev ? { ...prev, layout_config: updatedConfig } : prev);
    } catch (err) {
      console.error("Failed to save filters:", err);
    }
  };

  const handleDropFilter = (columnName: string, level: "global" | "page" | "visual") => {
    const newFilter: DashboardFilter = {
      id: Math.random().toString(36).substr(2, 9),
      columnName,
      level,
      targetWidgetId: level === "visual" ? selectedWidgetId : undefined,
      pageName: level === "page" ? activePage : undefined,
      filterType: "basic",
      selectedValues: [],
    };
    const nextFilters = [...panelFilters, newFilter];
    setPanelFilters(nextFilters);
    saveFiltersToLayoutConfig(nextFilters);
  };

  const handleUpdateFilter = (updated: DashboardFilter) => {
    const nextFilters = panelFilters.map(f => f.id === updated.id ? updated : f);
    setPanelFilters(nextFilters);
    saveFiltersToLayoutConfig(nextFilters);
  };

  const handleDeleteFilter = (filterId: string) => {
    const nextFilters = panelFilters.filter(f => f.id !== filterId);
    setPanelFilters(nextFilters);
    saveFiltersToLayoutConfig(nextFilters);
  };

  const getActiveFiltersByColumn = () => {
    const result: Record<string, any[]> = {};
    Object.keys(activeFilters).forEach(key => {
      const filter = activeFilters[key];
      if (!filter) return;
      
      if (typeof filter === "object") {
        if (filter.type === "checkbox" && Array.isArray(filter.values) && filter.values.length > 0) {
          result[key] = filter.values;
        }
      } else if (filter === true) {
        const currentPageWidgets = widgets.filter(w => {
          const currentLayoutConfig = (dashboard?.layout_config || {}) as Record<string, any>;
          const widgetPages = currentLayoutConfig.widget_pages || {};
          const wPage = widgetPages[w.id] || "Page 1";
          return wPage === activePage;
        });
        const matchingWidget = currentPageWidgets.find(w => w.x_key && w.chartData?.labels?.includes(key));
        if (matchingWidget && matchingWidget.x_key) {
          if (!result[matchingWidget.x_key]) result[matchingWidget.x_key] = [];
          if (!result[matchingWidget.x_key].includes(key)) {
            result[matchingWidget.x_key].push(key);
          }
        }
      }
    });
    return result;
  };

  // Context Menu State
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; widget: WidgetWithData } | null>(null);

  useEffect(() => {
    const handleOutsideClick = () => {
      setContextMenu(null);
    };
    window.addEventListener("click", handleOutsideClick);
    return () => {
      window.removeEventListener("click", handleOutsideClick);
    };
  }, []);

  const [pages, setPages] = useState<string[]>(["Page 1"]);
  const [activePage, setActivePage] = useState("Page 1");
  const [editingPage, setEditingPage] = useState<string | null>(null);
  const [editingPageValue, setEditingPageValue] = useState("");
  const [draggedPage, setDraggedPage] = useState<string | null>(null);
  const [fileMenuOpen, setFileMenuOpen] = useState(false);

  // Bookmarks state
  const [showBookmarksPane, setShowBookmarksPane] = useState(false);
  const [bookmarkName, setBookmarkName] = useState("");
  const [bookmarks, setBookmarks] = useState<Array<{ name: string; page: string; filters: Record<string, any>; theme: string; zoom: number }>>([]);

  // Drilldown state
  const [widgetDrillPaths, setWidgetDrillPaths] = useState<Record<string, Array<{ field: string; value: any }>>>({});

  // DAX IntelliSense
  const [showDaxSuggestions, setShowDaxSuggestions] = useState(false);
  const [daxSearchTerm, setDaxSearchTerm] = useState("");
  const [suggestionIndex, setSuggestionIndex] = useState(0);

  // Visualizations sub-tabs (Build / Format / Analytics)
  const [activeVizTab, setActiveVizTab] = useState<"build" | "format" | "analytics">("build");
  const [formatSearch, setFormatSearch] = useState("");
  const [formatSubTab, setFormatSubTab] = useState<"visual" | "general">("visual");
  const [expandedFormatGroups, setExpandedFormatGroups] = useState<Record<string, boolean>>({
    "y-axis": false,
    "x-axis": false,
    "legend": false,
    "small-multiples": false,
    "gridlines": false,
    "zoom-slider": false,
    "bars": false,
    "ribbons": false,
    "data-labels": false,
    "total-labels": false,
    "plot-area-bg": false,
  });

  const [formatOptions, setFormatOptions] = useState({
    showYAxis: true,
    yAxisFontFamily: "Arial",
    yAxisFontSize: 11,
    yAxisBold: false,
    yAxisItalic: false,
    yAxisUnderline: false,
    yAxisColor: "#64748b",
    showYAxisTitle: true,
    yAxisTitleText: "Auto",
    
    showXAxis: true,
    xAxisFontFamily: "Arial",
    xAxisFontSize: 11,
    xAxisBold: false,
    xAxisItalic: false,
    xAxisUnderline: false,
    xAxisColor: "#64748b",
    showXAxisTitle: true,
    xAxisTitleText: "Auto",

    showLegend: true,
    legendPosition: "top",
    showGridlines: true,
    gridlineColor: "rgba(0,0,0,0.1)",
    gridlineStyle: "3 3",
    showZoomSlider: false,
    
    showBars: true,
    barsColor: "#118d95",
    barsPadding: 0.1,

    showRibbons: false,

    showDataLabels: false,
    dataLabelsColor: "#64748b",
    dataLabelsSize: 10,
    
    showTotalLabels: false,

    showPlotAreaBg: false,
    plotAreaBgColor: "#ffffff",
    plotAreaBgTransparency: 0,

    showXConstantLine: false,
    xConstantLineValue: "",
    xConstantLineColor: "#ef4444",
    xConstantLineLabel: "Constant Line",
    showErrorBars: false,
    errorBarPercentage: 10,

    // Conditional Formatting properties
    conditionalFormattingEnabled: false,
    conditionalMinThreshold: undefined as number | undefined,
    conditionalMinColor: "#ef4444",
    conditionalMaxThreshold: undefined as number | undefined,
    conditionalMaxColor: "#10b981",
  });



  const toggleFormatGroup = (groupKey: string) => {
    setExpandedFormatGroups((prev) => ({
      ...prev,
      [groupKey]: !prev[groupKey],
    }));
  };



  const matchesSearch = (title: string) => {
    if (!formatSearch.trim()) return true;
    return title.toLowerCase().includes(formatSearch.toLowerCase().trim());
  };

  // Original Data States
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const isSyncingFromWidget = useRef(false);
  const [widgets, setWidgets] = useState<WidgetWithData[]>([]);
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState("");
  const [draft, setDraft] = useState<VisualDraft>({ ...EMPTY_VISUAL });
  const [preview, setPreview] = useState<ChartData | null>(null);
  const [previewError, setPreviewError] = useState("");
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [dataSearch, setDataSearch] = useState("");
  const [activeView, setActiveView] = useState<"report" | "table" | "model">("report");
  const [selectedVisualIndex, setSelectedVisualIndex] = useState(0);
  const [tablePreview, setTablePreview] = useState<{
    columns: string[];
    rows: Record<string, unknown>[];
  } | null>(null);
  const [tableLoading, setTableLoading] = useState(false);

  // Page formatting groups expansion
  const [expandedPageGroups, setExpandedPageGroups] = useState<Record<string, boolean>>({
    "page-info": false,
    "canvas-settings": false,
    "canvas-background": false,
    "wallpaper": false,
    "filter-pane": false,
    "filter-cards": false,
  });

  const togglePageGroup = (groupKey: string) => {
    setExpandedPageGroups((prev) => ({
      ...prev,
      [groupKey]: !prev[groupKey],
    }));
  };

  const handleCanvasTypeChange = (newType: string) => {
    let w = activePageFormatting.canvasSettings.width;
    let h = activePageFormatting.canvasSettings.height;
    if (newType === "16:9") {
      w = 1280;
      h = 720;
    } else if (newType === "4:3") {
      w = 960;
      h = 720;
    } else if (newType === "Letter") {
      w = 816;
      h = 1056;
    } else if (newType === "Tooltip") {
      w = 320;
      h = 240;
    }
    updatePageFormatting({
      canvasSettings: {
        type: newType,
        width: w,
        height: h,
        verticalAlignment: activePageFormatting.canvasSettings.verticalAlignment,
      }
    });
  };

  // Compute active page formatting settings dynamically
  const activePageFormatting = useMemo(() => {
    const currentLayoutConfig = (dashboard?.layout_config || {}) as Record<string, any>;
    const pageFormattingMap = (currentLayoutConfig.page_formatting || {}) as Record<string, any>;
    const activeFormat = pageFormattingMap[activePage] || {};
    return {
      pageName: activeFormat.pageName || activePage,
      isLandingPage: activeFormat.isLandingPage ?? false,
      useAsTooltip: activeFormat.useAsTooltip ?? false,
      allowQA: activeFormat.allowQA ?? false,
      canvasSettings: {
        type: activeFormat.canvasSettings?.type || "16:9",
        width: activeFormat.canvasSettings?.width ?? 1280,
        height: activeFormat.canvasSettings?.height ?? 720,
        verticalAlignment: activeFormat.canvasSettings?.verticalAlignment || "Top",
      },
      canvasBackground: {
        color: activeFormat.canvasBackground?.color || "#ffffff",
        imageUrl: activeFormat.canvasBackground?.imageUrl || "",
        imageFit: activeFormat.canvasBackground?.imageFit || "Fit",
        transparency: activeFormat.canvasBackground?.transparency ?? 0,
      },
      wallpaper: {
        color: activeFormat.wallpaper?.color || "#e1dfdd",
        imageUrl: activeFormat.wallpaper?.imageUrl || "",
        imageFit: activeFormat.wallpaper?.imageFit || "Fit",
        transparency: activeFormat.wallpaper?.transparency ?? 0,
      }
    };
  }, [dashboard?.layout_config, activePage]);

  // Callback to update formatting settings for current page
  const updatePageFormatting = useCallback(async (updates: any) => {
    if (!dashboard) return;
    const currentLayoutConfig = (dashboard.layout_config || {}) as Record<string, any>;
    const pageFormattingMap = { ...(currentLayoutConfig.page_formatting || {}) };
    const currentPageFormatting = pageFormattingMap[activePage] || {};

    const updatedPageFormatting = {
      ...currentPageFormatting,
      ...updates,
      canvasSettings: {
        ...(currentPageFormatting.canvasSettings || {
          type: "16:9",
          width: 1280,
          height: 720,
          verticalAlignment: "Top",
        }),
        ...(updates.canvasSettings || {}),
      },
      canvasBackground: {
        ...(currentPageFormatting.canvasBackground || {
          color: "#ffffff",
          imageUrl: "",
          imageFit: "Fit",
          transparency: 0,
        }),
        ...(updates.canvasBackground || {}),
      },
      wallpaper: {
        ...(currentPageFormatting.wallpaper || {
          color: "#e1dfdd",
          imageUrl: "",
          imageFit: "Fit",
          transparency: 0,
        }),
        ...(updates.wallpaper || {}),
      }
    };

    pageFormattingMap[activePage] = updatedPageFormatting;

    const updatedConfig = {
      ...currentLayoutConfig,
      page_formatting: pageFormattingMap,
    };

    // Optimistic state update
    setDashboard((prev: any) => prev ? { ...prev, layout_config: updatedConfig } : prev);

    try {
      await dashboardsApi.update(id, { layout_config: updatedConfig });
    } catch {
      toast.error("Failed to save page formatting settings");
    }
  }, [dashboard, activePage, id]);

  // Local state inputs to prevent API lag on keystroke
  const [localPageName, setLocalPageName] = useState(activePage);
  useEffect(() => {
    setLocalPageName(activePageFormatting.pageName);
  }, [activePage, activePageFormatting.pageName]);

  const [localCanvasWidth, setLocalCanvasWidth] = useState(activePageFormatting.canvasSettings.width);
  const [localCanvasHeight, setLocalCanvasHeight] = useState(activePageFormatting.canvasSettings.height);
  useEffect(() => {
    setLocalCanvasWidth(activePageFormatting.canvasSettings.width);
    setLocalCanvasHeight(activePageFormatting.canvasSettings.height);
  }, [activePageFormatting.canvasSettings.width, activePageFormatting.canvasSettings.height]);

  const [localCanvasBgUrl, setLocalCanvasBgUrl] = useState(activePageFormatting.canvasBackground.imageUrl);
  const [localWallpaperUrl, setLocalWallpaperUrl] = useState(activePageFormatting.wallpaper.imageUrl);
  useEffect(() => {
    setLocalCanvasBgUrl(activePageFormatting.canvasBackground.imageUrl);
    setLocalWallpaperUrl(activePageFormatting.wallpaper.imageUrl);
  }, [activePageFormatting.canvasBackground.imageUrl, activePageFormatting.wallpaper.imageUrl]);

  // Automatically persist format options to layout_config when they change
  const isFirstFormatOptionsRender = useRef(true);
  useEffect(() => {
    if (isFirstFormatOptionsRender.current) {
      isFirstFormatOptionsRender.current = false;
      return;
    }
    if (!dashboard) return;
    const currentLayoutConfig = (dashboard.layout_config || {}) as Record<string, any>;
    if (JSON.stringify(currentLayoutConfig.format_options) === JSON.stringify(formatOptions)) return;
    
    const updatedConfig = { ...currentLayoutConfig, format_options: formatOptions };
    dashboardsApi.update(id, { layout_config: updatedConfig }).then(() => {
      setDashboard((prevDash: any) => prevDash ? { ...prevDash, layout_config: updatedConfig } : prevDash);
    }).catch(() => {});
  }, [formatOptions, dashboard, id]);

  // Automatically persist bookmarks to layout_config when they change
  const isFirstBookmarksRender = useRef(true);
  useEffect(() => {
    if (isFirstBookmarksRender.current) {
      isFirstBookmarksRender.current = false;
      return;
    }
    if (!dashboard) return;
    const currentLayoutConfig = (dashboard.layout_config || {}) as Record<string, any>;
    if (JSON.stringify(currentLayoutConfig.bookmarks) === JSON.stringify(bookmarks)) return;
    
    const updatedConfig = { ...currentLayoutConfig, bookmarks };
    dashboardsApi.update(id, { layout_config: updatedConfig }).then(() => {
      setDashboard((prevDash: any) => prevDash ? { ...prevDash, layout_config: updatedConfig } : prevDash);
    }).catch(() => {});
  }, [bookmarks, dashboard, id]);


  const selectedDataset = datasets.find((dataset) => dataset.id === selectedDatasetId);
  const columns = useMemo(() => {
    const baseCols = selectedDataset?.columns ?? [];
    if (!selectedDataset) return baseCols;
    const layoutConfig = (dashboard?.layout_config || {}) as Record<string, any>;
    const cc = (layoutConfig.calculated_columns || []) as Array<{ table_name: string; column_name: string }>;
    const tableCc = cc.filter(item => item.table_name === selectedDataset.table_name).map(item => item.column_name);
    return [...baseCols, ...tableCc];
  }, [selectedDataset, dashboard?.layout_config]);
  const filteredColumns = useMemo(
    () => columns.filter((column) => column.toLowerCase().includes(dataSearch.trim().toLowerCase())),
    [columns, dataSearch]
  );
  const generatedSql = useMemo(() => buildDatasetSql(draft), [draft]);
  const daxMeasure = useMemo(() => parseDaxMeasure(draft.dax), [draft.dax]);
  const chartYKeys = useMemo(
    () => daxMeasure ? [daxMeasure.alias] : draft.values.map((field) => aliasFor(field, draft.aggregation)),
    [daxMeasure, draft.aggregation, draft.values]
  );
  const canPreview = Boolean(
    selectedDataset && (
      draft.chart_type === "table" ||
      draft.chart_type === "card" && (draft.values.length || daxMeasure) ||
      draft.axis && (draft.values.length || daxMeasure)
    )
  );
  const selectedWidget = widgets.find((widget) => widget.id === selectedWidgetId);
  const valuesAreNumeric = useMemo(() => {
    if (!selectedDataset || !selectedDataset.column_types || draft.values.length === 0) return true;
    return draft.values.every((field) => {
      const type = selectedDataset.column_types?.[field]?.toUpperCase() ?? "";
      return (
        type.includes("INT") ||
        type.includes("DOUBLE") ||
        type.includes("PRECISION") ||
        type.includes("REAL") ||
        type.includes("NUMERIC") ||
        type.includes("FLOAT") ||
        type.includes("DECIMAL")
      );
    });
  }, [draft.values, selectedDataset]);

  const smartRecommendation = useMemo(() => {
    if (!selectedDataset || !draft.axis) return null;
    const axisType = selectedDataset.column_types?.[draft.axis]?.toUpperCase() ?? "";
    const isTemporal = axisType.includes("TIME") || axisType.includes("DATE") || axisType.includes("TIMESTAMP");
    
    if (isTemporal) {
      return {
        type: "line" as ChartType,
        title: "Line Chart",
        reason: "The X-Axis is temporal. Line charts are best for displaying trends over time."
      };
    }
    
    if (draft.values.length > 1) {
      return {
        type: "bar" as ChartType,
        title: "Bar Chart",
        reason: "Multiple measures are selected. A Bar chart allows side-by-side comparison."
      };
    }
    
    return {
      type: "pie" as ChartType,
      title: "Pie / Donut Chart",
      reason: "Single category metric. Pie or Donut charts are ideal for showing composition."
    };
  }, [selectedDataset, draft.axis, draft.values]);

  const loadWidgetData = useCallback(
    async (items: WidgetWithData[], from?: string, to?: string) => {
      const activeFiltersByCol = getActiveFiltersByColumn();
      
      for (const widget of items) {
        try {
          const dataset = datasets.find(d => d.id === widget.dataset_id) || datasets[0];
          if (dataset) {
            const currentLayoutConfig = (dashboard?.layout_config || {}) as Record<string, any>;
            const settings = currentLayoutConfig.widget_settings?.[widget.id] || {};
            const dtFields = settings.drillThroughFields || [];
            const drillPath = widgetDrillPaths[widget.id] || [];

            const whereClause = compileWhereClause(
              widget,
              dataset.table_name,
              panelFilters,
              activePage,
              activeFiltersByCol,
              drillPath,
              activeFilters
            );

            const sql = buildSqlForWidget(
              widget.chart_type,
              widget.x_key || "",
              widget.y_keys || [],
              (widget as any).aggregation || settings.aggregation || "sum",
              (widget as any).dax || settings.dax || "",
              dataset.table_name,
              dtFields,
              drillPath,
              (widget as any).tooltips || settings.tooltips || [],
              whereClause
            );

            if (sql) {
              const currentAxis = drillPath.length === 0 ? (widget.x_key || "") : dtFields[drillPath.length - 1];
              const data = await dataApi.chart({
                sql,
                chart_type: widget.chart_type,
                x_key: widget.chart_type === "table" || widget.chart_type === "card" ? undefined : currentAxis,
                y_keys: widget.chart_type === "table" ? undefined : widget.y_keys,
                dataset_table: dataset.table_name,
                limit: widget.chart_type === "table" ? 100 : 500,
              });

              setWidgets((current) =>
                current.map((item) =>
                  item.id === widget.id ? { ...item, chartData: data, loading: false, error: undefined } : item
                )
              );
              continue;
            }
          }
          
          const data = await dashboardsApi.getWidgetData(id, widget.id, from || undefined, to || undefined);
          setWidgets((current) =>
            current.map((item) =>
              item.id === widget.id ? { ...item, chartData: data, loading: false, error: undefined } : item
            )
          );
        } catch (error) {
          const err = error as { response?: { data?: { detail?: string } } };
          setWidgets((current) =>
            current.map((item) =>
              item.id === widget.id
                ? { ...item, loading: false, error: cleanErrorMessage(err.response?.data?.detail || "Failed to load data") }
                : item
            )
          );
        }
      }
    },
    [id, datasets, dashboard, panelFilters, activePage, activeFilters, widgetDrillPaths]
  );

  // Load selected widget settings into draft state
  useEffect(() => {
    if (selectedWidget) {
      isSyncingFromWidget.current = true;
      const currentLayoutConfig = (dashboard?.layout_config || {}) as Record<string, any>;
      const settings = currentLayoutConfig.widget_settings?.[selectedWidget.id] || {};
      
      const dataset = datasets.find(d => d.id === selectedWidget.dataset_id);
      const datasetCols = dataset?.columns || [];
      
      let inferredAggregation = settings.aggregation || "sum";
      if (!settings.aggregation && selectedWidget.y_keys && selectedWidget.y_keys.length > 0) {
        const firstKey = selectedWidget.y_keys[0];
        if (firstKey.endsWith("_count")) inferredAggregation = "count";
        else if (firstKey.endsWith("_sum")) inferredAggregation = "sum";
        else if (firstKey.endsWith("_avg")) inferredAggregation = "avg";
        else if (firstKey.endsWith("_min")) inferredAggregation = "min";
        else if (firstKey.endsWith("_max")) inferredAggregation = "max";
      }

      const storedYKeys = selectedWidget.y_keys || [];
      const mappedValues = storedYKeys.map((yKey) => {
        if (datasetCols.includes(yKey)) return yKey;
        for (const suffix of ["_count", "_sum", "_avg", "_min", "_max", "_tooltip"]) {
          if (yKey.endsWith(suffix)) {
            const baseField = yKey.slice(0, -suffix.length);
            if (datasetCols.includes(baseField)) return baseField;
          }
        }
        for (const suffix of ["_count", "_sum", "_avg", "_min", "_max", "_tooltip"]) {
          if (yKey.toLowerCase().endsWith(suffix)) {
            const baseField = yKey.slice(0, -suffix.length);
            const found = datasetCols.find(c => c.toLowerCase() === baseField.toLowerCase());
            if (found) return found;
          }
        }
        return yKey;
      });
      const tableValues = selectedWidget.chart_type === "table"
        ? mappedValues.filter((field) => field !== selectedWidget.x_key)
        : mappedValues;

      setDraft({
        title: selectedWidget.title || "",
        chart_type: selectedWidget.chart_type,
        axis: selectedWidget.x_key || "",
        values: tableValues,
        legend: "",
        aggregation: inferredAggregation,
        dax: settings.dax || "",
        date_filter_enabled: selectedWidget.date_filter_enabled || false,
        smallMultiples: settings.smallMultiples || "",
        tooltips: settings.tooltips || [],
        crossReport: false,
        keepAllFilters: false,
        drillThroughFields: settings.drillThroughFields || [],
      });

      const vIndex = VISUAL_TYPES.findIndex((v) => v.value === selectedWidget.chart_type);
      if (vIndex !== -1) {
        setSelectedVisualIndex(vIndex);
      }

      if (selectedWidget.dataset_id) {
        setSelectedDatasetId(selectedWidget.dataset_id);
      }

      setTimeout(() => {
        isSyncingFromWidget.current = false;
      }, 50);
    } else {
      setDraft({ ...EMPTY_VISUAL });
      setSelectedVisualIndex(0);
    }
  }, [selectedWidgetId, dashboard]);

  // Sync draft edits back to selected widget in real time
  useEffect(() => {
    if (!selectedWidgetId || !selectedWidget) return;

    const newSql = buildSqlForWidget(
      draft.chart_type,
      draft.axis,
      draft.values,
      draft.aggregation,
      draft.dax,
      selectedDataset?.table_name || "",
      draft.drillThroughFields,
      widgetDrillPaths[selectedWidgetId] || [],
      draft.tooltips
    );

    const daxM = parseDaxMeasure(draft.dax);
    const yKeys = daxM ? [daxM.alias] : draft.values.map((f) => aliasFor(f, draft.aggregation));

    const { x_key: computedXKey, y_keys: computedYKeys } = getWidgetMapping(draft, yKeys);

    const isDifferent =
      selectedWidget.title !== draft.title ||
      selectedWidget.chart_type !== draft.chart_type ||
      selectedWidget.query_sql !== newSql ||
      selectedWidget.x_key !== computedXKey ||
      JSON.stringify(selectedWidget.y_keys) !== JSON.stringify(computedYKeys) ||
      selectedWidget.date_filter_enabled !== draft.date_filter_enabled;

    if (!isDifferent) return;

    const updatedWidget = {
      ...selectedWidget,
      title: draft.title || selectedWidget.title,
      chart_type: draft.chart_type,
      query_sql: newSql,
      x_key: computedXKey,
      y_keys: computedYKeys,
      date_filter_enabled: draft.date_filter_enabled,
    };

    const currentLayoutConfig = (dashboard?.layout_config || {}) as Record<string, any>;
    const widgetSettings = { ...(currentLayoutConfig.widget_settings || {}) };
    widgetSettings[selectedWidgetId] = {
      drillThroughFields: draft.drillThroughFields,
      dax: draft.dax,
      aggregation: draft.aggregation,
      tooltips: draft.tooltips,
      smallMultiples: draft.smallMultiples,
    };
    const updatedConfig = { ...currentLayoutConfig, widget_settings: widgetSettings };

    const syncWidget = async () => {
      try {
        await dashboardsApi.updateWidget(id, selectedWidgetId, updatedWidget as any);
        await dashboardsApi.update(id, { layout_config: updatedConfig });
        
        setWidgets((current) =>
          current.map((w) => (w.id === selectedWidgetId ? { ...updatedWidget, chartData: w.chartData } : w))
        );
        
        await loadWidgetData([updatedWidget], dateFrom, dateTo);
      } catch (err) {
        console.error("Real-time sync failed:", err);
      }
    };

    syncWidget();
  }, [draft, selectedWidgetId, selectedWidget, selectedDataset, id, dashboard, dateFrom, dateTo, widgetDrillPaths, loadWidgetData]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [dash, datasetList] = await Promise.all([dashboardsApi.get(id), datasetsApi.list(id)]);
      const readyDatasets = datasetList.filter((dataset: Dataset) => dataset.status === "ready");
      
      const layoutConfig = dash.layout_config || {};
      const widgetSettings = layoutConfig.widget_settings || {};
      
      const initialWidgets = dash.widgets.map((widget: DashboardWidget) => {
        const settings = widgetSettings[widget.id] || {};
        return {
          ...widget,
          loading: true,
          drillThroughFields: settings.drillThroughFields || [],
          dax: settings.dax || "",
          aggregation: settings.aggregation || "sum",
          tooltips: settings.tooltips || [],
          smallMultiples: settings.smallMultiples || "",
        };
      });

      setDashboard(dash);
      setDatasets(readyDatasets);
      setWidgets(initialWidgets);
      
      const layoutPages = layoutConfig.pages;
      if (layoutPages && Array.isArray(layoutPages) && layoutPages.length > 0) {
        setPages(layoutPages);
        setActivePage(layoutPages[0]);
      } else {
        setPages(["Page 1"]);
        setActivePage("Page 1");
      }

      const layoutLockedPages = layoutConfig.locked_pages || [];
      setLockedPages(layoutLockedPages);
      
      const layoutHiddenPages = layoutConfig.hidden_pages || [];
      setHiddenPages(layoutHiddenPages);

      const layoutBookmarks = layoutConfig.bookmarks;
      if (layoutBookmarks && Array.isArray(layoutBookmarks)) {
        setBookmarks(layoutBookmarks);
      } else {
        setBookmarks([]);
      }

      const layoutFormatOptions = layoutConfig.format_options;
      if (layoutFormatOptions) {
        setFormatOptions((prev) => ({ ...prev, ...layoutFormatOptions }));
      }

      const layoutPanelFilters = layoutConfig.panel_filters;
      if (layoutPanelFilters && Array.isArray(layoutPanelFilters)) {
        setPanelFilters(layoutPanelFilters);
      } else {
        setPanelFilters([]);
      }

      setHistory([initialWidgets]);
      setHistoryIndex(0);
      if (!selectedDatasetId && readyDatasets[0]) setSelectedDatasetId(readyDatasets[0].id);
      await loadWidgetData(initialWidgets, dateFrom, dateTo);

    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, id, loadWidgetData, selectedDatasetId]);

  useEffect(() => {
    load();
  }, []);

  // Real-Time Refresh effect
  useEffect(() => {
    if (refreshInterval <= 0) return;
    const timer = setInterval(() => {
      load();
      setLastRefreshedTime(new Date());
    }, refreshInterval * 1000);
    return () => clearInterval(timer);
  }, [refreshInterval, load]);

  // Scheduled Reports handlers
  const loadSchedules = useCallback(async () => {
    if (!id) return;
    setLoadingSchedules(true);
    try {
      const data = await dashboardsApi.getSchedules(id);
      setSchedules(data);
    } catch (err) {
      console.error("Failed to load schedules", err);
    } finally {
      setLoadingSchedules(false);
    }
  }, [id]);

  useEffect(() => {
    if (showScheduleModal) {
      loadSchedules();
    }
  }, [showScheduleModal, loadSchedules]);

  const handleCreateSchedule = async () => {
    if (!id) return;
    const emails = scheduleRecipients.split(",").map(e => e.trim()).filter(Boolean);
    if (emails.length === 0) {
      toast.error("Please enter at least one valid recipient email");
      return;
    }
    try {
      await dashboardsApi.createSchedule(id, {
        frequency: scheduleFrequency,
        recipients: emails,
        is_active: true
      });
      toast.success("Scheduled report created successfully!");
      setScheduleRecipients("");
      loadSchedules();
    } catch (err) {
      toast.error("Failed to create scheduled report");
    }
  };

  const handleDeleteSchedule = async (scheduleId: string) => {
    try {
      await dashboardsApi.deleteSchedule(scheduleId);
      toast.success("Schedule deleted");
      loadSchedules();
    } catch (err) {
      toast.error("Failed to delete schedule");
    }
  };

  useEffect(() => {
    if (widgets.length > 0 && !loading) {
      const pageWidgets = widgets.filter(w => {
        const currentLayoutConfig = (dashboard?.layout_config || {}) as Record<string, any>;
        const widgetPages = currentLayoutConfig.widget_pages || {};
        const wPage = widgetPages[w.id] || "Page 1";
        return wPage === activePage;
      });
      loadWidgetData(pageWidgets, dateFrom, dateTo);
    }
  }, [activeFilters, panelFilters, activePage]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }
      const selected = widgets.find((w) => w.id === selectedWidgetId);

      if (e.key === "Delete" || e.key === "Backspace") {
        if (selected) {
          removeWidget(selected.id);
          e.preventDefault();
        }
      }

      if (e.ctrlKey && e.key.toLowerCase() === "c") {
        if (selected) {
          copyWidget(selected);
          e.preventDefault();
        }
      }

      if (e.ctrlKey && e.key.toLowerCase() === "v") {
        pasteWidget();
        e.preventDefault();
      }

      if (e.ctrlKey && e.key.toLowerCase() === "d") {
        if (selected) {
          duplicateWidget(selected);
          e.preventDefault();
        }
      }

      if (e.ctrlKey && e.key.toLowerCase() === "z") {
        undo();
        e.preventDefault();
      }

      if (e.ctrlKey && e.key.toLowerCase() === "y") {
        redo();
        e.preventDefault();
      }

      if (e.key.toLowerCase() === "v") {
        setCanvasMode("select");
      }

      if (e.key.toLowerCase() === "h") {
        setCanvasMode("pan");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [selectedWidgetId, widgets, copiedWidget, historyIndex, history]);

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === " ") {
        const target = e.target as HTMLElement;
        if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
          return;
        }
        setIsSpacePressed(true);
        e.preventDefault();
      }
    };
    
    const handleGlobalKeyUp = (e: KeyboardEvent) => {
      if (e.key === " ") {
        setIsSpacePressed(false);
      }
    };

    window.addEventListener("keydown", handleGlobalKeyDown);
    window.addEventListener("keyup", handleGlobalKeyUp);
    return () => {
      window.removeEventListener("keydown", handleGlobalKeyDown);
      window.removeEventListener("keyup", handleGlobalKeyUp);
    };
  }, []);

  const handleCanvasPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.closest(".group") || target.closest("button") || target.closest("input")) {
      return;
    }
    setSelectedWidgetId("");
    if (isSpacePressed || canvasMode === "pan") {
      setIsPanning(true);
      startPanRef.current = { x: e.clientX - panOffset.x, y: e.clientY - panOffset.y };
      e.currentTarget.setPointerCapture(e.pointerId);
    }
  };

  const handleCanvasPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (isPanning) {
      const dx = e.clientX - startPanRef.current.x;
      const dy = e.clientY - startPanRef.current.y;
      setPanOffset({ x: dx, y: dy });
    }
  };

  const handleCanvasPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (isPanning) {
      setIsPanning(false);
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };


  const daxFunctions = [
    "SUM", "CALCULATE", "FILTER", "IF", "SWITCH", "DISTINCTCOUNT", 
    "RELATED", "ALL", "COUNTROWS", "AVERAGE", "COUNT", "MIN", "MAX"
  ];
  
  const activeSuggestions = useMemo(() => {
    if (!daxSearchTerm) return [];
    return daxFunctions.filter(fn => fn.startsWith(daxSearchTerm.toUpperCase()));
  }, [daxSearchTerm]);

  const handleDaxChange = (val: string) => {
    setDraft(current => ({ ...current, dax: val }));
    const match = val.match(/([A-Za-z_]+)$/);
    if (match) {
      const term = match[1];
      setDaxSearchTerm(term);
      setShowDaxSuggestions(true);
      setSuggestionIndex(0);
    } else {
      setShowDaxSuggestions(false);
      setDaxSearchTerm("");
    }
  };

  const selectSuggestion = (suggestion: string) => {
    const val = draft.dax;
    const lastWordIdx = val.lastIndexOf(daxSearchTerm);
    if (lastWordIdx !== -1) {
      const newVal = val.slice(0, lastWordIdx) + suggestion + "(";
      setDraft(current => ({ ...current, dax: newVal }));
    }
    setShowDaxSuggestions(false);
    setDaxSearchTerm("");
  };

  const handleDaxKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showDaxSuggestions && activeSuggestions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSuggestionIndex(prev => (prev + 1) % activeSuggestions.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSuggestionIndex(prev => (prev - 1 + activeSuggestions.length) % activeSuggestions.length);
      } else if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        selectSuggestion(activeSuggestions[suggestionIndex]);
      } else if (e.key === "Escape") {
        e.preventDefault();
        setShowDaxSuggestions(false);
      }
    }
  };

  const addField = (well: FieldWell, field: string) => {
    setDraft((current) => {
      if (well === "axis") return { ...current, axis: field };
      if (well === "legend") return { ...current, legend: field };
      if (well === "smallMultiples") return { ...current, smallMultiples: field };
      if (well === "tooltips") {
        if (current.tooltips.includes(field)) return current;
        return { ...current, tooltips: [...current.tooltips, field] };
      }
      if (well === "drillThrough") {
        if (current.drillThroughFields.includes(field)) return current;
        return { ...current, drillThroughFields: [...current.drillThroughFields, field] };
      }
      if (current.values.includes(field)) return current;

      let nextAggregation = current.aggregation;
      if (selectedDataset && selectedDataset.column_types) {
        const type = selectedDataset.column_types[field]?.toUpperCase() ?? "";
        const isNumeric =
          type.includes("INT") ||
          type.includes("DOUBLE") ||
          type.includes("PRECISION") ||
          type.includes("REAL") ||
          type.includes("NUMERIC") ||
          type.includes("FLOAT") ||
          type.includes("DECIMAL");
        if (!isNumeric && (current.aggregation === "sum" || current.aggregation === "avg")) {
          nextAggregation = "count";
        }
      }

      return {
        ...current,
        values: [...current.values, field],
        aggregation: nextAggregation,
      };
    });
  };

  const removeField = (well: FieldWell, field: string) => {
    setDraft((current) => {
      if (well === "axis") return { ...current, axis: current.axis === field ? "" : current.axis };
      if (well === "legend") return { ...current, legend: current.legend === field ? "" : current.legend };
      if (well === "smallMultiples") return { ...current, smallMultiples: current.smallMultiples === field ? "" : current.smallMultiples };
      if (well === "tooltips") return { ...current, tooltips: current.tooltips.filter((item) => item !== field) };
      if (well === "drillThrough") return { ...current, drillThroughFields: current.drillThroughFields.filter((item) => item !== field) };
      return { ...current, values: current.values.filter((item) => item !== field) };
    });
  };

  const uploadDataset = async (file?: File) => {
    if (!file) return;
    setUploading(true);
    try {
      const uploaded = await datasetsApi.upload(file, undefined, id);
      toast.success(`Uploaded ${uploaded.name}`);
      const nextDatasets = await datasetsApi.list(id);
      const ready = nextDatasets.filter((dataset: Dataset) => dataset.status === "ready");
      setDatasets(ready);
      setSelectedDatasetId(uploaded.id);
      setDraft({ ...EMPTY_VISUAL, title: `${uploaded.name} visual` });
      setPreview(null);
    } catch (error) {
      const err = error as { response?: { data?: { detail?: string } }; message?: string };
      toast.error(err.response?.data?.detail || err.message || "Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const openTableView = async () => {
    setActiveView("table");
    if (!selectedDataset) {
      setTablePreview(null);
      return;
    }

    setTableLoading(true);
    try {
      const result = await datasetsApi.preview(selectedDataset.id, 200);
      setTablePreview({ columns: result.columns, rows: result.rows });
    } catch (error) {
      const err = error as { response?: { data?: { detail?: string } }; message?: string };
      toast.error(err.response?.data?.detail || err.message || "Could not load table view");
    } finally {
      setTableLoading(false);
    }
  };

  const deleteSelectedDataset = async () => {
    if (!selectedDataset) return;
    if (!confirm(`Delete dataset "${selectedDataset.name}"? Saved visuals using it may stop working.`)) return;

    await datasetsApi.delete(selectedDataset.id);
    toast.success("Dataset deleted");
    const nextDatasets = await datasetsApi.list(id);
    const ready = nextDatasets.filter((dataset: Dataset) => dataset.status === "ready");
    setDatasets(ready);
    setSelectedDatasetId(ready[0]?.id ?? "");
    setPreview(null);
    setTablePreview(null);
  };

  const updateSelectedWidget = async (changes: Partial<WidgetWithData>) => {
    if (!selectedWidget) return;
    if (lockObjects) {
      toast.error("Dashboard layout is locked. Unlock it in the 'View' tab.");
      return;
    }
    const nextWidget = { ...selectedWidget, ...changes };
    await dashboardsApi.updateWidget(id, selectedWidget.id, nextWidget as any);
    setWidgets((current) =>
      current.map((widget) => (widget.id === selectedWidget.id ? { ...widget, ...changes } : widget))
    );
    if (changes.chart_type) {
      await loadWidgetData([nextWidget], dateFrom, dateTo);
    }
  };

  // Drilldown / Drill-through helper functions
  const handleWidgetSelectCategory = async (widget: WidgetWithData, value: any) => {
    if (value === "__CLEAR__") {
      setActiveFilters((current) => {
        const next = { ...current };
        if (widget.x_key) delete next[widget.x_key];
        if (widget.chartData?.labels) {
          widget.chartData.labels.forEach(label => delete next[label]);
        }
        return next;
      });
      return;
    }
    
    if (value && typeof value === "object" && value.type === "date") {
      setActiveFilters((current) => {
        const next = { ...current };
        next[widget.x_key || ""] = {
          type: "date",
          dateRelative: {
            type: value.relativeType,
            value: value.value,
          }
        };
        return next;
      });
      return;
    }

    if (value && typeof value === "object" && value.type === "checkbox") {
      setActiveFilters((current) => {
        const next = { ...current };
        const col = widget.x_key || "";
        let existing = next[col];
        if (!existing || existing.type !== "checkbox" || !Array.isArray(existing.values)) {
          existing = { type: "checkbox", values: [] };
        }
        const val = value.value;
        if (existing.values.includes(val)) {
          existing.values = existing.values.filter((v: any) => v !== val);
        } else {
          existing.values.push(val);
        }
        if (existing.values.length === 0) {
          delete next[col];
        } else {
          next[col] = existing;
        }
        return next;
      });
      return;
    }
    
    const currentLayoutConfig = (dashboard?.layout_config || {}) as Record<string, any>;
    const settings = currentLayoutConfig.widget_settings?.[widget.id] || {};
    const drillThroughFields = settings.drillThroughFields || [];

    if (drillThroughFields.length > 0) {
      const currentPath = widgetDrillPaths[widget.id] || [];
      const currentField = currentPath.length === 0 ? (widget.x_key || "") : drillThroughFields[currentPath.length - 1];
      
      if (currentPath.length < drillThroughFields.length) {
        const nextPath = [...currentPath, { field: currentField, value }];
        setWidgetDrillPaths(prev => ({ ...prev, [widget.id]: nextPath }));
        await loadSingleWidgetDrillDown(widget, nextPath);
        return;
      }
    }
    handleSelectCategory(widget.x_key || "", value);
  };

  const loadSingleWidgetDrillDown = async (widget: WidgetWithData, path: Array<{ field: string; value: any }>) => {
    const dataset = datasets.find(d => d.id === widget.dataset_id);
    if (!dataset) return;

    setWidgets(current => current.map(item => item.id === widget.id ? { ...item, loading: true } : item));

    try {
      const currentLayoutConfig = (dashboard?.layout_config || {}) as Record<string, any>;
      const settings = currentLayoutConfig.widget_settings?.[widget.id] || {};
      const dtFields = settings.drillThroughFields || [];
      const currentAxis = path.length === 0 ? (widget.x_key || "") : dtFields[path.length - 1];

      const sql = buildSqlForWidget(
        widget.chart_type,
        widget.x_key || "",
        widget.y_keys || [],
        (widget as any).aggregation || "sum",
        (widget as any).dax || "",
        dataset.table_name,
        dtFields,
        path,
        (widget as any).tooltips || []
      );

      const data = await dataApi.chart({
        sql,
        chart_type: widget.chart_type,
        x_key: widget.chart_type === "table" || widget.chart_type === "card" ? undefined : currentAxis,
        y_keys: widget.chart_type === "table" ? undefined : widget.y_keys,
        dataset_table: dataset.table_name,
        limit: widget.chart_type === "table" ? 100 : 500,
      });

      setWidgets(current => current.map(item => item.id === widget.id ? { ...item, chartData: data, loading: false, error: undefined } : item));
    } catch (error) {
      const err = error as { response?: { data?: { detail?: string } } };
      setWidgets(current => current.map(item => item.id === widget.id ? { ...item, loading: false, error: cleanErrorMessage(err.response?.data?.detail || "Drill-down failed") } : item));
    }
  };

  const handleDrillUp = async (widget: WidgetWithData) => {
    const currentPath = widgetDrillPaths[widget.id] || [];
    if (currentPath.length === 0) return;

    const nextPath = currentPath.slice(0, -1);
    setWidgetDrillPaths(prev => ({ ...prev, [widget.id]: nextPath }));

    if (nextPath.length === 0) {
      setWidgets(current => current.map(item => item.id === widget.id ? { ...item, loading: true } : item));
      try {
        const data = await dashboardsApi.getWidgetData(id, widget.id, dateFrom || undefined, dateTo || undefined);
        setWidgets(current => current.map(item => item.id === widget.id ? { ...item, chartData: data, loading: false, error: undefined } : item));
      } catch (error) {
        setWidgets(current => current.map(item => item.id === widget.id ? { ...item, loading: false, error: "Failed to reload parent visual data" } : item));
      }
    } else {
      await loadSingleWidgetDrillDown(widget, nextPath);
    }
  };

  // Bookmarks Manager helpers
  const addBookmark = () => {
    const trimmed = bookmarkName.trim();
    if (!trimmed) return;
    if (bookmarks.some(b => b.name.toLowerCase() === trimmed.toLowerCase())) {
      toast.error("A bookmark with this name already exists");
      return;
    }
    const newBookmark = {
      name: trimmed,
      page: activePage,
      filters: activeFilters,
      theme: dashboardTheme,
      zoom: zoomPercent
    };
    setBookmarks(prev => [...prev, newBookmark]);
    setBookmarkName("");
    toast.success(`Bookmark "${trimmed}" added!`);
  };

  const applyBookmark = (bookmark: typeof bookmarks[0]) => {
    setActivePage(bookmark.page);
    setActiveFilters(bookmark.filters || {});
    setDashboardTheme(bookmark.theme || "default");
    setZoomPercent(bookmark.zoom || 100);
    toast.success(`Applied bookmark "${bookmark.name}"`);
  };

  const deleteBookmark = (bName: string) => {
    setBookmarks(prev => prev.filter(b => b.name !== bName));
    toast.success(`Deleted bookmark "${bName}"`);
  };

  const swapWidgetsLayout = async (targetWidgetId: string) => {
    if (!targetWidgetId) return;
    const targetWidget = widgets.find((w) => w.id === targetWidgetId);
    if (!selectedWidget || !targetWidget) return;
    if (lockObjects) {
      toast.error("Dashboard layout is locked. Unlock it in the 'View' tab.");
      return;
    }
    
    const selLayout = {
      position_x: selectedWidget.position_x,
      position_y: selectedWidget.position_y,
      width: selectedWidget.width,
      height: selectedWidget.height,
    };
    
    const tgtLayout = {
      position_x: targetWidget.position_x,
      position_y: targetWidget.position_y,
      width: targetWidget.width,
      height: targetWidget.height,
    };

    try {
      setWidgets((current) =>
        current.map((widget) => {
          if (widget.id === selectedWidget.id) {
            return { ...widget, ...tgtLayout };
          }
          if (widget.id === targetWidget.id) {
            return { ...widget, ...selLayout };
          }
          return widget;
        })
      );
      
      await Promise.all([
        dashboardsApi.updateWidget(id, selectedWidget.id, { ...selectedWidget, ...tgtLayout }),
        dashboardsApi.updateWidget(id, targetWidget.id, { ...targetWidget, ...selLayout }),
      ]);
      
      toast.success(`Exchanged positions between "${selectedWidget.title || 'Selected visual'}" and "${targetWidget.title || 'Target visual'}"`);
    } catch (error) {
      toast.error("Failed to exchange positions");
      load();
    }
  };
  const undo = () => {
    if (historyIndex > 0) {
      const prevIndex = historyIndex - 1;
      const prevWidgets = history[prevIndex];
      setWidgets(prevWidgets);
      setHistoryIndex(prevIndex);
      dashboardsApi.updateLayout(id, prevWidgets.map(w => ({
        id: w.id,
        position_x: w.position_x,
        position_y: w.position_y,
        width: w.width,
        height: w.height
      }))).catch(() => {});
      toast.success("Undo layout");
    } else {
      toast.error("Nothing to undo");
    }
  };

  const redo = () => {
    if (historyIndex < history.length - 1) {
      const nextIndex = historyIndex + 1;
      const nextWidgets = history[nextIndex];
      setWidgets(nextWidgets);
      setHistoryIndex(nextIndex);
      dashboardsApi.updateLayout(id, nextWidgets.map(w => ({
        id: w.id,
        position_x: w.position_x,
        position_y: w.position_y,
        width: w.width,
        height: w.height
      }))).catch(() => {});
      toast.success("Redo layout");
    } else {
      toast.error("Nothing to redo");
    }
  };

  const copyWidget = (widget: WidgetWithData) => {
    setCopiedWidget(widget);
    toast.success("Visual copied");
  };

  const pasteWidget = async () => {
    if (!copiedWidget) return;
    const newWidget = {
      title: `${copiedWidget.title} (Copy)`,
      chart_type: copiedWidget.chart_type,
      query_sql: copiedWidget.query_sql,
      query_nl: copiedWidget.query_nl,
      x_key: copiedWidget.x_key,
      y_keys: copiedWidget.y_keys,
      position_x: Math.min(8, copiedWidget.position_x + 1),
      position_y: copiedWidget.position_y + 1,
      width: copiedWidget.width,
      height: copiedWidget.height,
      refresh_interval_s: copiedWidget.refresh_interval_s,
      date_filter_enabled: copiedWidget.date_filter_enabled,
      dataset_id: copiedWidget.dataset_id,
    };
    try {
      const res = await dashboardsApi.addWidget(id, newWidget);
      const created = { ...newWidget, id: res.id, loading: false } as WidgetWithData;
      
      // Update layout config to associate this pasted widget with the active page
      const currentLayoutConfig = (dashboard?.layout_config || {}) as Record<string, any>;
      const widgetPages = { ...(currentLayoutConfig.widget_pages || {}) };
      widgetPages[res.id] = activePage;
      const updatedConfig = { ...currentLayoutConfig, widget_pages: widgetPages };
      
      await dashboardsApi.update(id, { layout_config: updatedConfig });
      setDashboard((prev: any) => prev ? { ...prev, layout_config: updatedConfig } : prev);
      
      const nextWidgets = [...widgets, created];
      setWidgets(nextWidgets);
      pushToHistory(nextWidgets);
      toast.success("Visual pasted");
    } catch {
      toast.error("Failed to paste visual");
    }
  };

  const duplicateWidget = async (widget: WidgetWithData) => {
    const newWidget = {
      title: `${widget.title} (Copy)`,
      chart_type: widget.chart_type,
      query_sql: widget.query_sql,
      query_nl: widget.query_nl,
      x_key: widget.x_key,
      y_keys: widget.y_keys,
      position_x: Math.min(8, widget.position_x + 1),
      position_y: widget.position_y + 1,
      width: widget.width,
      height: widget.height,
      refresh_interval_s: widget.refresh_interval_s,
      date_filter_enabled: widget.date_filter_enabled,
      dataset_id: widget.dataset_id,
    };
    try {
      const res = await dashboardsApi.addWidget(id, newWidget);
      const created = { ...newWidget, id: res.id, loading: false } as WidgetWithData;
      
      // Update layout config to associate this duplicated widget with the active page
      const currentLayoutConfig = (dashboard?.layout_config || {}) as Record<string, any>;
      const widgetPages = { ...(currentLayoutConfig.widget_pages || {}) };
      widgetPages[res.id] = activePage;
      const updatedConfig = { ...currentLayoutConfig, widget_pages: widgetPages };
      
      await dashboardsApi.update(id, { layout_config: updatedConfig });
      setDashboard((prev: any) => prev ? { ...prev, layout_config: updatedConfig } : prev);
      
      const nextWidgets = [...widgets, created];
      setWidgets(nextWidgets);
      pushToHistory(nextWidgets);
      toast.success("Visual duplicated");
    } catch {
      toast.error("Failed to duplicate visual");
    }
  };

  const handleSelectCategory = (xKey: string, value: any) => {
    if (value === "__CLEAR__") {
      setActiveFilters({});
      return;
    }
    setActiveFilters((current) => {
      const next = { ...current };
      if (next[value]) {
        delete next[value];
      } else {
        next[value] = true;
      }
      return next;
    });
  };
  const adjustLayering = async (widget: WidgetWithData, action: "forward" | "backward") => {
    const currentZ = (widget as any).z_index || 10;
    const nextZ = action === "forward" ? currentZ + 5 : Math.max(1, currentZ - 5);
    
    // Save in dashboard's layout_config
    const currentLayoutConfig = (dashboard?.layout_config || {}) as Record<string, any>;
    const zIndices = { ...(currentLayoutConfig.widget_z_indices || {}) } as Record<string, number>;
    zIndices[widget.id] = nextZ;
    const updatedConfig = { ...currentLayoutConfig, widget_z_indices: zIndices };
    
    try {
      await dashboardsApi.update(id, { layout_config: updatedConfig });
      setDashboard((prev: any) => prev ? { ...prev, layout_config: updatedConfig } : prev);
      setWidgets((prev) => prev.map((w) => (w.id === widget.id ? { ...w, z_index: nextZ } : w)));
      toast.success(`Layer adjusted ${action === "forward" ? "forward" : "backward"}`);
    } catch {
      toast.error("Failed to adjust layering");
    }
  };

  const startWidgetPointer = (
    widget: WidgetWithData,
    event: ReactPointerEvent<HTMLElement>,
    mode: "move" | "resize-n" | "resize-s" | "resize-e" | "resize-w" | "resize-nw" | "resize-ne" | "resize-sw" | "resize-se"
  ) => {
    event.preventDefault();
    event.stopPropagation();
    setSelectedWidgetId(widget.id);

    if (lockObjects) return;
    const isPageLocked = lockedPages.includes(activePage);
    if (isPageLocked) return;
    if (isSpacePressed || canvasMode === "pan") return;

    const startX = event.clientX;
    const startY = event.clientY;
    const start = {
      position_x: widget.position_x,
      position_y: widget.position_y,
      width: widget.width,
      height: widget.height,
    };
    let latest = { ...start };
    const minWidth = widget.chart_type === "card" ? 2 : 3;
    const minHeight = widget.chart_type === "card" ? 2 : 3;
    const canvasColumns = Math.max(1, activePageFormatting.canvasSettings.width / 96);
    const canvasRows = Math.max(1, activePageFormatting.canvasSettings.height / 72);

    const constrainToCanvas = (layout: typeof start) => {
      const width = Math.min(Math.max(minWidth, layout.width), canvasColumns);
      const height = Math.min(Math.max(minHeight, layout.height), canvasRows);
      const position_x = Math.min(Math.max(0, layout.position_x), Math.max(0, canvasColumns - width));
      const position_y = Math.min(Math.max(0, layout.position_y), Math.max(0, canvasRows - height));
      return {
        position_x: Number(position_x.toFixed(2)),
        position_y: Number(position_y.toFixed(2)),
        width: Number(width.toFixed(2)),
        height: Number(height.toFixed(2)),
      };
    };

    const onMove = (pointerEvent: PointerEvent) => {
      const scale = zoomPercent / 100;
      const dx = (pointerEvent.clientX - startX) / scale;
      const dy = (pointerEvent.clientY - startY) / scale;
      
      const gridXUnit = 96;
      const gridYUnit = 72;

      if (mode === "move") {
        const cellX = start.position_x + (dx / gridXUnit);
        const cellY = start.position_y + (dy / gridYUnit);
        latest = {
          ...start,
          position_x: Math.max(0, snapToGrid ? Math.round(cellX) : Number(cellX.toFixed(1))),
          position_y: Math.max(0, snapToGrid ? Math.round(cellY) : Number(cellY.toFixed(1))),
        };
      } else if (mode === "resize-e") {
        const cellW = start.width + (dx / gridXUnit);
        latest = {
          ...start,
          width: Math.max(minWidth, snapToGrid ? Math.round(cellW) : Number(cellW.toFixed(1))),
        };
      } else if (mode === "resize-s") {
        const cellH = start.height + (dy / gridYUnit);
        latest = {
          ...start,
          height: Math.max(minHeight, snapToGrid ? Math.round(cellH) : Number(cellH.toFixed(1))),
        };
      } else if (mode === "resize-w") {
        const cellW = start.width - (dx / gridXUnit);
        const clampedW = Math.max(minWidth, snapToGrid ? Math.round(cellW) : Number(cellW.toFixed(1)));
        latest = {
          ...start,
          width: clampedW,
          position_x: Math.max(0, start.position_x + start.width - clampedW),
        };
      } else if (mode === "resize-n") {
        const cellH = start.height - (dy / gridYUnit);
        const clampedH = Math.max(minHeight, snapToGrid ? Math.round(cellH) : Number(cellH.toFixed(1)));
        latest = {
          ...start,
          height: clampedH,
          position_y: Math.max(0, start.position_y + start.height - clampedH),
        };
      } else if (mode === "resize-nw") {
        const cellW = start.width - (dx / gridXUnit);
        const clampedW = Math.max(minWidth, snapToGrid ? Math.round(cellW) : Number(cellW.toFixed(1)));
        const cellH = start.height - (dy / gridYUnit);
        const clampedH = Math.max(minHeight, snapToGrid ? Math.round(cellH) : Number(cellH.toFixed(1)));
        latest = {
          width: clampedW,
          height: clampedH,
          position_x: Math.max(0, start.position_x + start.width - clampedW),
          position_y: Math.max(0, start.position_y + start.height - clampedH),
        };
      } else if (mode === "resize-ne") {
        const cellW = start.width + (dx / gridXUnit);
        const clampedW = Math.max(minWidth, snapToGrid ? Math.round(cellW) : Number(cellW.toFixed(1)));
        const cellH = start.height - (dy / gridYUnit);
        const clampedH = Math.max(minHeight, snapToGrid ? Math.round(cellH) : Number(cellH.toFixed(1)));
        latest = {
          width: clampedW,
          height: clampedH,
          position_x: start.position_x,
          position_y: Math.max(0, start.position_y + start.height - clampedH),
        };
      } else if (mode === "resize-sw") {
        const cellW = start.width - (dx / gridXUnit);
        const clampedW = Math.max(minWidth, snapToGrid ? Math.round(cellW) : Number(cellW.toFixed(1)));
        const cellH = start.height + (dy / gridYUnit);
        const clampedH = Math.max(minHeight, snapToGrid ? Math.round(cellH) : Number(cellH.toFixed(1)));
        latest = {
          width: clampedW,
          height: clampedH,
          position_x: Math.max(0, start.position_x + start.width - clampedW),
          position_y: start.position_y,
        };
      } else if (mode === "resize-se") {
        const cellW = start.width + (dx / gridXUnit);
        const clampedW = Math.max(minWidth, snapToGrid ? Math.round(cellW) : Number(cellW.toFixed(1)));
        const cellH = start.height + (dy / gridYUnit);
        const clampedH = Math.max(minHeight, snapToGrid ? Math.round(cellH) : Number(cellH.toFixed(1)));
        latest = {
          width: clampedW,
          height: clampedH,
          position_x: start.position_x,
          position_y: start.position_y,
        };
      }

      latest = constrainToCanvas(latest);

      // Calculate alignment guides against other widgets
      let guideX: number | null = null;
      let guideY: number | null = null;
      const otherWidgets = widgets.filter((w) => w.id !== widget.id);
      
      const currentLayoutConfig = (dashboard?.layout_config || {}) as Record<string, any>;
      const widgetPages = (currentLayoutConfig.widget_pages || {}) as Record<string, string>;

      for (const o of otherWidgets) {
        const wp = widgetPages[o.id] || "Page 1";
        if (wp !== activePage) continue;

        if (Math.abs(latest.position_x - o.position_x) < 0.2) {
          guideX = o.position_x;
        } else if (Math.abs((latest.position_x + latest.width) - (o.position_x + o.width)) < 0.2) {
          guideX = o.position_x + o.width;
        } else if (Math.abs(latest.position_x - (o.position_x + o.width)) < 0.2) {
          guideX = o.position_x + o.width;
        } else if (Math.abs((latest.position_x + latest.width) - o.position_x) < 0.2) {
          guideX = o.position_x;
        }

        if (Math.abs(latest.position_y - o.position_y) < 0.2) {
          guideY = o.position_y;
        } else if (Math.abs((latest.position_y + latest.height) - (o.position_y + o.height)) < 0.2) {
          guideY = o.position_y + o.height;
        } else if (Math.abs(latest.position_y - (o.position_y + o.height)) < 0.2) {
          guideY = o.position_y + o.height;
        } else if (Math.abs((latest.position_y + latest.height) - o.position_y) < 0.2) {
          guideY = o.position_y;
        }
      }
      setAlignX(guideX);
      setAlignY(guideY);

      // Spacing Indicators logic
      const indicators: SpacingIndicator[] = [];
      for (const o of otherWidgets) {
        const wp = widgetPages[o.id] || "Page 1";
        if (wp !== activePage) continue;

        const overlapY = Math.max(0, Math.min(latest.position_y + latest.height, o.position_y + o.height) - Math.max(latest.position_y, o.position_y));
        if (overlapY > 0.5) {
          if (latest.position_x + latest.width < o.position_x) {
            const gap = o.position_x - (latest.position_x + latest.width);
            if (gap > 0 && gap < 2.0) {
              indicators.push({
                x: (latest.position_x + latest.width) * 96,
                y: (Math.max(latest.position_y, o.position_y) + overlapY / 2) * 72,
                width: gap * 96,
                value: `${Math.round(gap * 96)}px`,
              });
            }
          } else if (o.position_x + o.width < latest.position_x) {
            const gap = latest.position_x - (o.position_x + o.width);
            if (gap > 0 && gap < 2.0) {
              indicators.push({
                x: (o.position_x + o.width) * 96,
                y: (Math.max(latest.position_y, o.position_y) + overlapY / 2) * 72,
                width: gap * 96,
                value: `${Math.round(gap * 96)}px`,
              });
            }
          }
        }

        const overlapX = Math.max(0, Math.min(latest.position_x + latest.width, o.position_x + o.width) - Math.max(latest.position_x, o.position_x));
        if (overlapX > 0.5) {
          if (latest.position_y + latest.height < o.position_y) {
            const gap = o.position_y - (latest.position_y + latest.height);
            if (gap > 0 && gap < 2.0) {
              indicators.push({
                x: (Math.max(latest.position_x, o.position_x) + overlapX / 2) * 96,
                y: (latest.position_y + latest.height) * 72,
                height: gap * 72,
                value: `${Math.round(gap * 72)}px`,
              });
            }
          } else if (o.position_y + o.height < latest.position_y) {
            const gap = latest.position_y - (o.position_y + o.height);
            if (gap > 0 && gap < 2.0) {
              indicators.push({
                x: (Math.max(latest.position_x, o.position_x) + overlapX / 2) * 96,
                y: (o.position_y + o.height) * 72,
                height: gap * 72,
                value: `${Math.round(gap * 72)}px`,
              });
            }
          }
        }
      }
      setSpacingIndicators(indicators);

      setWidgets((current) => current.map((item) => (item.id === widget.id ? { ...item, ...latest } : item)));
    };

    const onUp = async () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      setAlignX(null);
      setAlignY(null);
      setSpacingIndicators([]);
      
      const savedWidgets = widgets.map((item) => (item.id === widget.id ? { ...item, ...latest } : item));
      pushToHistory(savedWidgets);
      await dashboardsApi.updateWidget(id, widget.id, { ...widget, ...latest });
    };

    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  };


  const refreshPreview = async () => {
    setPreviewError("");
    if (!selectedDataset) {
      setPreview(null);
      setPreviewError("Upload or select a dataset first");
      return;
    }
    if (!canPreview || !generatedSql) {
      setPreview(null);
      setPreviewError("Choose fields for the selected visual");
      return;
    }

    setRefreshing(true);
    try {
      const data = await dataApi.chart({
        sql: generatedSql,
        chart_type: draft.chart_type,
        ...getWidgetMapping(draft, chartYKeys),
        dataset_table: selectedDataset.table_name,
        limit: draft.chart_type === "table" ? 100 : 500,
      });
      setPreview(data);
    } catch (error) {
      const err = error as { response?: { data?: { detail?: string } }; message?: string };
      setPreview(null);
      setPreviewError(cleanErrorMessage(err.response?.data?.detail || err.message || "Could not build visual"));
    } finally {
      setRefreshing(false);
    }
  };

  const saveVisual = async () => {
    if (!dashboard || !selectedDataset) return;
    if (!generatedSql || !canPreview) {
      toast.error("Choose a dataset and fields before saving");
      return;
    }

    setSaving(true);
    try {
      const res = await dashboardsApi.addWidget(id, {
        title: draft.title.trim() || `${draft.chart_type} visual`,
        chart_type: draft.chart_type,
        query_sql: generatedSql,
        ...getWidgetMapping(draft, chartYKeys),
        position_x: 0,
        position_y: widgets.length,
        width: 6,
        height: 4,
        date_filter_enabled: draft.date_filter_enabled,
        dataset_id: selectedDataset.id,
      });

      // Update layout config to associate this widget with the active page AND save its custom settings!
      const currentLayoutConfig = (dashboard?.layout_config || {}) as Record<string, any>;
      const widgetPages = { ...(currentLayoutConfig.widget_pages || {}) };
      widgetPages[res.id] = activePage;
      
      const widgetSettings = { ...(currentLayoutConfig.widget_settings || {}) };
      widgetSettings[res.id] = {
        drillThroughFields: draft.drillThroughFields,
        dax: draft.dax,
        aggregation: draft.aggregation,
        tooltips: draft.tooltips,
        smallMultiples: draft.smallMultiples
      };
      
      const updatedConfig = { ...currentLayoutConfig, widget_pages: widgetPages, widget_settings: widgetSettings };

      await dashboardsApi.update(id, { layout_config: updatedConfig });
      setDashboard((prev: any) => prev ? { ...prev, layout_config: updatedConfig } : prev);

      toast.success("Visual added to dashboard");
      setDraft({ ...EMPTY_VISUAL });
      setPreview(null);
      await load();
    } finally {
      setSaving(false);
    }
  };

  const removeWidget = async (widgetId: string) => {
    if (!confirm("Remove this visual?")) return;
    await dashboardsApi.deleteWidget(id, widgetId);
    setWidgets((current) => current.filter((widget) => widget.id !== widgetId));
  };

  const refreshWithDates = async (from: string, to: string) => {
    setDateFrom(from);
    setDateTo(to);
    const activeWidgets = widgets.map((widget) => ({ ...widget, loading: widget.date_filter_enabled }));
    setWidgets(activeWidgets);
    await loadWidgetData(
      activeWidgets.filter((widget) => widget.date_filter_enabled),
      from,
      to
    );
  };

  const handleUseSampleData = async () => {
    // Select first dataset if exists
    if (datasets.length > 0) {
      setSelectedDatasetId(datasets[0].id);
      toast.success(`Loaded sample dataset: ${datasets[0].name}`);
    } else {
      toast.error("Please upload a CSV or Excel file to get started!");
    }
  };

  const addPage = async () => {
    const newPageName = `Page ${pages.length + 1}`;
    const updatedPages = [...pages, newPageName];
    setPages(updatedPages);
    setActivePage(newPageName);
    toast.success(`${newPageName} created`);

    // Update layout config page list
    const currentLayoutConfig = (dashboard?.layout_config || {}) as Record<string, any>;
    const updatedConfig = { ...currentLayoutConfig, pages: updatedPages };
    try {
      await dashboardsApi.update(id, { layout_config: updatedConfig });
      setDashboard((prev: any) => prev ? { ...prev, layout_config: updatedConfig } : prev);
    } catch {
      toast.error("Failed to save new page structure to workspace");
    }
  };

  const renamePage = async (oldName: string, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed || trimmed === oldName) return;
    
    if (pages.includes(trimmed)) {
      toast.error("A page with this name already exists");
      return;
    }
    
    const updatedPages = pages.map(p => p === oldName ? trimmed : p);
    setPages(updatedPages);
    if (activePage === oldName) {
      setActivePage(trimmed);
    }
    
    const currentLayoutConfig = (dashboard?.layout_config || {}) as Record<string, any>;
    const updatedPagesList = currentLayoutConfig.pages || [];
    const nextPagesList = updatedPagesList.map((p: string) => p === oldName ? trimmed : p);
    
    const widgetPages = { ...(currentLayoutConfig.widget_pages || {}) };
    Object.keys(widgetPages).forEach(wId => {
      if (widgetPages[wId] === oldName) {
        widgetPages[wId] = trimmed;
      }
    });

    const nextFilters = panelFilters.map(f => {
      if (f.level === "page" && f.pageName === oldName) {
        return { ...f, pageName: trimmed };
      }
      return f;
    });
    setPanelFilters(nextFilters);
    
    const pageFormatting = { ...(currentLayoutConfig.page_formatting || {}) };
    if (pageFormatting[oldName]) {
      pageFormatting[trimmed] = {
        ...pageFormatting[oldName],
        pageName: trimmed
      };
      delete pageFormatting[oldName];
    }
    
    const updatedConfig = { 
      ...currentLayoutConfig, 
      pages: nextPagesList, 
      widget_pages: widgetPages, 
      panel_filters: nextFilters,
      page_formatting: pageFormatting
    };
    try {
      await dashboardsApi.update(id, { layout_config: updatedConfig });
      setDashboard((prev: any) => prev ? { ...prev, layout_config: updatedConfig } : prev);
      toast.success(`Renamed page to ${trimmed}`);
    } catch {
      toast.error("Failed to save renamed page");
    }
  };

  const deletePage = async (pageName: string) => {
    if (pages.length <= 1) {
      toast.error("A dashboard must have at least one page");
      return;
    }
    if (!confirm(`Are you sure you want to delete "${pageName}"?`)) return;
    
    const updatedPages = pages.filter(p => p !== pageName);
    setPages(updatedPages);
    if (activePage === pageName) {
      setActivePage(updatedPages[0]);
    }
    
    const currentLayoutConfig = (dashboard?.layout_config || {}) as Record<string, any>;
    const widgetPages = { ...(currentLayoutConfig.widget_pages || {}) };
    
    Object.keys(widgetPages).forEach(wId => {
      if (widgetPages[wId] === pageName) {
        delete widgetPages[wId];
      }
    });

    const nextFilters = panelFilters.filter(f => {
      if (f.level === "page" && f.pageName === pageName) return false;
      const isWidgetOnDeletedPage = widgets.some(w => {
        const wp = widgetPages[w.id] || "Page 1";
        return wp === pageName && f.targetWidgetId === w.id;
      });
      if (f.level === "visual" && isWidgetOnDeletedPage) return false;
      return true;
    });
    setPanelFilters(nextFilters);
    
    const pageFormatting = { ...(currentLayoutConfig.page_formatting || {}) };
    if (pageFormatting[pageName]) {
      delete pageFormatting[pageName];
    }

    const updatedConfig = { 
      ...currentLayoutConfig, 
      pages: updatedPages, 
      widget_pages: widgetPages, 
      panel_filters: nextFilters,
      page_formatting: pageFormatting
    };
    try {
      await dashboardsApi.update(id, { layout_config: updatedConfig });
      setDashboard((prev: any) => prev ? { ...prev, layout_config: updatedConfig } : prev);
      toast.success(`Deleted page ${pageName}`);
    } catch {
      toast.error("Failed to save layout configuration");
    }
  };

  const reorderPages = async (draggedName: string, targetName: string) => {
    if (draggedName === targetName) return;
    const draggedIdx = pages.indexOf(draggedName);
    const targetIdx = pages.indexOf(targetName);
    if (draggedIdx === -1 || targetIdx === -1) return;
    
    const updatedPages = [...pages];
    updatedPages.splice(draggedIdx, 1);
    updatedPages.splice(targetIdx, 0, draggedName);
    
    setPages(updatedPages);
    
    const currentLayoutConfig = (dashboard?.layout_config || {}) as Record<string, any>;
    const updatedConfig = { ...currentLayoutConfig, pages: updatedPages };
    try {
      await dashboardsApi.update(id, { layout_config: updatedConfig });
      setDashboard((prev: any) => prev ? { ...prev, layout_config: updatedConfig } : prev);
      toast.success("Page tabs reordered");
    } catch {
      toast.error("Failed to save page tab order");
    }
  };

  const duplicatePage = async (pageName: string) => {
    const newPageName = `${pageName} - Copy`;
    let uniqueName = newPageName;
    let counter = 1;
    while (pages.includes(uniqueName)) {
      uniqueName = `${pageName} - Copy ${counter++}`;
    }
    
    // Add page
    const updatedPages = [...pages, uniqueName];
    setPages(updatedPages);
    setActivePage(uniqueName);
    
    const currentLayoutConfig = (dashboard?.layout_config || {}) as Record<string, any>;
    const widgetPages = { ...(currentLayoutConfig.widget_pages || {}) };
    const widgetZIndices = { ...(currentLayoutConfig.widget_z_indices || {}) };
    
    const pageWidgets = widgets.filter((w) => {
      const wp = widgetPages[w.id] || "Page 1";
      return wp === pageName;
    });

    const duplicatedWidgets: WidgetWithData[] = [];
    const newWidgetPromises = pageWidgets.map(async (w) => {
      const newWidget = {
        title: w.title,
        chart_type: w.chart_type,
        query_sql: w.query_sql,
        x_key: w.x_key,
        y_keys: w.y_keys,
        position_x: w.position_x,
        position_y: w.position_y,
        width: w.width,
        height: w.height,
        dataset_id: w.dataset_id,
        date_filter_enabled: w.date_filter_enabled,
      };
      
      const res = await dashboardsApi.addWidget(id, newWidget);
      widgetPages[res.id] = uniqueName;
      if (widgetZIndices[w.id]) {
        widgetZIndices[res.id] = widgetZIndices[w.id];
      }
      
      const currentWidgetSettings = currentLayoutConfig.widget_settings?.[w.id] || {};
      return {
        ...res,
        loading: true,
        chart_type: res.chart_type as ChartType,
        ...currentWidgetSettings
      };
    });

    try {
      const newWidgets = await Promise.all(newWidgetPromises);
      
      const nextWidgetSettings = { ...(currentLayoutConfig.widget_settings || {}) };
      newWidgets.forEach((nw, index) => {
        const origW = pageWidgets[index];
        nextWidgetSettings[nw.id] = currentLayoutConfig.widget_settings?.[origW.id] || {};
      });

      // Duplicate page-level filters
      const duplicatedFilters = panelFilters
        .filter(f => f.level === "page" && f.pageName === pageName)
        .map(f => ({
          ...f,
          id: Math.random().toString(36).substr(2, 9),
          pageName: uniqueName
        }));
      const nextPanelFilters = [...panelFilters, ...duplicatedFilters];
      setPanelFilters(nextPanelFilters);

      // Duplicate page formatting settings
      const pageFormatting = { ...(currentLayoutConfig.page_formatting || {}) };
      if (pageFormatting[pageName]) {
        pageFormatting[uniqueName] = {
          ...pageFormatting[pageName],
          pageName: uniqueName
        };
      }

      const updatedConfig = { 
        ...currentLayoutConfig, 
        pages: updatedPages, 
        widget_pages: widgetPages, 
        widget_z_indices: widgetZIndices,
        widget_settings: nextWidgetSettings,
        panel_filters: nextPanelFilters,
        page_formatting: pageFormatting
      };
      
      await dashboardsApi.update(id, { layout_config: updatedConfig });
      setDashboard((prev: any) => prev ? { ...prev, layout_config: updatedConfig } : prev);
      setWidgets((current) => [...current, ...newWidgets]);
      
      await loadWidgetData(newWidgets, dateFrom, dateTo);
      toast.success(`Duplicated page to ${uniqueName}`);
    } catch (err) {
      console.error("Duplicate page failed:", err);
      toast.error("Failed to duplicate page widgets");
    }
  };

  const toggleLockPage = async (pageName: string) => {
    const isLocked = lockedPages.includes(pageName);
    const nextLocked = isLocked ? lockedPages.filter(p => p !== pageName) : [...lockedPages, pageName];
    setLockedPages(nextLocked);
    
    const currentLayoutConfig = (dashboard?.layout_config || {}) as Record<string, any>;
    const updatedConfig = { ...currentLayoutConfig, locked_pages: nextLocked };
    try {
      await dashboardsApi.update(id, { layout_config: updatedConfig });
      setDashboard((prev: any) => prev ? { ...prev, layout_config: updatedConfig } : prev);
      toast.success(isLocked ? `Unlocked ${pageName}` : `Locked ${pageName}`);
    } catch {
      toast.error("Failed to save page lock status");
    }
  };

  const toggleHidePage = async (pageName: string) => {
    const isHidden = hiddenPages.includes(pageName);
    const nextHidden = isHidden ? hiddenPages.filter(p => p !== pageName) : [...hiddenPages, pageName];
    setHiddenPages(nextHidden);
    
    const currentLayoutConfig = (dashboard?.layout_config || {}) as Record<string, any>;
    const updatedConfig = { ...currentLayoutConfig, hidden_pages: nextHidden };
    try {
      await dashboardsApi.update(id, { layout_config: updatedConfig });
      setDashboard((prev: any) => prev ? { ...prev, layout_config: updatedConfig } : prev);
      toast.success(isHidden ? `Unhid ${pageName}` : `Hid ${pageName}`);
    } catch {
      toast.error("Failed to save page visibility status");
    }
  };

  const exportLayoutJson = () => {
    if (!dashboard) return;
    const configData = {
      layout_config: dashboard.layout_config,
      widgets: widgets.map(w => ({
        title: w.title,
        chart_type: w.chart_type,
        query_sql: w.query_sql,
        query_nl: w.query_nl,
        x_key: w.x_key,
        y_keys: w.y_keys,
        position_x: w.position_x,
        position_y: w.position_y,
        width: w.width,
        height: w.height,
        refresh_interval_s: w.refresh_interval_s,
        date_filter_enabled: w.date_filter_enabled,
        dataset_id: w.dataset_id
      }))
    };
    const blob = new Blob([JSON.stringify(configData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${dashboard.title.replace(/\s+/g, "_")}_layout.json`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success("Dashboard layout config exported to JSON!");
  };

  const handleExportExcel = async () => {
    if (!id) return;
    const toastId = toast.loading("Generating Excel export...");
    try {
      const blob = await dashboardsApi.exportExcel(id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${dashboard?.title.replace(/\s+/g, "_") || "dashboard"}_data.xlsx`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success("Excel export downloaded successfully!", { id: toastId });
    } catch (err: any) {
      console.error(err);
      toast.error("Failed to generate Excel export.", { id: toastId });
    }
  };

  const handleExportDocx = async () => {
    if (!id) return;
    const toastId = toast.loading("Generating Word document export...");
    try {
      const blob = await dashboardsApi.exportDocx(id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${dashboard?.title.replace(/\s+/g, "_") || "dashboard"}_report.docx`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success("Word document downloaded successfully!", { id: toastId });
    } catch (err: any) {
      console.error(err);
      toast.error("Failed to generate Word document.", { id: toastId });
    }
  };

  const handleExportPptx = async () => {
    if (!id) return;
    const toastId = toast.loading("Generating PowerPoint export...");
    try {
      const blob = await dashboardsApi.exportPptx(id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${dashboard?.title.replace(/\s+/g, "_") || "dashboard"}_presentation.pptx`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success("PowerPoint presentation downloaded successfully!", { id: toastId });
    } catch (err: any) {
      console.error(err);
      toast.error("Failed to generate PowerPoint export.", { id: toastId });
    }
  };

  const importLayoutJson = async (file: File) => {
    try {
      const text = await file.text();
      const configData = JSON.parse(text);
      if (!configData.widgets || !Array.isArray(configData.widgets)) {
        toast.error("Invalid layout JSON format");
        return;
      }
      
      // Update layout config
      const layout_config = configData.layout_config || {};
      await dashboardsApi.update(id, { layout_config });
      
      // Remove all current widgets
      await Promise.all(widgets.map(w => dashboardsApi.deleteWidget(id, w.id)));
      
      // Add all new widgets
      for (const w of configData.widgets) {
        await dashboardsApi.addWidget(id, w);
      }
      
      toast.success("Dashboard layout config imported successfully!");
      load();
    } catch {
      toast.error("Failed to import layout JSON");
    }
  };

  const exportWidgetCSV = (widget: WidgetWithData) => {
    if (!widget.chartData) {
      toast.error("No data available to export");
      return;
    }
    const data = widget.chartData;
    const { chart_type, labels, series, columns } = data;
    
    let csvContent = "";
    
    if (chart_type === "table") {
      const rows = series as unknown as Record<string, unknown>[];
      if (!rows || rows.length === 0) {
        toast.error("No data in table to export");
        return;
      }
      // Header row
      csvContent += columns.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",") + "\n";
      // Data rows
      rows.forEach(row => {
        csvContent += columns.map(c => `"${String(row[c] ?? "").replace(/"/g, '""')}"`).join(",") + "\n";
      });
    } else if (chart_type === "card") {
      const first = series[0];
      const value = first?.value ?? first?.data?.[0] ?? 0;
      csvContent += `"Metric","Value"\n"${String(first?.name || widget.title).replace(/"/g, '""')}",${value}\n`;
    } else {
      // Bar, line, area, pie, donut, scatter, etc.
      // Header row: X Axis Name, Series 1 Name, Series 2 Name, ...
      const header = [data.x_key || "Category", ...series.map(s => s.name)];
      csvContent += header.map(h => `"${String(h).replace(/"/g, '""')}"`).join(",") + "\n";
      
      // Data rows
      labels.forEach((label, idx) => {
        const row = [
          label,
          ...series.map(s => s.data?.[idx] ?? s.value ?? "")
        ];
        csvContent += row.map(r => `"${String(r).replace(/"/g, '""')}"`).join(",") + "\n";
      });
    }
    
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${(widget.title || "export").replace(/\s+/g, "_")}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success("Data exported to CSV!");
  };

  if (loading) {
    return (
      <div className="flex h-[calc(100vh-3.5rem)] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!dashboard) return <div className="p-6 text-muted-foreground">Dashboard not found.</div>;

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col bg-[#f0f2f5] text-slate-900 select-none relative">
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,.xlsx,.xls"
        className="hidden"
        onChange={(event) => uploadDataset(event.target.files?.[0])}
      />
      <input
        ref={jsonInputRef}
        type="file"
        accept=".json"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) importLayoutJson(file);
        }}
      />
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          body, html {
            background: white !important;
            color: black !important;
            margin: 0 !important;
            padding: 0 !important;
            height: auto !important;
            overflow: visible !important;
          }
          header, footer, aside, nav, button, input, select, textarea,
          .border-b, .border-l, .border-r, .shadow-sm, .shadow-xl, .shadow-inner,
          [role="button"], .flex-shrink-0, .z-30, .z-20, .relative.overflow-hidden {
            display: none !important;
          }
          main {
            padding: 0 !important;
            margin: 0 !important;
            background: white !important;
            width: 100% !important;
            max-width: 100% !important;
            box-shadow: none !important;
            border: none !important;
            overflow: visible !important;
            display: block !important;
            position: static !important;
          }
          .max-w-\\[1280px\\] {
            width: 100% !important;
            max-width: 100% !important;
            min-height: 0 !important;
            border: none !important;
            box-shadow: none !important;
            transform: none !important;
            margin: 0 !important;
            padding: 0 !important;
            display: block !important;
          }
          .grid {
            display: grid !important;
            grid-template-columns: repeat(12, 1fr) !important;
            gap: 16px !important;
            page-break-inside: avoid !important;
          }
        }
      ` }} />

      {/* Power BI Styled Tabbed Ribbon Header */}
      <div className="border-b border-slate-300 bg-white shadow-sm flex-shrink-0 z-30">
        <div className="flex h-9 items-center gap-1 px-4 bg-slate-50 border-b border-slate-200 text-xs">
          {/* File Menu with dropdown */}
          <div className="relative">
            <button
              onClick={() => setFileMenuOpen(!fileMenuOpen)}
              className={cn(
                "h-9 px-3 font-semibold text-slate-700 hover:bg-slate-200 transition-colors flex items-center gap-1",
                fileMenuOpen && "bg-slate-200 text-black"
              )}
            >
              File
            </button>
            {fileMenuOpen && (
              <div className="absolute left-0 top-9 w-64 bg-white border border-slate-300 shadow-xl rounded-b py-1 z-50 text-slate-800">
                <button
                  onClick={() => {
                    setFileMenuOpen(false);
                    toast.success("Workspace saved successfully!");
                  }}
                  className="w-full text-left px-4 py-2 hover:bg-slate-100 flex items-center gap-2"
                >
                  <Save className="h-4.5 w-4.5 text-slate-500" />
                  Save Workspace
                </button>
                <button
                  onClick={() => {
                    setFileMenuOpen(false);
                    fileInputRef.current?.click();
                  }}
                  className="w-full text-left px-4 py-2 hover:bg-slate-100 flex items-center gap-2"
                >
                  <Upload className="h-4.5 w-4.5 text-slate-500" />
                  Import Dataset
                </button>
                <button
                  onClick={() => {
                    setFileMenuOpen(false);
                    window.print();
                  }}
                  className="w-full text-left px-4 py-2 hover:bg-slate-100 flex items-center gap-2"
                >
                  <FileSpreadsheet className="h-4.5 w-4.5 text-rose-500" />
                  Export to PDF
                </button>
                <button
                  onClick={() => {
                    setFileMenuOpen(false);
                    handleExportExcel();
                  }}
                  className="w-full text-left px-4 py-2 hover:bg-slate-100 flex items-center gap-2"
                >
                  <FileSpreadsheet className="h-4.5 w-4.5 text-emerald-600" />
                  Export to Excel (XLSX)
                </button>
                <button
                  onClick={() => {
                    setFileMenuOpen(false);
                    handleExportDocx();
                  }}
                  className="w-full text-left px-4 py-2 hover:bg-slate-100 flex items-center gap-2"
                >
                  <FileText className="h-4.5 w-4.5 text-blue-600" />
                  Export to Word (DOCX)
                </button>
                <button
                  onClick={() => {
                    setFileMenuOpen(false);
                    handleExportPptx();
                  }}
                  className="w-full text-left px-4 py-2 hover:bg-slate-100 flex items-center gap-2"
                >
                  <Presentation className="h-4.5 w-4.5 text-orange-600" />
                  Export to PowerPoint (PPTX)
                </button>
                <button
                  onClick={() => {
                    setFileMenuOpen(false);
                    exportLayoutJson();
                  }}
                  className="w-full text-left px-4 py-2 hover:bg-slate-100 flex items-center gap-2"
                >
                  <Braces className="h-4.5 w-4.5 text-slate-500" />
                  Export JSON Layout
                </button>
                <button
                  onClick={() => {
                    setFileMenuOpen(false);
                    jsonInputRef.current?.click();
                  }}
                  className="w-full text-left px-4 py-2 hover:bg-slate-100 flex items-center gap-2"
                >
                  <Upload className="h-4.5 w-4.5 text-slate-500" />
                  Import JSON Layout
                </button>
                <div className="h-px bg-slate-200 my-1" />
                <button
                  onClick={() => {
                    setFileMenuOpen(false);
                    window.location.href = "/dashboards";
                  }}
                  className="w-full text-left px-4 py-2 hover:bg-slate-100 flex items-center gap-2 text-red-600"
                >
                  <X className="h-4.5 w-4.5" />
                  Close Report
                </button>
              </div>
            )}
          </div>

          {["Home", "Insert", "Modeling", "View", "Optimize", "Help"].map((tab) => (
            <button
              key={tab}
              onClick={() => {
                setActiveRibbonTab(tab);
                setFileMenuOpen(false);
              }}
              className={cn(
                "h-9 px-3.5 transition-all text-slate-700 font-medium border-b-2 hover:bg-slate-200/50",
                activeRibbonTab === tab
                  ? "border-[#118d95] text-black font-semibold bg-white"
                  : "border-transparent"
              )}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Ribbon Action Bar */}
        <div className="flex min-h-[64px] items-center gap-6 overflow-x-auto px-6 py-2 bg-white text-slate-800 border-b border-slate-200 shadow-inner">
          
          {/* HOME TAB */}
          {activeRibbonTab === "Home" && (
            <>
              {/* Clipboard Group */}
              <div className="flex flex-col items-center border-r border-slate-200 pr-4">
                <div className="flex gap-2">
                  <button className="flex flex-col items-center p-1 hover:bg-slate-100 rounded text-[10px] text-slate-500 cursor-not-allowed">
                    <Save className="h-4 w-4 opacity-50" />
                    Paste
                  </button>
                  <button className="p-1 hover:bg-slate-100 rounded text-[10px] text-slate-500 cursor-not-allowed">Cut</button>
                  <button className="p-1 hover:bg-slate-100 rounded text-[10px] text-slate-500 cursor-not-allowed">Copy</button>
                </div>
                <span className="text-[9px] text-slate-400 font-medium mt-1">Clipboard</span>
              </div>

              {/* Data Group */}
              <div className="flex flex-col items-center border-r border-slate-200 pr-4">
                <div className="flex items-center gap-1">
                  <Button variant="ghost" className="h-12 w-16 flex-col gap-0.5 hover:bg-slate-100 rounded text-slate-700 font-medium" onClick={() => fileInputRef.current?.click()}>
                    {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4.5 w-4.5 text-[#118d95]" />}
                    <span className="text-[10px]">Get data</span>
                  </Button>
                  <Button variant="ghost" className="h-12 w-16 flex-col gap-0.5 hover:bg-slate-100 rounded text-slate-700 font-medium" onClick={() => fileInputRef.current?.click()}>
                    <Upload className="h-4.5 w-4.5 text-emerald-600" />
                    <span className="text-[10px]">Excel</span>
                  </Button>
                  <Button variant="ghost" className="h-12 w-16 flex-col gap-0.5 hover:bg-slate-100 rounded text-slate-700 font-medium" onClick={() => toast.success("SQL configuration opened in settings")}>
                    <Database className="h-4.5 w-4.5 text-blue-600" />
                    <span className="text-[10px]">SQL Server</span>
                  </Button>
                </div>
                <span className="text-[9px] text-slate-400 font-medium mt-1">Data</span>
              </div>

              {/* Queries Group */}
              <div className="flex flex-col items-center border-r border-slate-200 pr-4">
                <div className="flex gap-2">
                  <Button variant="ghost" className="h-12 w-16 flex-col gap-0.5 hover:bg-slate-100 rounded text-slate-700 font-medium" onClick={openTableView}>
                    <Table2 className="h-4.5 w-4.5 text-indigo-600" />
                    <span className="text-[10px]">Transform</span>
                  </Button>
                  <Button variant="ghost" className="h-12 w-14 flex-col gap-0.5 hover:bg-slate-100 rounded text-slate-700 font-medium" onClick={load}>
                    <RefreshCw className="h-4 w-4 text-[#118d95]" />
                    <span className="text-[10px]">Refresh</span>
                  </Button>
                  
                  {/* Auto-Refresh Select */}
                  <div className="flex flex-col justify-center gap-0.5 pl-1 pr-1">
                    <select
                      value={refreshInterval}
                      onChange={(e) => setRefreshInterval(Number(e.target.value))}
                      className="bg-slate-50 border border-slate-200 rounded px-1 py-0.5 text-[9px] text-slate-700 focus:outline-none"
                    >
                      <option value={0}>Manual</option>
                      <option value={30}>30s</option>
                      <option value={60}>1m</option>
                      <option value={300}>5m</option>
                      <option value={900}>15m</option>
                    </select>
                    <span className="text-[8px] text-slate-400 font-mono text-center truncate max-w-[65px]">
                      {lastRefreshedTime ? lastRefreshedTime.toLocaleTimeString() : "Never"}
                    </span>
                  </div>
                </div>
                <span className="text-[9px] text-slate-400 font-medium mt-1">Queries</span>
              </div>

              {/* Insert Group */}
              <div className="flex flex-col items-center border-r border-slate-200 pr-4">
                <div className="flex gap-2">
                  <Button variant="ghost" className="h-12 w-16 flex-col gap-0.5 hover:bg-slate-100 rounded text-slate-700 font-medium" onClick={refreshPreview}>
                    <Plus className="h-4.5 w-4.5 text-slate-800" />
                    <span className="text-[10px]">New visual</span>
                  </Button>
                  <Button variant="ghost" className="h-12 w-14 flex-col gap-0.5 hover:bg-slate-100 rounded text-slate-700 font-medium" onClick={() => toast.success("Narrative Text box added")}>
                    <Calculator className="h-4 w-4 text-violet-600" />
                    <span className="text-[10px]">Text box</span>
                  </Button>
                </div>
                <span className="text-[9px] text-slate-400 font-medium mt-1">Insert</span>
              </div>

              {/* Calculations Group */}
              <div className="flex flex-col items-center border-r border-slate-200 pr-4">
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    className="h-12 w-16 flex-col gap-0.5 hover:bg-slate-100 rounded text-slate-700 font-medium"
                    onClick={() => setDraft((current) => ({ ...current, dax: "Total Sales = SUM([value])" }))}
                  >
                    <Sigma className="h-4.5 w-4.5 text-[#118d95]" />
                    <span className="text-[10px]">Measure</span>
                  </Button>
                </div>
                <span className="text-[9px] text-slate-400 font-medium mt-1">Calculations</span>
              </div>

              {/* Share Group */}
              <div className="flex flex-col items-center">
                <div className="flex gap-2">
                  <Button variant="ghost" className="h-12 w-14 flex-col gap-0.5 hover:bg-slate-100 rounded text-slate-700 font-medium" onClick={() => toast.success("Report published to Power BI Cloud Workspace!")}>
                    <Share2 className="h-4 w-4 text-[#118d95]" />
                    <span className="text-[10px]">Publish</span>
                  </Button>
                  <Button variant="ghost" className="h-12 w-14 flex-col gap-0.5 hover:bg-slate-100 rounded text-slate-700 font-medium" onClick={() => window.print()}>
                    <FileSpreadsheet className="h-4 w-4 text-rose-500" />
                    <span className="text-[10px]">Export PDF</span>
                  </Button>
                  <Button variant="ghost" className="h-12 w-14 flex-col gap-0.5 hover:bg-slate-100 rounded text-slate-700 font-medium" onClick={handleExportExcel}>
                    <FileSpreadsheet className="h-4 w-4 text-emerald-500" />
                    <span className="text-[10px]">Export Excel</span>
                  </Button>
                  <Button variant="ghost" className="h-12 w-14 flex-col gap-0.5 hover:bg-slate-100 rounded text-slate-700 font-medium" onClick={handleExportDocx}>
                    <FileText className="h-4 w-4 text-blue-500" />
                    <span className="text-[10px]">Export Word</span>
                  </Button>
                  <Button variant="ghost" className="h-12 w-14 flex-col gap-0.5 hover:bg-slate-100 rounded text-slate-700 font-medium" onClick={handleExportPptx}>
                    <Presentation className="h-4 w-4 text-orange-500" />
                    <span className="text-[10px]">Export PPTX</span>
                  </Button>
                  <Button variant="ghost" className="h-12 w-14 flex-col gap-0.5 hover:bg-slate-100 rounded text-slate-700 font-medium" onClick={() => setShowScheduleModal(true)}>
                    <Calendar className="h-4 w-4 text-indigo-500" />
                    <span className="text-[10px]">Schedule</span>
                  </Button>
                </div>
                <span className="text-[9px] text-slate-400 font-medium mt-1">Export & Share</span>
              </div>
            </>
          )}

          {/* INSERT TAB */}
          {activeRibbonTab === "Insert" && (
            <>
              {/* Pages */}
              <div className="flex flex-col items-center border-r border-slate-200 pr-4">
                <Button variant="ghost" className="h-12 w-16 flex-col gap-0.5 hover:bg-slate-100 rounded text-slate-700 font-medium" onClick={addPage}>
                  <Plus className="h-4.5 w-4.5" />
                  <span className="text-[10px]">New page</span>
                </Button>
                <span className="text-[9px] text-slate-400 font-medium mt-1">Pages</span>
              </div>

              {/* Visuals */}
              <div className="flex flex-col items-center border-r border-slate-200 pr-4">
                <div className="flex gap-1">
                  <Button variant="ghost" className="h-12 w-16 flex-col gap-0.5 hover:bg-slate-100 rounded text-slate-700 font-medium" onClick={refreshPreview}>
                    <Plus className="h-4.5 w-4.5" />
                    <span className="text-[10px]">New visual</span>
                  </Button>
                </div>
                <span className="text-[9px] text-slate-400 font-medium mt-1">Visuals</span>
              </div>

              {/* AI Visuals */}
              <div className="flex flex-col items-center border-r border-slate-200 pr-4">
                <div className="flex gap-2">
                  <Button variant="ghost" className="h-12 w-20 flex-col gap-0.5 hover:bg-slate-100 rounded text-slate-700 font-medium" onClick={() => toast.success("Key Influencers active")}>
                    <Sparkles className="h-4 w-4 text-violet-500" />
                    <span className="text-[10px]">Key Influencers</span>
                  </Button>
                  <Button variant="ghost" className="h-12 w-20 flex-col gap-0.5 hover:bg-slate-100 rounded text-slate-700 font-medium" onClick={() => toast.success("Narrative preview added")}>
                    <Calculator className="h-4 w-4 text-emerald-500" />
                    <span className="text-[10px]">Smart Narrative</span>
                  </Button>
                </div>
                <span className="text-[9px] text-slate-400 font-medium mt-1">AI Visuals</span>
              </div>

              {/* Elements */}
              <div className="flex flex-col items-center">
                <div className="flex gap-2">
                  <Button variant="ghost" className="h-12 w-14 flex-col gap-0.5 hover:bg-slate-100 rounded text-slate-700 font-medium" onClick={() => toast.success("Text box added")}>
                    <Calculator className="h-4 w-4" />
                    <span className="text-[10px]">Text box</span>
                  </Button>
                  <Button variant="ghost" className="h-12 w-14 flex-col gap-0.5 hover:bg-slate-100 rounded text-slate-700 font-medium" onClick={() => toast.success("Shape element created")}>
                    <CircleDot className="h-4 w-4" />
                    <span className="text-[10px]">Shapes</span>
                  </Button>
                  <Button variant="ghost" className="h-12 w-14 flex-col gap-0.5 hover:bg-slate-100 rounded text-slate-700 font-medium" onClick={() => toast.success("Image frame created")}>
                    <Image className="h-4 w-4" />
                    <span className="text-[10px]">Image</span>
                  </Button>
                </div>
                <span className="text-[9px] text-slate-400 font-medium mt-1">Elements</span>
              </div>
            </>
          )}

          {/* MODELING TAB */}
          {activeRibbonTab === "Modeling" && (
            <>
              {/* Calculations Group */}
              <div className="flex flex-col items-center border-r border-slate-200 pr-4">
                <div className="flex gap-2">
                  <Button variant="ghost" className="h-12 w-18 flex-col gap-0.5 hover:bg-slate-100 rounded text-slate-700 font-medium" onClick={() => setDraft((current) => ({ ...current, dax: "Total Sales = SUM([value])" }))}>
                    <Sigma className="h-4.5 w-4.5 text-[#118d95]" />
                    <span className="text-[10px]">New measure</span>
                  </Button>
                  <Button variant="ghost" className="h-12 w-18 flex-col gap-0.5 hover:bg-slate-100 rounded text-slate-700 font-medium" onClick={() => toast.success("New calculated column draft created")}>
                    <Calculator className="h-4.5 w-4.5" />
                    <span className="text-[10px]">New column</span>
                  </Button>
                  <Button variant="ghost" className="h-12 w-16 flex-col gap-0.5 hover:bg-slate-100 rounded text-slate-700 font-medium" onClick={() => toast.success("New data model table created")}>
                    <Table2 className="h-4.5 w-4.5" />
                    <span className="text-[10px]">New table</span>
                  </Button>
                </div>
                <span className="text-[9px] text-slate-400 font-medium mt-1">Calculations</span>
              </div>

              {/* Relationships */}
              <div className="flex flex-col items-center border-r border-slate-200 pr-4">
                <Button variant="ghost" className="h-12 w-20 flex-col gap-0.5 hover:bg-slate-100 rounded text-slate-700 font-medium" onClick={() => setActiveView("model")}>
                  <Boxes className="h-4.5 w-4.5" />
                  <span className="text-[10px]">Manage schemas</span>
                </Button>
                <span className="text-[9px] text-slate-400 font-medium mt-1">Relationships</span>
              </div>

              {/* Security */}
              <div className="flex flex-col items-center">
                <Button variant="ghost" className="h-12 w-20 flex-col gap-0.5 hover:bg-slate-100 rounded text-slate-700 font-medium" onClick={() => toast.success("Security roles config opened")}>
                  <Lock className="h-4 w-4" />
                  <span className="text-[10px]">Manage roles</span>
                </Button>
                <span className="text-[9px] text-slate-400 font-medium mt-1">Security</span>
              </div>
            </>
          )}

          {/* VIEW TAB */}
          {activeRibbonTab === "View" && (
            <>
              {/* Themes Group */}
              <div className="flex flex-col items-center border-r border-slate-200 pr-4">
                <div className="flex items-center gap-2.5 h-12 px-2">
                  {[
                    { key: "default", color: "bg-indigo-600", label: "Default" },
                    { key: "classic", color: "bg-[#118D95]", label: "Classic" },
                    { key: "sunset", color: "bg-amber-500", label: "Sunset" },
                    { key: "emerald", color: "bg-emerald-500", label: "Emerald" },
                    { key: "royal", color: "bg-violet-600", label: "Royal" },
                    { key: "steel", color: "bg-blue-400", label: "Steel" },
                  ].map((themeItem) => (
                    <button
                      key={themeItem.key}
                      onClick={() => {
                        setDashboardTheme(themeItem.key);
                        toast.success(`Applied ${themeItem.label} color theme`);
                      }}
                      title={themeItem.label}
                      className={cn(
                        "w-5 h-5 rounded-full border hover:scale-110 transition-transform",
                        themeItem.color,
                        dashboardTheme === themeItem.key ? "ring-2 ring-slate-800 border-white" : "border-slate-300"
                      )}
                    />
                  ))}
                </div>
                <span className="text-[9px] text-slate-400 font-medium mt-1">Themes</span>
              </div>

              {/* Page Options */}
              <div className="flex flex-col items-center border-r border-slate-200 pr-4">
                <div className="flex gap-4 h-12 items-center text-xs">
                  <label className="flex items-center gap-1.5 cursor-pointer font-medium text-slate-700">
                    <input
                      type="checkbox"
                      checked={showGridlines}
                      onChange={(e) => setShowGridlines(e.target.checked)}
                      className="rounded text-primary focus:ring-0"
                    />
                    Gridlines
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer font-medium text-slate-700">
                    <input
                      type="checkbox"
                      checked={snapToGrid}
                      onChange={(e) => setSnapToGrid(e.target.checked)}
                      className="rounded text-primary focus:ring-0"
                    />
                    Snap to grid
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer font-medium text-slate-700">
                    <input
                      type="checkbox"
                      checked={lockObjects}
                      onChange={(e) => {
                        setLockObjects(e.target.checked);
                        if (e.target.checked) toast.success("Visual canvas locked");
                        else toast.success("Visual canvas unlocked");
                      }}
                      className="rounded text-primary focus:ring-0"
                    />
                    Lock visuals
                  </label>
                </div>
                <span className="text-[9px] text-slate-400 font-medium mt-1">Page Options</span>
              </div>

              {/* Show Panes */}
              <div className="flex flex-col items-center">
                <div className="flex gap-4 h-12 items-center text-xs">
                  <label className="flex items-center gap-1.5 cursor-pointer font-medium text-slate-700">
                    <input
                      type="checkbox"
                      checked={showFiltersPane}
                      onChange={(e) => setShowFiltersPane(e.target.checked)}
                      className="rounded text-primary focus:ring-0"
                    />
                    Filters Pane
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer font-medium text-slate-700">
                    <input
                      type="checkbox"
                      checked={showVisualizationsPane}
                      onChange={(e) => setShowVisualizationsPane(e.target.checked)}
                      className="rounded text-primary focus:ring-0"
                    />
                    Visualizations
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer font-medium text-slate-700">
                    <input
                      type="checkbox"
                      checked={showDataPane}
                      onChange={(e) => setShowDataPane(e.target.checked)}
                      className="rounded text-primary focus:ring-0"
                    />
                    Data Pane
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer font-medium text-slate-700">
                    <input
                      type="checkbox"
                      checked={showBookmarksPane}
                      onChange={(e) => setShowBookmarksPane(e.target.checked)}
                      className="rounded text-primary focus:ring-0"
                    />
                    Bookmarks
                  </label>
                </div>
                <span className="text-[9px] text-slate-400 font-medium mt-1">Show Panes</span>
              </div>
            </>
          )}

          {/* OPTIMIZE TAB */}
          {activeRibbonTab === "Optimize" && (
            <>
              {/* Queries */}
              <div className="flex flex-col items-center border-r border-slate-200 pr-4">
                <div className="flex gap-2">
                  <Button variant="ghost" className="h-12 w-20 flex-col gap-0.5 hover:bg-slate-100 rounded text-slate-700 font-medium" onClick={() => toast.success("Visual query rendering paused")}>
                    <X className="h-4.5 w-4.5 text-red-500" />
                    <span className="text-[10px]">Pause visuals</span>
                  </Button>
                  <Button variant="ghost" className="h-12 w-20 flex-col gap-0.5 hover:bg-slate-100 rounded text-slate-700 font-medium" onClick={load}>
                    <RefreshCw className="h-4 w-4 text-[#118d95]" />
                    <span className="text-[10px]">Refresh visuals</span>
                  </Button>
                </div>
                <span className="text-[9px] text-slate-400 font-medium mt-1">Queries</span>
              </div>

              {/* Optimization */}
              <div className="flex flex-col items-center">
                <Button variant="ghost" className="h-12 w-20 flex-col gap-0.5 hover:bg-slate-100 rounded text-slate-700 font-medium" onClick={() => toast.success("Performance Analyzer Active")}>
                  <SlidersHorizontal className="h-4.5 w-4.5" />
                  <span className="text-[10px]">Performance</span>
                </Button>
                <span className="text-[9px] text-slate-400 font-medium mt-1">Report preset</span>
              </div>
            </>
          )}

          {/* HELP TAB */}
          {activeRibbonTab === "Help" && (
            <>
              <div className="flex flex-col items-center">
                <Button variant="ghost" className="h-12 w-20 flex-col gap-0.5 hover:bg-slate-100 rounded text-slate-700 font-medium" onClick={() => window.open("https://github.com", "_blank")}>
                  <Sparkles className="h-4.5 w-4.5 text-[#118d95]" />
                  <span className="text-[10px]">Help Docs</span>
                </Button>
                <span className="text-[9px] text-slate-400 font-medium mt-1">Information</span>
              </div>
            </>
          )}

        </div>
      </div>

      {/* Main Workspace split: Left Icons | Main Center Canvas | Right collapsible 3-Panes */}
      <div className="grid min-h-0 flex-1 grid-cols-[48px_1fr_auto] relative overflow-hidden">
        
        {/* Left Side View Bar (Report | Table | Model) */}
        <div className="border-r border-slate-300 bg-white flex flex-col z-20">
          <button
            onClick={() => setActiveView("report")}
            title="Report Canvas"
            className={cn(
              "flex h-12 w-full items-center justify-center border-l-3 transition-colors",
              activeView === "report" ? "border-[#118d95] text-[#118d95] bg-slate-100" : "border-transparent text-slate-500 hover:text-black hover:bg-slate-50"
            )}
          >
            <LayoutDashboard className="h-5 w-5" />
          </button>
          <button
            onClick={openTableView}
            title="Table Data View"
            className={cn(
              "flex h-12 w-full items-center justify-center border-l-3 transition-colors",
              activeView === "table" ? "border-[#118d95] text-[#118d95] bg-slate-100" : "border-transparent text-slate-500 hover:text-black hover:bg-slate-50"
            )}
          >
            <Table2 className="h-5 w-5" />
          </button>
          <button
            onClick={() => setActiveView("model")}
            title="Model Schema View"
            className={cn(
              "flex h-12 w-full items-center justify-center border-l-3 transition-colors",
              activeView === "model" ? "border-[#118d95] text-[#118d95] bg-slate-100" : "border-transparent text-slate-500 hover:text-black hover:bg-slate-50"
            )}
          >
            <Database className="h-5 w-5" />
          </button>
        </div>

        {/* Center Main Report Canvas Sheet */}
        <main className="min-w-0 overflow-auto bg-[#e1dfdd] p-6 flex flex-col justify-start items-center">
          
          {/* Dashboard Canvas Page Box */}
          <div
            className={cn(
              "w-full max-w-[1280px] min-h-[820px] bg-white border border-slate-300 shadow-xl relative transition-all duration-100 p-6 flex flex-col",
              lockObjects && "border-slate-400"
            )}
            style={{
              backgroundImage: showGridlines ? "radial-gradient(circle, #cbd5e1 1.2px, transparent 1.2px)" : "none",
              backgroundSize: "20px 20px",
            }}
          >
            {/* Header section inside the page */}
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3 flex-shrink-0">
              <div>
                <h1 className="text-xl font-bold text-slate-800 tracking-tight">{dashboard.title}</h1>
                <p className="text-xs text-slate-500">{selectedDataset ? `Dataset: ${selectedDataset.name}` : "Select data to populate"}</p>
              </div>
              
              {/* Date Filters inside Report */}
              <div className="flex items-center gap-1.5 rounded border border-slate-300 bg-white px-2.5 py-1 text-xs">
                <Filter className="h-3.5 w-3.5 text-slate-500" />
                <DateRangeFilter
                  onApply={refreshWithDates}
                  onClear={() => {
                    setDateFrom("");
                    setDateTo("");
                  }}
                />
              </div>
            </div>

            {/* Canvas Body */}
            <div className="flex-1 min-h-0 relative">
              {activeView === "table" ? (
                <div className="h-[620px] overflow-auto">
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <h2 className="text-sm font-bold text-slate-800">{selectedDataset?.name || "Table Data View"}</h2>
                      <p className="text-[11px] text-slate-500">
                        {selectedDataset ? `${selectedDataset.table_name} · ${selectedDataset.row_count.toLocaleString()} rows` : "No dataset active"}
                      </p>
                    </div>
                    <Button variant="outline" size="sm" onClick={openTableView} disabled={tableLoading || !selectedDataset} className="h-8 text-xs">
                      {tableLoading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <RefreshCw className="h-3 w-3 mr-1" />}
                      Reload
                    </Button>
                  </div>
                  {tableLoading ? (
                    <div className="flex h-96 items-center justify-center">
                      <Loader2 className="h-5 w-5 animate-spin text-[#118d95]" />
                    </div>
                  ) : tablePreview ? (
                    <table className="w-full border-collapse text-xs text-slate-800">
                      <thead className="sticky top-0 bg-slate-100 z-10">
                        <tr>
                          {tablePreview.columns.map((column) => (
                            <th key={column} className="border border-slate-200 px-2 py-1.5 text-left font-semibold bg-slate-50">
                              {column}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {tablePreview.rows.map((row, rowIndex) => (
                          <tr key={rowIndex} className="hover:bg-slate-50 transition-colors">
                            {tablePreview.columns.map((column) => (
                              <td key={column} className="border border-slate-100 px-2 py-1.5 truncate max-w-[200px]" title={String(row[column] ?? "")}>
                                {String(row[column] ?? "")}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="flex h-80 flex-col items-center justify-center text-sm text-slate-500">
                      <FileSpreadsheet className="h-10 w-10 text-slate-300 mb-2" />
                      Select or upload a dataset to view the rows.
                    </div>
                  )}
                </div>
              ) : activeView === "model" ? (
                <div className="flex flex-col lg:flex-row gap-6 w-full min-h-[620px] bg-slate-50/50 p-6 rounded-xl border border-slate-200 shadow-inner">
                  {/* Left Column: Table Schema Cards */}
                  <div className="flex-1 space-y-4 max-h-[650px] overflow-y-auto pr-2">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                        <Database className="h-4 w-4 text-[#118d95]" />
                        Workspace Tables ({datasets.length})
                      </h3>
                    </div>
                    {datasets.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-slate-500 bg-white">
                        No datasets uploaded yet. Upload data under Home or Data tab to see tables.
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {datasets.map((dataset) => {
                          const layoutConfig = (dashboard?.layout_config || {}) as Record<string, any>;
                          const cc = (layoutConfig.calculated_columns || []) as any[];
                          const tableCc = cc.filter((item: any) => item.table_name === dataset.table_name);
                          
                          return (
                            <div key={dataset.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:shadow-md transition-shadow">
                              <div className="border-b border-slate-100 pb-2 mb-2 flex items-center justify-between">
                                <div>
                                  <h4 className="font-bold text-slate-800 text-xs truncate max-w-[150px]">{dataset.name}</h4>
                                  <p className="text-[9px] font-mono text-slate-400">table: {dataset.table_name}</p>
                                </div>
                                <span className="text-[10px] bg-[#118d95]/10 text-[#118d95] px-1.5 py-0.5 rounded-full font-semibold">
                                  {dataset.columns.length + tableCc.length} fields
                                </span>
                              </div>
                              <div className="space-y-1 max-h-48 overflow-y-auto pr-1 text-[11px] text-slate-600">
                                {dataset.columns.map((col) => {
                                  const Icon = getColumnIcon(col, dataset, dashboard);
                                  return (
                                    <div key={col} className="flex items-center justify-between py-0.5 hover:bg-slate-50 px-1 rounded">
                                      <span className="flex items-center gap-1.5 truncate">
                                        <Icon className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                                        <span className="truncate">{col}</span>
                                      </span>
                                      <span className="text-[9px] text-slate-400 bg-slate-100 px-1 rounded uppercase">Base</span>
                                    </div>
                                  );
                                })}
                                {tableCc.map((ccItem) => (
                                  <div key={ccItem.column_name} className="flex items-center justify-between py-0.5 bg-yellow-50/50 hover:bg-yellow-50 px-1 rounded border border-yellow-100/50 group">
                                    <span className="flex items-center gap-1.5 truncate" title={ccItem.expression}>
                                      <Calculator className="h-3.5 w-3.5 text-yellow-600 shrink-0" />
                                      <span className="truncate text-yellow-800 font-semibold">{ccItem.column_name}</span>
                                    </span>
                                    <div className="flex items-center gap-1">
                                      <span className="text-[8px] text-yellow-600 bg-yellow-100 px-1 rounded uppercase font-semibold">Calc</span>
                                      <button 
                                        onClick={() => handleDeleteCalculatedColumn(dataset.table_name, ccItem.column_name)}
                                        className="text-red-500 hover:text-red-700 opacity-0 group-hover:opacity-100 transition-opacity p-0.5"
                                        title="Delete column"
                                      >
                                        <X className="h-3 w-3" />
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Right Column: Model Configuration Panel */}
                  <div className="w-full lg:w-[380px] bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col overflow-hidden">
                    <div className="flex border-b border-slate-200 bg-slate-50/50">
                      <button
                        onClick={() => setModelTab("relationships")}
                        className={cn(
                          "flex-1 py-3 text-xs font-bold text-center border-b-2 outline-none transition-colors",
                          modelTab === "relationships" ? "border-[#118d95] text-[#118d95] bg-white" : "border-transparent text-slate-500 hover:text-slate-800"
                        )}
                      >
                        Table Relationships
                      </button>
                      <button
                        onClick={() => setModelTab("calculations")}
                        className={cn(
                          "flex-1 py-3 text-xs font-bold text-center border-b-2 outline-none transition-colors",
                          modelTab === "calculations" ? "border-[#118d95] text-[#118d95] bg-white" : "border-transparent text-slate-500 hover:text-slate-800"
                        )}
                      >
                        Calculated Columns
                      </button>
                    </div>

                    <div className="flex-1 p-4 overflow-y-auto space-y-4 max-h-[580px]">
                      {modelTab === "relationships" ? (
                        <div className="space-y-4">
                          {/* Create Relationship Form */}
                          <div className="space-y-3 bg-slate-50 p-3 rounded-lg border border-slate-200">
                            <h4 className="text-[11px] font-bold text-slate-700 uppercase tracking-wide">Create Relationship</h4>
                            
                            <div className="grid grid-cols-2 gap-2">
                              <div className="space-y-1">
                                <label className="text-[9px] font-semibold text-slate-500">From Table</label>
                                <select
                                  value={relFromTable}
                                  onChange={(e) => {
                                    setRelFromTable(e.target.value);
                                    setRelFromCol("");
                                  }}
                                  className="w-full h-8 text-[11px] rounded border border-slate-300 bg-white px-2 outline-none"
                                >
                                  <option value="">Select table</option>
                                  {datasets.map((d) => <option key={d.id} value={d.table_name}>{d.name}</option>)}
                                </select>
                              </div>
                              <div className="space-y-1">
                                <label className="text-[9px] font-semibold text-slate-500">From Column</label>
                                <select
                                  value={relFromCol}
                                  onChange={(e) => setRelFromCol(e.target.value)}
                                  className="w-full h-8 text-[11px] rounded border border-slate-300 bg-white px-2 outline-none"
                                >
                                  <option value="">Select column</option>
                                  {(datasets.find(d => d.table_name === relFromTable)?.columns || []).map(c => <option key={c} value={c}>{c}</option>)}
                                  {/* Also list calculated columns */}
                                  {((dashboard?.layout_config?.calculated_columns || []) as any[])
                                    .filter((item: any) => item.table_name === relFromTable)
                                    .map((item: any) => <option key={item.column_name} value={item.column_name}>{item.column_name}</option>)}
                                </select>
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                              <div className="space-y-1">
                                <label className="text-[9px] font-semibold text-slate-500">To Table</label>
                                <select
                                  value={relToTable}
                                  onChange={(e) => {
                                    setRelToTable(e.target.value);
                                    setRelToCol("");
                                  }}
                                  className="w-full h-8 text-[11px] rounded border border-slate-300 bg-white px-2 outline-none"
                                >
                                  <option value="">Select table</option>
                                  {datasets.map((d) => <option key={d.id} value={d.table_name}>{d.name}</option>)}
                                </select>
                              </div>
                              <div className="space-y-1">
                                <label className="text-[9px] font-semibold text-slate-500">To Column</label>
                                <select
                                  value={relToCol}
                                  onChange={(e) => setRelToCol(e.target.value)}
                                  className="w-full h-8 text-[11px] rounded border border-slate-300 bg-white px-2 outline-none"
                                >
                                  <option value="">Select column</option>
                                  {(datasets.find(d => d.table_name === relToTable)?.columns || []).map(c => <option key={c} value={c}>{c}</option>)}
                                  {/* Also list calculated columns */}
                                  {((dashboard?.layout_config?.calculated_columns || []) as any[])
                                    .filter((item: any) => item.table_name === relToTable)
                                    .map((item: any) => <option key={item.column_name} value={item.column_name}>{item.column_name}</option>)}
                                </select>
                              </div>
                            </div>

                            <div className="space-y-1">
                              <label className="text-[9px] font-semibold text-slate-500">Cardinality</label>
                              <select
                                value={relCardinality}
                                onChange={(e) => setRelCardinality(e.target.value)}
                                className="w-full h-8 text-[11px] rounded border border-slate-300 bg-white px-2 outline-none"
                              >
                                <option value="1:N">One-to-Many (1:N)</option>
                                <option value="N:1">Many-to-One (N:1)</option>
                                <option value="1:1">One-to-One (1:1)</option>
                              </select>
                            </div>

                            <Button 
                              onClick={handleAddRelationship}
                              className="w-full h-8 text-xs bg-[#118d95] hover:bg-[#0e747b] text-white"
                            >
                              <Plus className="h-3.5 w-3.5 mr-1" />
                              Add Relationship
                            </Button>
                          </div>

                          {/* Relationships List */}
                          <div className="space-y-2">
                            <h4 className="text-[11px] font-bold text-slate-700 uppercase tracking-wide">Active Relationships</h4>
                            {(!dashboard?.layout_config?.relationships || (dashboard.layout_config.relationships as any[]).length === 0) ? (
                              <p className="text-[11px] text-slate-400 italic">No table relationships configured.</p>
                            ) : (
                              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                                {((dashboard.layout_config.relationships || []) as any[]).map((rel: any, idx: number) => {
                                  const fromName = datasets.find(d => d.table_name === rel.from_table)?.name || rel.from_table;
                                  const toName = datasets.find(d => d.table_name === rel.to_table)?.name || rel.to_table;
                                  return (
                                    <div key={idx} className="flex items-center justify-between bg-slate-50 rounded border border-slate-200 px-3 py-2 text-[10px]">
                                      <div className="truncate max-w-[280px]">
                                        <p className="font-semibold text-slate-800 truncate">
                                          {fromName}.{rel.from_col}
                                        </p>
                                        <p className="text-[9px] text-[#118d95] font-semibold mt-0.5">
                                          {rel.cardinality} Relation ➔ {toName}.{rel.to_col}
                                        </p>
                                      </div>
                                      <button 
                                        onClick={() => handleDeleteRelationship(idx)}
                                        className="text-red-500 hover:text-red-700 p-1"
                                      >
                                        <X className="h-3.5 w-3.5" />
                                      </button>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {/* Create Calculated Column Form */}
                          <div className="space-y-3 bg-slate-50 p-3 rounded-lg border border-slate-200">
                            <h4 className="text-[11px] font-bold text-slate-700 uppercase tracking-wide font-sans flex items-center gap-1">
                              <Calculator className="h-3.5 w-3.5 text-yellow-600" />
                              Add Calculated Column
                            </h4>

                            <div className="space-y-1">
                              <label className="text-[9px] font-semibold text-slate-500">Target Table</label>
                              <select
                                value={selectedModelTable}
                                onChange={(e) => setSelectedModelTable(e.target.value)}
                                className="w-full h-8 text-[11px] rounded border border-slate-300 bg-white px-2 outline-none"
                              >
                                <option value="">Select table</option>
                                {datasets.map((d) => <option key={d.id} value={d.table_name}>{d.name}</option>)}
                              </select>
                            </div>

                            <div className="space-y-1">
                              <label className="text-[9px] font-semibold text-slate-500">Column Name</label>
                              <Input
                                value={newColName}
                                onChange={(e) => setNewColName(e.target.value)}
                                className="h-8 text-xs bg-white border-slate-300 rounded"
                                placeholder="e.g. Profit"
                              />
                            </div>

                            <div className="space-y-1">
                              <label className="text-[9px] font-semibold text-slate-500">Formula Expression</label>
                              <textarea
                                value={newColExpression}
                                onChange={(e) => setNewColExpression(e.target.value)}
                                className="w-full min-h-16 text-xs bg-white border border-slate-300 rounded p-2 font-mono outline-none resize-none focus:ring-1 focus:ring-[#118d95]"
                                placeholder="e.g. [Sales] - [Cost]"
                              />
                            </div>

                            <div className="text-[9px] text-slate-400 bg-white border border-slate-100 p-2 rounded leading-snug">
                              Use brackets `[Field]` to refer to columns in this table. Standard math operators (`+`, `-`, `*`, `/`) and DuckDB functions are supported.
                            </div>

                            <Button 
                              onClick={handleAddCalculatedColumn}
                              className="w-full h-8 text-xs bg-[#118d95] hover:bg-[#0e747b] text-white"
                            >
                              <Plus className="h-3.5 w-3.5 mr-1" />
                              Add Calculated Column
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : widgets.length === 0 && !preview ? (
                /* POWER BI REPLICATED EMPTY CANVAS STATE */
                <div className="flex h-[560px] flex-col items-center justify-center text-center">
                  <h2 className="text-xl font-bold text-slate-800">Add data to your report</h2>
                  <p className="mt-1 text-xs text-slate-500">Once loaded, your data will appear in the Data pane.</p>
                  
                  <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4 max-w-2xl">
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="h-28 w-36 border border-slate-200 rounded-lg bg-emerald-50/30 text-left shadow-sm hover:border-[#118d95] hover:bg-emerald-50/60 transition-all flex flex-col justify-between"
                    >
                      <div className="flex-1 flex items-center justify-center">
                        <FileSpreadsheet className="h-8 w-8 text-emerald-600" />
                      </div>
                      <div className="border-t border-slate-200 bg-white px-2.5 py-1.5 text-[10px] font-semibold text-slate-700 rounded-b-lg">Import from Excel</div>
                    </button>
                    
                    <button
                      onClick={() => toast.success("SQL Server import menu active. Connect in Data tab.")}
                      className="h-28 w-36 border border-slate-200 rounded-lg bg-blue-50/30 text-left shadow-sm hover:border-[#118d95] hover:bg-blue-50/60 transition-all flex flex-col justify-between"
                    >
                      <div className="flex-1 flex items-center justify-center">
                        <Database className="h-8 w-8 text-blue-600" />
                      </div>
                      <div className="border-t border-slate-200 bg-white px-2.5 py-1.5 text-[10px] font-semibold text-slate-700 rounded-b-lg">SQL Database</div>
                    </button>

                    <button
                      onClick={openTableView}
                      className="h-28 w-36 border border-slate-200 rounded-lg bg-orange-50/30 text-left shadow-sm hover:border-[#118d95] hover:bg-orange-50/60 transition-all flex flex-col justify-between"
                    >
                      <div className="flex-1 flex items-center justify-center">
                        <Table2 className="h-8 w-8 text-orange-600" />
                      </div>
                      <div className="border-t border-slate-200 bg-white px-2.5 py-1.5 text-[10px] font-semibold text-slate-700 rounded-b-lg">Blank Table</div>
                    </button>

                    <button
                      onClick={handleUseSampleData}
                      className="h-28 w-36 border border-slate-200 rounded-lg bg-indigo-50/30 text-left shadow-sm hover:border-[#118d95] hover:bg-indigo-50/60 transition-all flex flex-col justify-between"
                    >
                      <div className="flex-1 flex items-center justify-center">
                        <Trophy className="h-8 w-8 text-indigo-600" />
                      </div>
                      <div className="border-t border-slate-200 bg-white px-2.5 py-1.5 text-[10px] font-semibold text-slate-700 rounded-b-lg">Use Sample Data</div>
                    </button>
                  </div>

                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="mt-6 text-xs text-[#118d95] hover:underline font-semibold flex items-center gap-1"
                  >
                    Get data from another source →
                  </button>
                </div>
              ) : (
                <div className="flex w-full min-h-[680px] flex-col gap-4">
                  {/* Dynamic Unsaved Visual Preview */}
                  {preview && (
                    <div className="relative flex max-h-[260px] min-h-[220px] w-full flex-col overflow-hidden rounded border-2 border-dashed border-[#118d95] bg-white p-3 shadow-sm">
                      <div className="mb-2 flex items-center justify-between gap-3 border-b border-slate-100 pb-2">
                        <div>
                          <h3 className="text-xs font-bold text-slate-800 truncate">{draft.title || "Draft Visual"}</h3>
                          <p className="text-[10px] text-slate-400">Unsaved preview</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <Button size="sm" onClick={saveVisual} disabled={saving} className="h-7 px-3 text-xs bg-[#118d95] hover:bg-[#0e747b] text-white">
                            {saving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Save className="h-3 w-3 mr-1" />}
                            Save Visual
                          </Button>
                          <button
                            onClick={() => setPreview(null)}
                            className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-black"
                          >
                            <X className="h-4.5 w-4.5" />
                          </button>
                        </div>
                      </div>
                      <div className="min-h-0 flex-1 overflow-hidden">
                        <ChartWidget data={preview} height={176} theme={dashboardTheme} formatOptions={formatOptions} />
                      </div>
                    </div>
                  )}

                  {/* Canvas Viewport */}
                  <div 
                    ref={viewportRef}
                    className="relative min-h-[520px] w-full flex-1 overflow-hidden rounded border border-slate-300 shadow-inner cursor-grab active:cursor-grabbing" 
                    style={(() => {
                      const wpConf = activePageFormatting.wallpaper;
                      const wpBgColor = hexToRgba(wpConf.color, 1 - wpConf.transparency / 100);
                      const wpBgImg = wpConf.imageUrl
                        ? `linear-gradient(${hexToRgba(wpConf.color, wpConf.transparency / 100)}, ${hexToRgba(wpConf.color, wpConf.transparency / 100)}), url(${wpConf.imageUrl})`
                        : "none";
                      return {
                        height: "680px",
                        backgroundColor: wpBgColor,
                        backgroundImage: wpBgImg,
                        backgroundSize: wpConf.imageFit === "Fit" ? "contain" : wpConf.imageFit === "Fill" ? "cover" : "auto",
                        backgroundRepeat: "no-repeat",
                        backgroundPosition: "center",
                      };
                    })()}
                    onPointerDown={handleCanvasPointerDown}
                    onPointerMove={handleCanvasPointerMove}
                    onPointerUp={handleCanvasPointerUp}
                  >
                    {/* Live Collaborator Cursors */}
                    {Object.entries(collaborators).map(([userId, data]) => (
                      <div
                        key={userId}
                        className="absolute pointer-events-none z-50 flex flex-col items-start transition-all duration-75"
                        style={{
                          left: `${data.x}px`,
                          top: `${data.y}px`,
                        }}
                      >
                        <MousePointer2 className="h-4 w-4 drop-shadow-md text-red-500" style={{ color: data.color }} />
                        <span 
                          className="mt-1 px-1.5 py-0.5 rounded text-[9px] font-bold text-white shadow-md truncate max-w-[100px]"
                          style={{ backgroundColor: data.color }}
                        >
                          {data.name}
                        </span>
                      </div>
                    ))}

                    {/* Zoom & Pan floating controls */}
                    <div className="absolute top-4 right-4 flex items-center gap-1 bg-white border border-slate-300 rounded shadow-md p-1 z-30 select-none">
                      <Button
                        size="sm"
                        variant={canvasMode === "select" ? "default" : "ghost"}
                        className={cn("h-7 w-7 p-0", canvasMode === "select" && "bg-[#118d95] text-white hover:bg-[#0e747b]")}
                        onClick={() => setCanvasMode("select")}
                        title="Select Tool (V)"
                      >
                        <MousePointer2 className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant={canvasMode === "pan" ? "default" : "ghost"}
                        className={cn("h-7 w-7 p-0", canvasMode === "pan" && "bg-[#118d95] text-white hover:bg-[#0e747b]")}
                        onClick={() => setCanvasMode("pan")}
                        title="Hand/Pan Tool (H)"
                      >
                        <span className="text-xs">✋</span>
                      </Button>
                      <div className="w-px h-5 bg-slate-300 mx-1" />
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-sm font-bold" onClick={() => setZoomPercent(prev => Math.max(50, prev - 10))}>-</Button>
                      <span className="text-[10px] font-mono font-bold w-9 text-center">{zoomPercent}%</span>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-sm font-bold" onClick={() => setZoomPercent(prev => Math.min(150, prev + 10))}>+</Button>
                      <Button size="sm" variant="ghost" className="h-7 px-1.5 text-[10px] font-semibold" onClick={() => { setZoomPercent(100); setPanOffset({ x: 0, y: 0 }); }}>Reset</Button>
                    </div>

                    {/* Canvas Inner Board */}
                    <div
                      className="absolute origin-top-left border border-slate-350 shadow-xl transition-all duration-75"
                      style={(() => {
                        const canvasBgConf = activePageFormatting.canvasBackground;
                        const canvasBgColor = hexToRgba(canvasBgConf.color, 1 - canvasBgConf.transparency / 100);
                        
                        const gridlineBg = showGridlines ? "radial-gradient(circle, #cbd5e1 1.2px, transparent 1.2px)" : "";
                        const canvasImage = canvasBgConf.imageUrl
                          ? `linear-gradient(${hexToRgba(canvasBgConf.color, canvasBgConf.transparency / 100)}, ${hexToRgba(canvasBgConf.color, canvasBgConf.transparency / 100)}), url(${canvasBgConf.imageUrl})`
                          : "";
                        
                        const canvasBgImageStyle = gridlineBg && canvasImage
                          ? `${gridlineBg}, ${canvasImage}`
                          : gridlineBg || canvasImage || "none";
                          
                        const canvasBgSizeStyle = showGridlines && canvasBgConf.imageUrl
                          ? `24px 24px, ${canvasBgConf.imageFit === "Fit" ? "contain" : canvasBgConf.imageFit === "Fill" ? "cover" : "auto"}`
                          : showGridlines
                            ? "24px 24px"
                            : canvasBgConf.imageUrl
                              ? (canvasBgConf.imageFit === "Fit" ? "contain" : canvasBgConf.imageFit === "Fill" ? "cover" : "auto")
                              : "auto";

                        const canvasBgRepeatStyle = showGridlines && canvasBgConf.imageUrl
                          ? "repeat, no-repeat"
                          : showGridlines
                            ? "repeat"
                            : "no-repeat";

                        const canvasBgPositionStyle = showGridlines && canvasBgConf.imageUrl
                          ? "top left, center"
                          : showGridlines
                            ? "top left"
                            : "center";

                        const canvasSettingsConf = activePageFormatting.canvasSettings;
                        const verticalAlignVal = canvasSettingsConf.verticalAlignment;
                        const baseAlignY = (verticalAlignVal === "Middle" && panOffset.y === 0)
                          ? Math.max(0, (680 - canvasSettingsConf.height * (zoomPercent / 100)) / 2)
                          : 0;

                        return {
                          transform: `translate(${panOffset.x}px, ${panOffset.y + baseAlignY}px) scale(${zoomPercent / 100})`,
                          width: `${canvasSettingsConf.width}px`,
                          height: `${canvasSettingsConf.height}px`,
                          backgroundColor: canvasBgColor,
                          backgroundImage: canvasBgImageStyle,
                          backgroundSize: canvasBgSizeStyle,
                          backgroundRepeat: canvasBgRepeatStyle,
                          backgroundPosition: canvasBgPositionStyle,
                        };
                      })()}
                    >
                      {/* Alignment Guides Overlay */}
                      {alignX !== null && (
                        <div 
                          className="absolute top-0 bottom-0 border-l border-dashed border-red-500 z-40 pointer-events-none" 
                          style={{ left: `${alignX * 96}px` }}
                        />
                      )}
                      {alignY !== null && (
                        <div 
                          className="absolute left-0 right-0 border-t border-dashed border-red-500 z-40 pointer-events-none" 
                          style={{ top: `${alignY * 72}px` }}
                        />
                      )}

                      {/* Spacing Indicators */}
                      {spacingIndicators.map((ind, idx) => (
                        <div
                          key={idx}
                          className="absolute border border-dashed border-cyan-500 bg-cyan-100/30 flex items-center justify-center pointer-events-none z-40 text-[9px] text-cyan-600 font-bold px-1 rounded"
                          style={{
                            left: `${ind.x}px`,
                            top: `${ind.y}px`,
                            width: ind.width ? `${ind.width}px` : "16px",
                            height: ind.height ? `${ind.height}px` : "16px",
                            transform: ind.width ? "translateY(-50%)" : "translateX(-50%)",
                          }}
                        >
                          {ind.value}
                        </div>
                      ))}

                      {/* Saved Widgets rendered absolutely */}
                      {widgets
                        .filter((w) => {
                          const layoutConfig = (dashboard?.layout_config || {}) as Record<string, any>;
                          const widgetPages = (layoutConfig.widget_pages || {}) as Record<string, string>;
                          const widgetPage = widgetPages[w.id] || "Page 1";
                          return widgetPage === activePage;
                        })
.map((widget) => {
                          const layoutConfig = (dashboard?.layout_config || {}) as Record<string, any>;
                          const zIndices = (layoutConfig.widget_z_indices || {}) as Record<string, number>;
                          const wZIndex = zIndices[widget.id] || (selectedWidgetId === widget.id ? 40 : 10);
                          const isWidgetLocked = Boolean(lockedWidgets[widget.id]);
                          const lockerName = lockedWidgets[widget.id]?.name || "";
                          return (
                              <div
                                key={widget.id}
                                onClick={() => !isWidgetLocked && setSelectedWidgetId(widget.id)}
                                onContextMenu={(event) => {
                                  if (isWidgetLocked) return;
                                  event.preventDefault();
                                  setContextMenu({ x: event.clientX, y: event.clientY, widget });
                                }}
                                className={cn(
                                  "absolute select-none overflow-hidden box-border bg-white p-3 rounded transition-all group",
                                  isWidgetLocked 
                                    ? "ring-2 ring-red-400/80 border-transparent shadow-md opacity-85"
                                    : selectedWidgetId === widget.id 
                                      ? "ring-2 ring-[#118d95] border-transparent shadow-lg" 
                                      : "border border-transparent hover:border-slate-200/50 shadow-none hover:shadow-sm"
                                )}
                                style={{
                                  left: `${widget.position_x * 96}px`,
                                  top: `${widget.position_y * 72}px`,
                                  width: `${widget.width * 96}px`,
                                  height: `${widget.height * 72}px`,
                                  zIndex: wZIndex,
                                }}
                              >
                                {isWidgetLocked && (
                                  <div className="absolute top-1 right-1 bg-red-500 text-white text-[9px] px-1 rounded flex items-center gap-0.5 z-30 shadow-sm">
                                    <span>🔒 {lockerName}</span>
                                  </div>
                                )}
                                <div
                                  className={cn(
                                    "flex items-center justify-between gap-3 transition-all",
                                    selectedWidgetId === widget.id 
                                      ? "mb-2.5 border-b border-slate-100 pb-1.5 cursor-move" 
                                      : "mb-1 cursor-pointer"
                                  )}
                                  onPointerDown={(event) => {
                                    if (isWidgetLocked) return;
                                    if (selectedWidgetId === widget.id) {
                                      startWidgetPointer(widget, event, "move");
                                    } else {
                                      setSelectedWidgetId(widget.id);
                                    }
                                  }}
                                >
                                  <div className="min-w-0 flex-1">
                                    {selectedWidgetId === widget.id && widgetDrillPaths[widget.id] && widgetDrillPaths[widget.id].length > 0 ? (
                                      <div className="flex items-center gap-1 text-[10px] text-slate-500 font-semibold mb-0.5">
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleDrillUp(widget);
                                          }}
                                          className="hover:text-red-500 hover:bg-slate-100 p-0.5 rounded flex items-center gap-0.5"
                                          title="Drill up"
                                        >
                                          <ChevronLeft className="h-3 w-3 shrink-0" />
                                          <span>Back</span>
                                        </button>
                                        <span className="text-slate-300">|</span>
                                        <span className="truncate max-w-[100px]">{widget.x_key}</span>
                                        {widgetDrillPaths[widget.id].map((p, idx) => (
                                          <span key={idx} className="truncate max-w-[85px]">
                                            &gt; {String(p.value)}
                                          </span>
                                        ))}
                                      </div>
                                    ) : null}
                                    <h3 className="truncate text-xs font-bold text-slate-800">{widget.title}</h3>
                                    <p className="text-[9px] uppercase tracking-wider text-slate-400 font-semibold">{widget.chart_type}</p>
                                  </div>
                                  {selectedWidgetId === widget.id && (
                                    <div className="flex items-center gap-0.5 shrink-0 z-30" onClick={(e) => e.stopPropagation()}>
                                      {/* Filter Icon Button */}
                                      {(() => {
                                        const widgetLabels = widget.chartData?.labels || [];
                                        const isFiltered = (widget.x_key && activeFilters[widget.x_key] !== undefined) || widgetLabels.some(l => activeFilters[l] !== undefined);
                                        return (
                                          <button 
                                            className={cn(
                                              "p-1 rounded transition-colors duration-150 flex items-center justify-center",
                                              isFiltered 
                                                ? "text-[#118d95] bg-[#118d95]/10 hover:bg-[#118d95]/20 hover:text-[#0e757b]" 
                                                : "text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                                            )}
                                            onClick={() => {
                                              if (isFiltered) {
                                                handleWidgetSelectCategory(widget, "__CLEAR__");
                                                toast.success("Visual filter cleared");
                                              } else {
                                                toast.error("Click inside the visual to apply filters");
                                              }
                                            }}
                                            title={isFiltered ? "Clear visual filters" : "Filter (cross-filter by clicking data points)"}
                                          >
                                            <Filter className="h-3.5 w-3.5" />
                                          </button>
                                        );
                                      })()}

                                      {/* Focus Mode Icon Button */}
                                      <button 
                                        className="text-slate-400 hover:text-slate-600 p-1 hover:bg-slate-100 rounded transition-colors duration-150 flex items-center justify-center"
                                        onClick={() => setFocusedWidget(widget)}
                                        title="Focus mode"
                                      >
                                        <Maximize2 className="h-3.5 w-3.5" />
                                      </button>

                                      {/* More Options / Three Dots Icon Button */}
                                      <div className="relative">
                                        <button 
                                          className={cn(
                                            "text-slate-400 hover:text-slate-600 p-1 hover:bg-slate-100 rounded transition-colors duration-150 flex items-center justify-center",
                                            activeDropdownWidgetId === widget.id ? "bg-slate-100 text-slate-800" : ""
                                          )}
                                          onClick={() => setActiveDropdownWidgetId(activeDropdownWidgetId === widget.id ? null : widget.id)}
                                          title="More options"
                                        >
                                          <MoreHorizontal className="h-3.5 w-3.5" />
                                        </button>

                                        {activeDropdownWidgetId === widget.id && (
                                          <div className="absolute right-0 mt-1 w-44 bg-white border border-slate-200 shadow-xl rounded-md py-1 z-50 text-slate-800 text-xs font-normal">
                                            <button
                                              onClick={() => {
                                                setFocusedWidget(widget);
                                                setActiveDropdownWidgetId(null);
                                              }}
                                              className="w-full text-left px-3 py-1.5 hover:bg-slate-50 flex items-center gap-2"
                                            >
                                              <Maximize2 className="h-3 w-3 text-slate-500" />
                                              <span>Focus mode</span>
                                            </button>
                                            <button
                                              onClick={() => {
                                                copyWidget(widget);
                                                setActiveDropdownWidgetId(null);
                                              }}
                                              className="w-full text-left px-3 py-1.5 hover:bg-slate-50 flex items-center gap-2"
                                            >
                                              <span>Copy visual</span>
                                            </button>
                                            <button
                                              onClick={() => {
                                                duplicateWidget(widget);
                                                setActiveDropdownWidgetId(null);
                                              }}
                                              className="w-full text-left px-3 py-1.5 hover:bg-slate-50 flex items-center gap-2"
                                            >
                                              <span>Duplicate visual</span>
                                            </button>
                                            <button
                                              onClick={() => {
                                                adjustLayering(widget, "forward");
                                                setActiveDropdownWidgetId(null);
                                              }}
                                              className="w-full text-left px-3 py-1.5 hover:bg-slate-50 flex items-center gap-2"
                                            >
                                              <span>Bring forward</span>
                                            </button>
                                            <button
                                              onClick={() => {
                                                adjustLayering(widget, "backward");
                                                setActiveDropdownWidgetId(null);
                                              }}
                                              className="w-full text-left px-3 py-1.5 hover:bg-slate-50 flex items-center gap-2"
                                            >
                                              <span>Send backward</span>
                                            </button>
                                            <button
                                              onClick={() => {
                                                exportWidgetCSV(widget);
                                                setActiveDropdownWidgetId(null);
                                              }}
                                              className="w-full text-left px-3 py-1.5 hover:bg-slate-50 flex items-center gap-2 text-emerald-700 font-medium"
                                            >
                                              <span>Export to CSV</span>
                                            </button>
                                            <div className="h-px bg-slate-100 my-1" />
                                            <button
                                              onClick={() => {
                                                removeWidget(widget.id);
                                                setActiveDropdownWidgetId(null);
                                              }}
                                              className="w-full text-left px-3 py-1.5 hover:bg-slate-50 flex items-center gap-2 text-red-600 font-semibold"
                                            >
                                              <span>Delete visual</span>
                                            </button>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                </div>
                                
                                {widget.loading ? (
                                  <div className="flex h-full items-center justify-center -mt-6">
                                    <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
                                  </div>
                                ) : widget.error ? (
                                  <div className="flex h-full items-center justify-center px-4 text-center text-[11px] text-red-500 -mt-6">
                                    {widget.error}
                                  </div>
                                ) : widget.chartData ? (
                                  <div className={cn("min-h-0 overflow-hidden transition-all", selectedWidgetId === widget.id ? "h-[calc(100%-42px)]" : "h-[calc(100%-30px)]")}>
                                    <ChartWidget
                                      data={widget.chartData}
                                      height={Math.max(48, widget.height * 72 - (selectedWidgetId === widget.id ? 66 : 54))}
                                      theme={dashboardTheme}
                                      formatOptions={formatOptions}
                                      onSelectCategory={(value: any) => handleWidgetSelectCategory(widget, value)}
                                      activeFilters={activeFilters}
                                    />
                                  </div>
                                ) : (
                                  <div className="flex h-full items-center justify-center text-xs text-slate-400 -mt-6">No data</div>
                                )}
                              
                              {!lockObjects && selectedWidgetId === widget.id && (
                                <>
                                  <div className="absolute inset-0 border-2 border-[#118d95] pointer-events-none z-20" />
                                  {/* Corner Handles */}
                                  <div
                                    className="absolute -top-1.5 -left-1.5 w-3 h-3 bg-white border border-[#118d95] cursor-nwse-resize z-30 shadow-sm"
                                    onPointerDown={(event) => startWidgetPointer(widget, event, "resize-nw")}
                                  />
                                  <div
                                    className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-white border border-[#118d95] cursor-nesw-resize z-30 shadow-sm"
                                    onPointerDown={(event) => startWidgetPointer(widget, event, "resize-ne")}
                                  />
                                  <div
                                    className="absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-white border border-[#118d95] cursor-nesw-resize z-30 shadow-sm"
                                    onPointerDown={(event) => startWidgetPointer(widget, event, "resize-sw")}
                                  />
                                  <div
                                    className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-white border border-[#118d95] cursor-nwse-resize z-30 shadow-sm"
                                    onPointerDown={(event) => startWidgetPointer(widget, event, "resize-se")}
                                  />
                                  {/* Side Handles */}
                                  <div
                                    className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-white border border-[#118d95] cursor-ns-resize z-30 shadow-sm"
                                    onPointerDown={(event) => startWidgetPointer(widget, event, "resize-n")}
                                  />
                                  <div
                                    className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-white border border-[#118d95] cursor-ns-resize z-30 shadow-sm"
                                    onPointerDown={(event) => startWidgetPointer(widget, event, "resize-s")}
                                  />
                                  <div
                                    className="absolute top-1/2 -left-1.5 -translate-y-1/2 w-3 h-3 bg-white border border-[#118d95] cursor-ew-resize z-30 shadow-sm"
                                    onPointerDown={(event) => startWidgetPointer(widget, event, "resize-w")}
                                  />
                                  <div
                                    className="absolute top-1/2 -right-1.5 -translate-y-1/2 w-3 h-3 bg-white border border-[#118d95] cursor-ew-resize z-30 shadow-sm"
                                    onPointerDown={(event) => startWidgetPointer(widget, event, "resize-e")}
                                  />
                                </>
                              )}
                            </div>
                          );
                        })}
                    </div>
                  </div>
                </div>

              )}
            </div>

            {previewError && <p className="mt-4 text-xs text-red-500 font-semibold bg-red-50 border border-red-200 rounded p-2.5">{previewError}</p>}
          </div>
        </main>

        {/* Right Side: Replicated Collapsible Three-Pane Sidebars */}
        <aside className="flex min-h-0 bg-[#f3f2f1] border-l border-slate-300 z-10 flex-shrink-0">
          
          {/* 1. FILTERS PANE */}
          <div className="flex">
            {showFiltersPane ? (
              <section className="w-[230px] flex flex-col bg-[#f3f2f1] border-r border-slate-300 text-xs">
                <div className="flex h-9 items-center justify-between border-b border-slate-200 px-3 bg-white font-semibold flex-shrink-0">
                  <span className="flex items-center gap-1.5">
                    <ListFilter className="h-3.5 w-3.5 text-slate-600" />
                    Filters
                  </span>
                  <button onClick={() => setShowFiltersPane(false)} title="Collapse Filters">
                    <ChevronRight className="h-4 w-4 text-slate-500 hover:text-black" />
                  </button>
                </div>
                <div className="p-3 space-y-4 max-h-[calc(100vh-170px)] overflow-y-auto">
                  {selectedWidget && (
                    <FilterSectionDropZone
                      level="visual"
                      title="Filters on this visual"
                      onDrop={handleDropFilter}
                      isEmpty={panelFilters.filter(f => f.level === "visual" && f.targetWidgetId === selectedWidget.id).length === 0}
                    >
                      {panelFilters
                        .filter(f => f.level === "visual" && f.targetWidgetId === selectedWidget.id)
                        .map(f => (
                          <FilterCardComponent
                            key={f.id}
                            filter={f}
                            dataset={datasets.find(d => d.id === (selectedWidget.dataset_id || selectedDatasetId))}
                            onUpdateFilter={handleUpdateFilter}
                            onDeleteFilter={handleDeleteFilter}
                          />
                        ))}
                    </FilterSectionDropZone>
                  )}
                  
                  <FilterSectionDropZone
                    level="page"
                    title="Filters on this page"
                    onDrop={handleDropFilter}
                    isEmpty={panelFilters.filter(f => f.level === "page" && f.pageName === activePage).length === 0}
                  >
                    {panelFilters
                      .filter(f => f.level === "page" && f.pageName === activePage)
                      .map(f => (
                        <FilterCardComponent
                          key={f.id}
                          filter={f}
                          dataset={datasets.find(d => d.id === selectedDatasetId) || datasets[0]}
                          onUpdateFilter={handleUpdateFilter}
                          onDeleteFilter={handleDeleteFilter}
                        />
                      ))}
                  </FilterSectionDropZone>
                  
                  <FilterSectionDropZone
                    level="global"
                    title="Filters on all pages"
                    onDrop={handleDropFilter}
                    isEmpty={panelFilters.filter(f => f.level === "global").length === 0}
                  >
                    {panelFilters
                      .filter(f => f.level === "global")
                      .map(f => (
                        <FilterCardComponent
                          key={f.id}
                          filter={f}
                          dataset={datasets.find(d => d.id === selectedDatasetId) || datasets[0]}
                          onUpdateFilter={handleUpdateFilter}
                          onDeleteFilter={handleDeleteFilter}
                        />
                      ))}
                  </FilterSectionDropZone>
                </div>
              </section>
            ) : (
              <button
                onClick={() => setShowFiltersPane(true)}
                className="w-8 border-r border-slate-300 bg-[#f3f2f1] hover:bg-slate-200 flex flex-col items-center py-4 text-slate-600 text-[10px] font-bold gap-1 select-none"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                <span className="[writing-mode:vertical-lr] tracking-wider uppercase">Filters</span>
              </button>
            )}
          </div>

          {/* 2. VISUALIZATIONS PANE */}
          <div className="flex">
            {showVisualizationsPane ? (
              <section className="w-[250px] flex flex-col bg-[#f3f2f1] border-r border-slate-300 text-xs">
                <div className="flex h-9 items-center justify-between border-b border-slate-200 px-3 bg-white font-semibold flex-shrink-0">
                  <span className="flex items-center gap-1.5">
                    <Braces className="h-3.5 w-3.5 text-slate-600" />
                    Visualizations
                  </span>
                  <button onClick={() => setShowVisualizationsPane(false)} title="Collapse Visualizations">
                    <ChevronRight className="h-4 w-4 text-slate-500 hover:text-black" />
                  </button>
                </div>
                
                {/* Visualizations Sub-Tabs */}
                <div className="flex h-9 items-center justify-around border-b border-slate-200 bg-white flex-shrink-0">
                  <button
                    onClick={() => setActiveVizTab("build")}
                    title="Build visual"
                    className={cn(
                      "flex-1 flex justify-center py-2 h-full items-center border-b-2 transition-all",
                      activeVizTab === "build"
                        ? "border-[#118d95] text-[#118d95] bg-[#118d95]/5 font-semibold"
                        : "border-transparent text-slate-500 hover:text-black hover:bg-slate-50"
                    )}
                  >
                    <BarChart3 className="h-4.5 w-4.5" />
                  </button>
                  <button
                    onClick={() => setActiveVizTab("format")}
                    title="Format visual"
                    className={cn(
                      "flex-1 flex justify-center py-2 h-full items-center border-b-2 transition-all",
                      activeVizTab === "format"
                        ? "border-[#118d95] text-[#118d95] bg-[#118d95]/5 font-semibold"
                        : "border-transparent text-slate-500 hover:text-black hover:bg-slate-50"
                    )}
                  >
                    <Paintbrush className="h-4.5 w-4.5" />
                  </button>
                  <button
                    onClick={() => setActiveVizTab("analytics")}
                    title="Analytics"
                    className={cn(
                      "flex-1 flex justify-center py-2 h-full items-center border-b-2 transition-all",
                      activeVizTab === "analytics"
                        ? "border-[#118d95] text-[#118d95] bg-[#118d95]/5 font-semibold"
                        : "border-transparent text-slate-500 hover:text-black hover:bg-slate-50"
                    )}
                  >
                    <TrendingUp className="h-4.5 w-4.5" />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto max-h-[calc(100vh-170px)]">
                  {activeVizTab === "build" && (
                    <div className="p-3.5 space-y-3.5">
                      <div>
                        <Input
                          value={draft.title}
                          onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
                          placeholder="Visual Title (e.g. Sales)"
                          className="h-8.5 text-xs bg-white border-slate-300 rounded"
                        />
                      </div>

                      {/* Grid of chart type selections */}
                      <div>
                        <p className="mb-1.5 font-bold text-slate-800">Build visual</p>
                        <div className="grid grid-cols-6 gap-1 bg-white p-1 rounded border border-slate-200">
                          {VISUAL_TYPES.map((type, index) => {
                            const Icon = type.icon;
                            return (
                              <button
                                key={`${type.label}-${index}`}
                                type="button"
                                title={type.label}
                                onClick={() => {
                                  setSelectedVisualIndex(index);
                                  setDraft((current) => ({ ...current, chart_type: type.value }));
                                  if (selectedWidgetId) {
                                    updateSelectedWidget({ chart_type: type.value });
                                  }
                                }}

                                className={cn(
                                  "flex h-8 items-center justify-center rounded transition-all hover:bg-slate-100",
                                  selectedVisualIndex === index
                                    ? "bg-[#118d95]/15 text-[#118d95] border border-[#118d95]/40"
                                    : "text-slate-500 border border-transparent"
                                )}
                              >
                                <Icon className="h-4 w-4" />
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Aggregate selections */}
                      <div>
                        <p className="mb-1.5 font-bold text-slate-800">Summarize metric</p>
                        <div className="grid grid-cols-5 gap-1">
                          {(["sum", "avg", "count", "min", "max"] as Aggregation[]).map((aggregation) => {
                            const isSumAvg = aggregation === "sum" || aggregation === "avg";
                            const isDisabled = isSumAvg && !valuesAreNumeric;
                            return (
                              <button
                                key={aggregation}
                                type="button"
                                disabled={isDisabled}
                                onClick={() => {
                                  if (isDisabled) {
                                    toast.error("SUM and AVERAGE can only be applied to numeric columns.");
                                    return;
                                  }
                                  setDraft((current) => ({ ...current, aggregation }));
                                }}
                                className={cn(
                                  "rounded border text-[10px] font-bold py-1 uppercase transition-colors text-center",
                                  draft.aggregation === aggregation 
                                    ? "border-[#118d95] bg-[#118d95] text-white" 
                                    : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50",
                                  isDisabled && "opacity-50 cursor-not-allowed bg-slate-100 border-slate-200 text-slate-400"
                                )}
                              >
                                {aggregation}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Drag-Drop Target Zones */}
                      <div className="space-y-2">
                        {(() => {
                          const isFieldWellVisible = (well: FieldWell, chartType: ChartType): boolean => {
                            switch (chartType) {
                              case "pie":
                              case "donut":
                                return well === "axis" || well === "values" || well === "tooltips"; 
                              case "table":
                                return well === "values" || well === "axis" || well === "tooltips"; 
                              case "card":
                                return well === "values" || well === "tooltips";
                              case "slicer":
                                return well === "axis" || well === "tooltips";
                              default:
                                return true;
                            }
                          };

                          return (
                            <>
                              {isFieldWellVisible("axis", draft.chart_type) && (
                                <FieldDropZone
                                  title={
                                    draft.chart_type === "pie" || draft.chart_type === "donut" ? "Legend" :
                                    draft.chart_type === "table" ? "Rows" :
                                    draft.chart_type === "slicer" ? "Field" : "Axis"
                                  }
                                  description={
                                    draft.chart_type === "pie" || draft.chart_type === "donut" ? "Categories" :
                                    draft.chart_type === "table" ? "Group rows" :
                                    draft.chart_type === "slicer" ? "Slicer categories" : "X-Axis category"
                                  }
                                  fields={draft.axis ? [draft.axis] : []}
                                  onDropField={(field) => addField("axis", field)}
                                  onRemove={(field) => removeField("axis", field)}
                                />
                              )}
                              {isFieldWellVisible("values", draft.chart_type) && (
                                <FieldDropZone
                                  title={
                                    draft.chart_type === "table" ? "Columns" : "Values"
                                  }
                                  description={
                                    draft.chart_type === "table" ? "Table columns" : "Y-Axis metrics"
                                  }
                                  fields={draft.values}
                                  onDropField={(field) => addField("values", field)}
                                  onRemove={(field) => removeField("values", field)}
                                  multiple
                                />
                              )}
                              {isFieldWellVisible("legend", draft.chart_type) && (
                                <FieldDropZone
                                  title="Legend"
                                  description="Sub-categories"
                                  fields={draft.legend ? [draft.legend] : []}
                                  onDropField={(field) => addField("legend", field)}
                                  onRemove={(field) => removeField("legend", field)}
                                />
                              )}
                              {isFieldWellVisible("smallMultiples", draft.chart_type) && (
                                <FieldDropZone
                                  title="Small multiples"
                                  description="Grid split category"
                                  fields={draft.smallMultiples ? [draft.smallMultiples] : []}
                                  onDropField={(field) => addField("smallMultiples", field)}
                                  onRemove={(field) => removeField("smallMultiples", field)}
                                />
                              )}
                              {isFieldWellVisible("tooltips", draft.chart_type) && (
                                <FieldDropZone
                                  title={draft.chart_type === "slicer" ? "Filters" : "Tooltips"}
                                  description={draft.chart_type === "slicer" ? "Initial filters" : "Hover details"}
                                  fields={draft.tooltips}
                                  onDropField={(field) => addField("tooltips", field)}
                                  onRemove={(field) => removeField("tooltips", field)}
                                  multiple
                                />
                              )}

                              {/* Drill through section */}
                              {draft.chart_type !== "slicer" && draft.chart_type !== "card" && (
                                <div className="pt-3 border-t border-slate-300 mt-3 space-y-2.5">
                                  <p className="font-bold text-slate-800 text-xs">Drill through</p>
                                  
                                  <div className="flex items-center justify-between text-[11px] text-slate-600">
                                    <span>Cross-report</span>
                                    <button
                                      type="button"
                                      onClick={() => setDraft((current) => ({ ...current, crossReport: !current.crossReport }))}
                                      className={cn(
                                        "inline-flex items-center rounded-full border px-1.5 py-0.5 text-[9px] font-bold transition-all relative w-12 h-5.5 justify-between shadow-sm",
                                        draft.crossReport 
                                          ? "bg-[#0f7c84] text-white border-transparent flex-row-reverse" 
                                          : "bg-slate-100 text-slate-600 border-slate-300 flex-row"
                                      )}
                                    >
                                      <span className={cn(
                                        "w-2 h-2 rounded-full inline-block shadow-sm",
                                        draft.crossReport ? "bg-white" : "bg-slate-500"
                                      )} />
                                      <span>{draft.crossReport ? "On" : "Off"}</span>
                                    </button>
                                  </div>

                                  <div className="flex items-center justify-between text-[11px] text-slate-600">
                                    <span>Keep all filters</span>
                                    <button
                                      type="button"
                                      onClick={() => setDraft((current) => ({ ...current, keepAllFilters: !current.keepAllFilters }))}
                                      className={cn(
                                        "inline-flex items-center rounded-full border px-1.5 py-0.5 text-[9px] font-bold transition-all relative w-12 h-5.5 justify-between shadow-sm",
                                        draft.keepAllFilters 
                                          ? "bg-[#0f7c84] text-white border-transparent flex-row-reverse" 
                                          : "bg-slate-100 text-slate-600 border-slate-300 flex-row"
                                      )}
                                    >
                                      <span className={cn(
                                        "w-2 h-2 rounded-full inline-block shadow-sm",
                                        draft.keepAllFilters ? "bg-white" : "bg-slate-500"
                                      )} />
                                      <span>{draft.keepAllFilters ? "On" : "Off"}</span>
                                    </button>
                                  </div>

                                  <FieldDropZone
                                    title="Drill-through fields"
                                    description="Target transitions"
                                    fields={draft.drillThroughFields}
                                    onDropField={(field) => addField("drillThrough", field)}
                                    onRemove={(field) => removeField("drillThrough", field)}
                                    multiple
                                  />
                                </div>
                              )}
                            </>
                          );
                        })()}
                      </div>

                      {/* DAX Measures */}
                      <div className="relative">
                        <div className="mb-1 flex items-center justify-between">
                          <span className="font-bold text-slate-800">DAX formula bar</span>
                          <span className="text-[9px] text-[#118d95] font-extrabold flex items-center gap-0.5">
                            <Braces className="h-2.5 w-2.5" /> fx
                          </span>
                        </div>
                        <div className="flex rounded border border-slate-300 bg-white items-stretch focus-within:ring-1 focus-within:ring-[#118d95] overflow-hidden">
                          <div className="bg-slate-100 border-r border-slate-200 px-2 flex items-center justify-center font-mono italic text-[11px] text-slate-400 select-none">
                            fx
                          </div>
                          <textarea
                            value={draft.dax}
                            onChange={(e) => handleDaxChange(e.target.value)}
                            onKeyDown={handleDaxKeyDown}
                            onBlur={() => setTimeout(() => setShowDaxSuggestions(false), 200)}
                            rows={2}
                            placeholder="Total Sales = SUM([amount])"
                            className="w-full resize-none bg-transparent px-2 py-1 font-mono text-[11px] outline-none text-slate-800"
                          />
                        </div>

                        {/* Autocomplete suggestions dropdown */}
                        {showDaxSuggestions && activeSuggestions.length > 0 && (
                          <div className="absolute left-0 right-0 z-50 mt-1 max-h-32 overflow-y-auto rounded border border-slate-300 bg-white shadow-lg text-slate-850">
                            {activeSuggestions.map((suggestion, idx) => (
                              <button
                                key={suggestion}
                                type="button"
                                onMouseDown={() => selectSuggestion(suggestion)}
                                className={cn(
                                  "w-full text-left px-2.5 py-1.5 text-[10px] font-mono transition-colors",
                                  idx === suggestionIndex
                                    ? "bg-[#118d95]/15 text-[#118d95] font-bold"
                                    : "hover:bg-slate-50"
                                )}
                              >
                                {suggestion}
                              </button>
                            ))}
                          </div>
                        )}

                        {draft.dax && !daxMeasure && (
                          <p className="text-[9px] text-red-500 mt-1 font-semibold">
                            ⚠️ Syntax warning: Expected format 'MeasureName = SUM([FieldName])'
                          </p>
                        )}
                        {daxMeasure && (
                          <p className="text-[10px] text-emerald-600 font-semibold mt-1 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                            Active Measure: {daxMeasure.alias} ({daxMeasure.sqlFn})
                          </p>
                        )}
                      </div>

                      {/* Quick sizing adjustment widgets */}
                      {selectedWidget && (
                        <div className="rounded border border-slate-200 bg-white p-3 space-y-2">
                          <p className="font-bold text-slate-800">Widget adjustment</p>
                          <Input
                            value={selectedWidget.title}
                            onChange={(event) =>
                              setWidgets((current) =>
                                current.map((widget) =>
                                  widget.id === selectedWidget.id ? { ...widget, title: event.target.value } : widget
                                )
                              )
                            }
                            onBlur={(event) => updateSelectedWidget({ title: event.target.value })}
                            className="h-7 text-xs"
                          />
                          <div className="grid grid-cols-2 gap-1.5 pt-1">
                            <label className="text-[10px] text-slate-500">
                              Width ({selectedWidget.width})
                              <input
                                type="range"
                                min={1}
                                max={12}
                                value={selectedWidget.width}
                                onChange={(event) => updateSelectedWidget({ width: Number(event.target.value) })}
                                className="w-full h-1 mt-1 accent-[#118d95]"
                              />
                            </label>
                            <label className="text-[10px] text-slate-500">
                              Height ({selectedWidget.height})
                              <input
                                type="range"
                                min={1}
                                max={8}
                                value={selectedWidget.height}
                                onChange={(event) => updateSelectedWidget({ height: Number(event.target.value) })}
                                className="w-full h-1 mt-1 accent-[#118d95]"
                              />
                            </label>
                          </div>
                          <div className="grid grid-cols-2 gap-1.5 pt-1">
                            <Button variant="outline" className="h-7 text-[10px]" onClick={() => updateSelectedWidget({ position_y: Math.max(0, selectedWidget.position_y - 1) })}>
                              Move Up
                            </Button>
                            <Button variant="outline" className="h-7 text-[10px]" onClick={() => updateSelectedWidget({ position_y: selectedWidget.position_y + 1 })}>
                              Move Down
                            </Button>
                          </div>
                          <div className="pt-2 border-t border-slate-200">
                            <label className="text-[10px] text-slate-500 block mb-1">
                              Swap / Exchange Layout
                            </label>
                            <select
                              value=""
                              onChange={(event) => swapWidgetsLayout(event.target.value)}
                              className="h-7 w-full rounded border border-slate-300 bg-white text-[10px] px-1 outline-none text-slate-850"
                            >
                              <option value="">Select widget to exchange...</option>
                              {widgets
                                .filter((w) => w.id !== selectedWidget.id)
                                .map((w) => (
                                  <option key={w.id} value={w.id}>
                                    {w.title || `${w.chart_type} visual`}
                                  </option>
                                ))}
                            </select>
                          </div>
                        </div>
                      )}

                      {/* Apply Actions */}
                      <div className="flex gap-1.5 pt-1">
                        <Button className="flex-1 h-8 text-xs bg-[#118d95] hover:bg-[#0e747b] text-white" onClick={refreshPreview} disabled={refreshing}>
                          {refreshing ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <RefreshCw className="h-3.5 w-3.5 mr-1" />}
                          Build Preview
                        </Button>
                        <Button variant="outline" className="h-8 border-slate-300 text-slate-600 hover:text-black" onClick={saveVisual} disabled={saving}>
                          <Save className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  )}

                  {activeVizTab === "format" && (
                    <div className="flex flex-col pb-6 bg-[#f3f2f1]">
                      {/* Search box */}
                      <div className="px-3 pt-2.5">
                        <div className="relative">
                          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                          <Input
                            value={formatSearch}
                            onChange={(event) => setFormatSearch(event.target.value)}
                            className="pl-8 h-8 text-xs bg-white border-slate-300 rounded"
                            placeholder="Search settings..."
                          />
                        </div>
                      </div>

                      {!selectedWidgetId ? (
                        /* Page Formatting Pane */
                        <div className="mt-2 text-[11px] text-slate-650 flex flex-col select-none">
                          {/* Mock Paintbrush / Grid options headers */}
                          <div className="flex flex-col pb-2 bg-white px-3 pt-2 border-b border-slate-200">
                            <div className="text-[11px] font-bold text-slate-800 flex items-center gap-1">
                              <Paintbrush className="h-3 w-3 text-slate-600" /> Format page
                            </div>
                            <div className="flex items-center gap-1.5 mt-2 mb-1">
                              <button 
                                type="button"
                                className="p-1 rounded border border-[#118d95] bg-[#118d95]/5 text-[#118d95] shadow-sm hover:bg-[#118d95]/10"
                                title="Page settings"
                              >
                                <LayoutGrid className="h-3.5 w-3.5" />
                              </button>
                              <button 
                                type="button"
                                className="p-1 rounded border border-slate-250 bg-white text-slate-500 hover:text-black"
                                title="Visual formatting"
                              >
                                <Paintbrush className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>

                          <div className="divide-y divide-slate-200 mt-0.5">
                            {/* 1. Page Information Group */}
                            {matchesSearch("Page info") && (
                              <div className="border-b border-slate-200 bg-white">
                                <div
                                  className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-slate-50"
                                  onClick={() => togglePageGroup("page-info")}
                                >
                                  <span className="flex items-center gap-1.5 font-bold text-slate-700">
                                    {expandedPageGroups["page-info"] ? (
                                      <ChevronDown className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                                    ) : (
                                      <ChevronRight className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                                    )}
                                    Page information
                                  </span>
                                </div>
                                {expandedPageGroups["page-info"] && (
                                  <div className="px-5 py-2.5 space-y-3 bg-slate-50/50 border-t border-slate-100">
                                    <div className="space-y-1">
                                      <span className="font-bold text-slate-600 block">Name</span>
                                      <Input
                                        value={localPageName}
                                        onChange={(e) => setLocalPageName(e.target.value)}
                                        onBlur={() => renamePage(activePage, localPageName)}
                                        onKeyDown={(e) => {
                                          if (e.key === "Enter") renamePage(activePage, localPageName);
                                        }}
                                        className="h-7 text-[10px] bg-white border-slate-300 rounded focus:border-[#118d95] focus:ring-[#118d95] py-0.5 px-2 outline-none text-slate-800"
                                      />
                                    </div>
                                    <div className="flex items-center justify-between text-slate-650">
                                      <span className="font-semibold">Set as landing page</span>
                                      <button
                                        type="button"
                                        onClick={() => updatePageFormatting({ isLandingPage: !activePageFormatting.isLandingPage })}
                                        className={cn(
                                          "relative inline-flex h-4.5 w-8 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                                          activePageFormatting.isLandingPage ? "bg-[#118d95]" : "bg-slate-300"
                                        )}
                                      >
                                        <span
                                          className={cn(
                                            "pointer-events-none inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                                            activePageFormatting.isLandingPage ? "translate-x-3.5" : "translate-x-0"
                                          )}
                                        />
                                      </button>
                                    </div>
                                    <div className="flex items-center justify-between text-slate-650">
                                      <span className="font-semibold">Allow use as tooltip</span>
                                      <button
                                        type="button"
                                        onClick={() => updatePageFormatting({ useAsTooltip: !activePageFormatting.useAsTooltip })}
                                        className={cn(
                                          "relative inline-flex h-4.5 w-8 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                                          activePageFormatting.useAsTooltip ? "bg-[#118d95]" : "bg-slate-300"
                                        )}
                                      >
                                        <span
                                          className={cn(
                                            "pointer-events-none inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                                            activePageFormatting.useAsTooltip ? "translate-x-3.5" : "translate-x-0"
                                          )}
                                        />
                                      </button>
                                    </div>
                                    <div className="flex items-center justify-between text-slate-650">
                                      <span className="font-semibold">Allow Q&A</span>
                                      <button
                                        type="button"
                                        onClick={() => updatePageFormatting({ allowQA: !activePageFormatting.allowQA })}
                                        className={cn(
                                          "relative inline-flex h-4.5 w-8 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                                          activePageFormatting.allowQA ? "bg-[#118d95]" : "bg-slate-300"
                                        )}
                                      >
                                        <span
                                          className={cn(
                                            "pointer-events-none inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                                            activePageFormatting.allowQA ? "translate-x-3.5" : "translate-x-0"
                                          )}
                                        />
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* 2. Canvas Settings Group */}
                            {matchesSearch("Canvas settings") && (
                              <div className="border-b border-slate-200 bg-white">
                                <div
                                  className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-slate-50"
                                  onClick={() => togglePageGroup("canvas-settings")}
                                >
                                  <span className="flex items-center gap-1.5 font-bold text-slate-700">
                                    {expandedPageGroups["canvas-settings"] ? (
                                      <ChevronDown className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                                    ) : (
                                      <ChevronRight className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                                    )}
                                    Canvas settings
                                  </span>
                                </div>
                                {expandedPageGroups["canvas-settings"] && (
                                  <div className="px-5 py-2.5 space-y-3 bg-slate-50/50 border-t border-slate-100">
                                    <div className="space-y-1">
                                      <span className="font-bold text-slate-600 block">Type</span>
                                      <select
                                        value={activePageFormatting.canvasSettings.type}
                                        onChange={(e) => handleCanvasTypeChange(e.target.value)}
                                        className="h-7 w-full rounded border border-slate-300 bg-white text-[10px] px-1 outline-none text-slate-800 focus:border-[#118d95]"
                                      >
                                        <option value="16:9">16:9</option>
                                        <option value="4:3">4:3</option>
                                        <option value="Letter">Letter</option>
                                        <option value="Tooltip">Tooltip</option>
                                        <option value="Custom">Custom</option>
                                      </select>
                                    </div>
                                    <div className="space-y-1">
                                      <span className="font-bold text-slate-600 block">Width (px)</span>
                                      <Input
                                        type="number"
                                        disabled={activePageFormatting.canvasSettings.type !== "Custom"}
                                        value={localCanvasWidth}
                                        onChange={(e) => setLocalCanvasWidth(Number(e.target.value))}
                                        onBlur={() => updatePageFormatting({
                                          canvasSettings: {
                                            ...activePageFormatting.canvasSettings,
                                            width: localCanvasWidth
                                          }
                                        })}
                                        onKeyDown={(e) => {
                                          if (e.key === "Enter") updatePageFormatting({
                                            canvasSettings: {
                                              ...activePageFormatting.canvasSettings,
                                              width: localCanvasWidth
                                            }
                                          });
                                        }}
                                        className="h-7 text-[10px] bg-white border-slate-300 rounded focus:border-[#118d95] py-0.5 px-2 outline-none text-slate-800 disabled:bg-slate-100 disabled:text-slate-500"
                                      />
                                    </div>
                                    <div className="space-y-1">
                                      <span className="font-bold text-slate-600 block">Height (px)</span>
                                      <Input
                                        type="number"
                                        disabled={activePageFormatting.canvasSettings.type !== "Custom"}
                                        value={localCanvasHeight}
                                        onChange={(e) => setLocalCanvasHeight(Number(e.target.value))}
                                        onBlur={() => updatePageFormatting({
                                          canvasSettings: {
                                            ...activePageFormatting.canvasSettings,
                                            height: localCanvasHeight
                                          }
                                        })}
                                        onKeyDown={(e) => {
                                          if (e.key === "Enter") updatePageFormatting({
                                            canvasSettings: {
                                              ...activePageFormatting.canvasSettings,
                                              height: localCanvasHeight
                                            }
                                          });
                                        }}
                                        className="h-7 text-[10px] bg-white border-slate-300 rounded focus:border-[#118d95] py-0.5 px-2 outline-none text-slate-800 disabled:bg-slate-100 disabled:text-slate-500"
                                      />
                                    </div>
                                    <div className="space-y-1">
                                      <span className="font-bold text-slate-600 block">Vertical alignment</span>
                                      <select
                                        value={activePageFormatting.canvasSettings.verticalAlignment}
                                        onChange={(e) => updatePageFormatting({
                                          canvasSettings: {
                                            ...activePageFormatting.canvasSettings,
                                            verticalAlignment: e.target.value
                                          }
                                        })}
                                        className="h-7 w-full rounded border border-slate-300 bg-white text-[10px] px-1 outline-none text-slate-850 focus:border-[#118d95]"
                                      >
                                        <option value="Top">Top</option>
                                        <option value="Middle">Middle</option>
                                      </select>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* 3. Canvas Background Group */}
                            {matchesSearch("Canvas background") && (
                              <div className="border-b border-slate-200 bg-white">
                                <div
                                  className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-slate-50"
                                  onClick={() => togglePageGroup("canvas-background")}
                                >
                                  <span className="flex items-center gap-1.5 font-bold text-slate-700">
                                    {expandedPageGroups["canvas-background"] ? (
                                      <ChevronDown className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                                    ) : (
                                      <ChevronRight className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                                    )}
                                    Canvas background
                                  </span>
                                </div>
                                {expandedPageGroups["canvas-background"] && (
                                  <div className="px-5 py-2.5 space-y-3.5 bg-slate-50/50 border-t border-slate-100">
                                    <div className="flex items-center justify-between gap-4">
                                      <span className="font-bold text-slate-600 block">Color</span>
                                      <div className="flex items-center gap-1.5">
                                        <input
                                          type="color"
                                          value={activePageFormatting.canvasBackground.color}
                                          onChange={(e) => updatePageFormatting({
                                            canvasBackground: {
                                              ...activePageFormatting.canvasBackground,
                                              color: e.target.value
                                            }
                                          })}
                                          className="w-8 h-6 border border-slate-300 rounded cursor-pointer p-0.5 bg-white focus:outline-none"
                                        />
                                        <span className="font-mono text-[9px] text-slate-500 uppercase">{activePageFormatting.canvasBackground.color}</span>
                                      </div>
                                    </div>
                                    <div className="space-y-1">
                                      <span className="font-bold text-slate-600 block">Image URL</span>
                                      <Input
                                        value={localCanvasBgUrl}
                                        onChange={(e) => setLocalCanvasBgUrl(e.target.value)}
                                        onBlur={() => updatePageFormatting({
                                          canvasBackground: {
                                            ...activePageFormatting.canvasBackground,
                                            imageUrl: localCanvasBgUrl
                                          }
                                        })}
                                        onKeyDown={(e) => {
                                          if (e.key === "Enter") updatePageFormatting({
                                            canvasBackground: {
                                              ...activePageFormatting.canvasBackground,
                                              imageUrl: localCanvasBgUrl
                                            }
                                          });
                                        }}
                                        placeholder="https://example.com/image.png"
                                        className="h-7 text-[10px] bg-white border-slate-300 rounded focus:border-[#118d95] py-0.5 px-2 outline-none text-slate-800"
                                      />
                                    </div>
                                    {activePageFormatting.canvasBackground.imageUrl && (
                                      <div className="space-y-1">
                                        <span className="font-bold text-slate-600 block">Image fit</span>
                                        <select
                                          value={activePageFormatting.canvasBackground.imageFit}
                                          onChange={(e) => updatePageFormatting({
                                            canvasBackground: {
                                              ...activePageFormatting.canvasBackground,
                                              imageFit: e.target.value
                                            }
                                          })}
                                          className="h-7 w-full rounded border border-slate-300 bg-white text-[10px] px-1 outline-none text-slate-800 focus:border-[#118d95]"
                                        >
                                          <option value="Fit">Fit</option>
                                          <option value="Fill">Fill</option>
                                          <option value="Normal">Normal</option>
                                        </select>
                                      </div>
                                    )}
                                    <div className="space-y-1">
                                      <div className="flex justify-between text-slate-600 font-bold">
                                        <span>Transparency</span>
                                        <span>{activePageFormatting.canvasBackground.transparency}%</span>
                                      </div>
                                      <input
                                        type="range"
                                        min="0"
                                        max="100"
                                        value={activePageFormatting.canvasBackground.transparency}
                                        onChange={(e) => updatePageFormatting({
                                          canvasBackground: {
                                            ...activePageFormatting.canvasBackground,
                                            transparency: Number(e.target.value)
                                          }
                                        })}
                                        className="w-full accent-[#118d95]"
                                      />
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* 4. Wallpaper Group */}
                            {matchesSearch("Wallpaper") && (
                              <div className="border-b border-slate-200 bg-white">
                                <div
                                  className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-slate-50"
                                  onClick={() => togglePageGroup("wallpaper")}
                                >
                                  <span className="flex items-center gap-1.5 font-bold text-slate-700">
                                    {expandedPageGroups["wallpaper"] ? (
                                      <ChevronDown className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                                    ) : (
                                      <ChevronRight className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                                    )}
                                    Wallpaper
                                  </span>
                                </div>
                                {expandedPageGroups["wallpaper"] && (
                                  <div className="px-5 py-2.5 space-y-3.5 bg-slate-50/50 border-t border-slate-100">
                                    <div className="flex items-center justify-between gap-4">
                                      <span className="font-bold text-slate-600 block">Color</span>
                                      <div className="flex items-center gap-1.5">
                                        <input
                                          type="color"
                                          value={activePageFormatting.wallpaper.color}
                                          onChange={(e) => updatePageFormatting({
                                            wallpaper: {
                                              ...activePageFormatting.wallpaper,
                                              color: e.target.value
                                            }
                                          })}
                                          className="w-8 h-6 border border-slate-300 rounded cursor-pointer p-0.5 bg-white focus:outline-none"
                                        />
                                        <span className="font-mono text-[9px] text-slate-500 uppercase">{activePageFormatting.wallpaper.color}</span>
                                      </div>
                                    </div>
                                    <div className="space-y-1">
                                      <span className="font-bold text-slate-600 block">Image URL</span>
                                      <Input
                                        value={localWallpaperUrl}
                                        onChange={(e) => setLocalWallpaperUrl(e.target.value)}
                                        onBlur={() => updatePageFormatting({
                                          wallpaper: {
                                            ...activePageFormatting.wallpaper,
                                            imageUrl: localWallpaperUrl
                                          }
                                        })}
                                        onKeyDown={(e) => {
                                          if (e.key === "Enter") updatePageFormatting({
                                            wallpaper: {
                                              ...activePageFormatting.wallpaper,
                                              imageUrl: localWallpaperUrl
                                            }
                                          });
                                        }}
                                        placeholder="https://example.com/wallpaper.png"
                                        className="h-7 text-[10px] bg-white border-slate-300 rounded focus:border-[#118d95] py-0.5 px-2 outline-none text-slate-800"
                                      />
                                    </div>
                                    {activePageFormatting.wallpaper.imageUrl && (
                                      <div className="space-y-1">
                                        <span className="font-bold text-slate-600 block">Image fit</span>
                                        <select
                                          value={activePageFormatting.wallpaper.imageFit}
                                          onChange={(e) => updatePageFormatting({
                                            wallpaper: {
                                              ...activePageFormatting.wallpaper,
                                              imageFit: e.target.value
                                            }
                                          })}
                                          className="h-7 w-full rounded border border-slate-300 bg-white text-[10px] px-1 outline-none text-slate-800 focus:border-[#118d95]"
                                        >
                                          <option value="Fit">Fit</option>
                                          <option value="Fill">Fill</option>
                                          <option value="Normal">Normal</option>
                                        </select>
                                      </div>
                                    )}
                                    <div className="space-y-1">
                                      <div className="flex justify-between text-slate-600 font-bold">
                                        <span>Transparency</span>
                                        <span>{activePageFormatting.wallpaper.transparency}%</span>
                                      </div>
                                      <input
                                        type="range"
                                        min="0"
                                        max="100"
                                        value={activePageFormatting.wallpaper.transparency}
                                        onChange={(e) => updatePageFormatting({
                                          wallpaper: {
                                            ...activePageFormatting.wallpaper,
                                            transparency: Number(e.target.value)
                                          }
                                        })}
                                        className="w-full accent-[#118d95]"
                                      />
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* 5. Filter Pane Group (Placeholder) */}
                            {matchesSearch("Filter pane") && (
                              <div className="border-b border-slate-200 bg-white">
                                <div
                                  className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-slate-50"
                                  onClick={() => togglePageGroup("filter-pane")}
                                >
                                  <span className="flex items-center gap-1.5 font-bold text-slate-700">
                                    {expandedPageGroups["filter-pane"] ? (
                                      <ChevronDown className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                                    ) : (
                                      <ChevronRight className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                                    )}
                                    Filter pane
                                  </span>
                                </div>
                                {expandedPageGroups["filter-pane"] && (
                                  <div className="px-5 py-4 text-center text-slate-400 bg-slate-50/50 border-t border-slate-100 italic text-[10px]">
                                    Filter pane formatting settings are automatically optimized for desktop layout.
                                  </div>
                                )}
                              </div>
                            )}

                            {/* 6. Filter Cards Group (Placeholder) */}
                            {matchesSearch("Filter cards") && (
                              <div className="border-b border-slate-200 bg-white">
                                <div
                                  className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-slate-50"
                                  onClick={() => togglePageGroup("filter-cards")}
                                >
                                  <span className="flex items-center gap-1.5 font-bold text-slate-700">
                                    {expandedPageGroups["filter-cards"] ? (
                                      <ChevronDown className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                                    ) : (
                                      <ChevronRight className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                                    )}
                                    Filter cards
                                  </span>
                                </div>
                                {expandedPageGroups["filter-cards"] && (
                                  <div className="px-5 py-4 text-center text-slate-400 bg-slate-50/50 border-t border-slate-100 italic text-[10px]">
                                    Filter card formatting and colors are synced with the active theme settings.
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      ) : (
                        <>
                          {/* Visual / General Subtabs */}
                          <div className="flex border-b border-[#cbd5e1] mt-2 px-3 gap-2 bg-white">
                        <button
                          onClick={() => setFormatSubTab("visual")}
                          className={cn(
                            "pb-1.5 px-2 text-[11px] font-bold border-b-2 transition-colors",
                            formatSubTab === "visual"
                              ? "border-[#118d95] text-slate-900"
                              : "border-transparent text-slate-500 hover:text-black"
                          )}
                        >
                          Visual
                        </button>
                        <button
                          onClick={() => setFormatSubTab("general")}
                          className={cn(
                            "pb-1.5 px-2 text-[11px] font-bold border-b-2 transition-colors",
                            formatSubTab === "general"
                              ? "border-[#118d95] text-slate-900"
                              : "border-transparent text-slate-500 hover:text-black"
                          )}
                        >
                          General
                        </button>
                      </div>

                      {formatSubTab === "visual" ? (
                        <div className="divide-y divide-slate-200">
                          {/* Y-Axis Group */}
                          {matchesSearch("Y-axis") && (
                            <div className="border-b border-slate-200 bg-white">
                              <div
                                className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-slate-50"
                                onClick={() => toggleFormatGroup("y-axis")}
                              >
                                <span className="flex items-center gap-1.5 font-bold text-slate-700">
                                  {expandedFormatGroups["y-axis"] ? (
                                    <ChevronDown className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                                  ) : (
                                    <ChevronRight className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                                  )}
                                  Y-axis
                                </span>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setFormatOptions((prev) => ({ ...prev, showYAxis: !prev.showYAxis }));
                                  }}
                                  className={cn(
                                    "relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                                    formatOptions.showYAxis ? "bg-[#118d95]" : "bg-slate-300"
                                  )}
                                >
                                  <span
                                    className={cn(
                                      "pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                                      formatOptions.showYAxis ? "translate-x-3" : "translate-x-0"
                                    )}
                                  />
                                </button>
                              </div>
                              {expandedFormatGroups["y-axis"] && (
                                <div className="px-6 py-2.5 space-y-3.5 bg-slate-50/50 border-t border-slate-100 text-[11px]">
                                  {/* Values section */}
                                  <div className="space-y-1.5">
                                    <span className="font-bold text-slate-700">Values</span>
                                    <div className="grid grid-cols-2 gap-1.5">
                                      <select
                                        value={formatOptions.yAxisFontFamily}
                                        onChange={(e) => setFormatOptions((prev) => ({ ...prev, yAxisFontFamily: e.target.value }))}
                                        className="h-7 rounded border border-slate-300 bg-white text-[10px] px-1 outline-none text-slate-800"
                                      >
                                        {["Arial", "Segoe UI", "Calibri", "Courier New", "Georgia"].map(font => (
                                          <option key={font} value={font}>{font}</option>
                                        ))}
                                      </select>
                                      <input
                                        type="number"
                                        min={6}
                                        max={24}
                                        value={formatOptions.yAxisFontSize}
                                        onChange={(e) => setFormatOptions((prev) => ({ ...prev, yAxisFontSize: Number(e.target.value) }))}
                                        className="h-7 rounded border border-slate-300 bg-white text-[10px] px-1 outline-none text-slate-800"
                                      />
                                    </div>
                                    <div className="flex gap-1">
                                      <div className="flex rounded border border-slate-300 overflow-hidden divide-x divide-slate-200 flex-1">
                                        <button
                                          type="button"
                                          onClick={() => setFormatOptions(prev => ({ ...prev, yAxisBold: !prev.yAxisBold }))}
                                          className={cn("flex-1 py-0.5 font-bold text-center text-[10px]", formatOptions.yAxisBold ? "bg-slate-200 text-black" : "bg-white text-slate-500")}
                                        >
                                          B
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => setFormatOptions(prev => ({ ...prev, yAxisItalic: !prev.yAxisItalic }))}
                                          className={cn("flex-1 py-0.5 italic text-center text-[10px]", formatOptions.yAxisItalic ? "bg-slate-200 text-black" : "bg-white text-slate-500")}
                                        >
                                          I
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => setFormatOptions(prev => ({ ...prev, yAxisUnderline: !prev.yAxisUnderline }))}
                                          className={cn("flex-1 py-0.5 underline text-center text-[10px]", formatOptions.yAxisUnderline ? "bg-slate-200 text-black" : "bg-white text-slate-500")}
                                        >
                                          U
                                        </button>
                                      </div>
                                      <input
                                        type="color"
                                        value={formatOptions.yAxisColor}
                                        onChange={(e) => setFormatOptions(prev => ({ ...prev, yAxisColor: e.target.value }))}
                                        className="w-8 h-7 p-0.5 border border-slate-300 bg-white rounded cursor-pointer shrink-0"
                                      />
                                    </div>
                                  </div>

                                  {/* Title section */}
                                  <div className="space-y-2 border-t border-slate-200 pt-2">
                                    <div className="flex items-center justify-between">
                                      <span className="font-bold text-slate-700">Title</span>
                                      <button
                                        type="button"
                                        onClick={() => setFormatOptions((prev) => ({ ...prev, showYAxisTitle: !prev.showYAxisTitle }))}
                                        className={cn(
                                          "relative inline-flex h-3.5 w-6 shrink-0 cursor-pointer rounded-full border border-transparent transition-colors focus:outline-none",
                                          formatOptions.showYAxisTitle ? "bg-[#118d95]" : "bg-slate-300"
                                        )}
                                      >
                                        <span
                                          className={cn(
                                            "pointer-events-none inline-block h-2.5 w-2.5 transform rounded-full bg-white shadow transition",
                                            formatOptions.showYAxisTitle ? "translate-x-2.5" : "translate-x-0"
                                          )}
                                        />
                                      </button>
                                    </div>
                                    {formatOptions.showYAxisTitle && (
                                      <Input
                                        value={formatOptions.yAxisTitleText}
                                        onChange={(e) => setFormatOptions((prev) => ({ ...prev, yAxisTitleText: e.target.value }))}
                                        placeholder="Auto"
                                        className="h-7 text-[10px] bg-white border-slate-300 rounded"
                                      />
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}

                          {/* X-Axis Group */}
                          {matchesSearch("X-axis") && (
                            <div className="border-b border-slate-200 bg-white">
                              <div
                                className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-slate-50"
                                onClick={() => toggleFormatGroup("x-axis")}
                              >
                                <span className="flex items-center gap-1.5 font-bold text-slate-700">
                                  {expandedFormatGroups["x-axis"] ? (
                                    <ChevronDown className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                                  ) : (
                                    <ChevronRight className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                                  )}
                                  X-axis
                                </span>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setFormatOptions((prev) => ({ ...prev, showXAxis: !prev.showXAxis }));
                                  }}
                                  className={cn(
                                    "relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                                    formatOptions.showXAxis ? "bg-[#118d95]" : "bg-slate-300"
                                  )}
                                >
                                  <span
                                    className={cn(
                                      "pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                                      formatOptions.showXAxis ? "translate-x-3" : "translate-x-0"
                                    )}
                                  />
                                </button>
                              </div>
                              {expandedFormatGroups["x-axis"] && (
                                <div className="px-6 py-2.5 space-y-3.5 bg-slate-50/50 border-t border-slate-100 text-[11px]">
                                  {/* Values section */}
                                  <div className="space-y-1.5">
                                    <span className="font-bold text-slate-700">Values</span>
                                    <div className="grid grid-cols-2 gap-1.5">
                                      <select
                                        value={formatOptions.xAxisFontFamily}
                                        onChange={(e) => setFormatOptions((prev) => ({ ...prev, xAxisFontFamily: e.target.value }))}
                                        className="h-7 rounded border border-slate-300 bg-white text-[10px] px-1 outline-none text-slate-800"
                                      >
                                        {["Arial", "Segoe UI", "Calibri", "Courier New", "Georgia"].map(font => (
                                          <option key={font} value={font}>{font}</option>
                                        ))}
                                      </select>
                                      <input
                                        type="number"
                                        min={6}
                                        max={24}
                                        value={formatOptions.xAxisFontSize}
                                        onChange={(e) => setFormatOptions((prev) => ({ ...prev, xAxisFontSize: Number(e.target.value) }))}
                                        className="h-7 rounded border border-slate-300 bg-white text-[10px] px-1 outline-none text-slate-800"
                                      />
                                    </div>
                                    <div className="flex gap-1">
                                      <div className="flex rounded border border-slate-300 overflow-hidden divide-x divide-slate-200 flex-1">
                                        <button
                                          type="button"
                                          onClick={() => setFormatOptions(prev => ({ ...prev, xAxisBold: !prev.xAxisBold }))}
                                          className={cn("flex-1 py-0.5 font-bold text-center text-[10px]", formatOptions.xAxisBold ? "bg-slate-200 text-black" : "bg-white text-slate-500")}
                                        >
                                          B
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => setFormatOptions(prev => ({ ...prev, xAxisItalic: !prev.xAxisItalic }))}
                                          className={cn("flex-1 py-0.5 italic text-center text-[10px]", formatOptions.xAxisItalic ? "bg-slate-200 text-black" : "bg-white text-slate-500")}
                                        >
                                          I
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => setFormatOptions(prev => ({ ...prev, xAxisUnderline: !prev.xAxisUnderline }))}
                                          className={cn("flex-1 py-0.5 underline text-center text-[10px]", formatOptions.xAxisUnderline ? "bg-slate-200 text-black" : "bg-white text-slate-500")}
                                        >
                                          U
                                        </button>
                                      </div>
                                      <input
                                        type="color"
                                        value={formatOptions.xAxisColor}
                                        onChange={(e) => setFormatOptions(prev => ({ ...prev, xAxisColor: e.target.value }))}
                                        className="w-8 h-7 p-0.5 border border-slate-300 bg-white rounded cursor-pointer shrink-0"
                                      />
                                    </div>
                                  </div>

                                  {/* Title section */}
                                  <div className="space-y-2 border-t border-slate-200 pt-2">
                                    <div className="flex items-center justify-between">
                                      <span className="font-bold text-slate-700">Title</span>
                                      <button
                                        type="button"
                                        onClick={() => setFormatOptions((prev) => ({ ...prev, showXAxisTitle: !prev.showXAxisTitle }))}
                                        className={cn(
                                          "relative inline-flex h-3.5 w-6 shrink-0 cursor-pointer rounded-full border border-transparent transition-colors focus:outline-none",
                                          formatOptions.showXAxisTitle ? "bg-[#118d95]" : "bg-slate-300"
                                        )}
                                      >
                                        <span
                                          className={cn(
                                            "pointer-events-none inline-block h-2.5 w-2.5 transform rounded-full bg-white shadow transition",
                                            formatOptions.showXAxisTitle ? "translate-x-2.5" : "translate-x-0"
                                          )}
                                        />
                                      </button>
                                    </div>
                                    {formatOptions.showXAxisTitle && (
                                      <Input
                                        value={formatOptions.xAxisTitleText}
                                        onChange={(e) => setFormatOptions((prev) => ({ ...prev, xAxisTitleText: e.target.value }))}
                                        placeholder="Auto"
                                        className="h-7 text-[10px] bg-white border-slate-300 rounded"
                                      />
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Legend Group */}
                          {matchesSearch("Legend") && (
                            <div className="border-b border-slate-200 bg-white">
                              <div
                                className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-slate-50"
                                onClick={() => toggleFormatGroup("legend")}
                              >
                                <span className="flex items-center gap-1.5 font-bold text-slate-700">
                                  {expandedFormatGroups["legend"] ? (
                                    <ChevronDown className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                                  ) : (
                                    <ChevronRight className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                                  )}
                                  Legend
                                </span>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setFormatOptions((prev) => ({ ...prev, showLegend: !prev.showLegend }));
                                  }}
                                  className={cn(
                                    "relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                                    formatOptions.showLegend ? "bg-[#118d95]" : "bg-slate-300"
                                  )}
                                >
                                  <span
                                    className={cn(
                                      "pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                                      formatOptions.showLegend ? "translate-x-3" : "translate-x-0"
                                    )}
                                  />
                                </button>
                              </div>
                              {expandedFormatGroups["legend"] && (
                                <div className="px-6 py-2.5 space-y-3.5 bg-slate-50/50 border-t border-slate-100 text-[11px] text-slate-600">
                                  <div className="space-y-1">
                                    <span className="font-bold text-slate-700">Position</span>
                                    <select
                                      value={formatOptions.legendPosition}
                                      onChange={(e) => setFormatOptions((prev) => ({ ...prev, legendPosition: e.target.value }))}
                                      className="h-7 w-full rounded border border-slate-300 bg-white text-[10px] px-1 outline-none text-slate-800"
                                    >
                                      <option value="top">Top Center</option>
                                      <option value="bottom">Bottom Center</option>
                                      <option value="left">Left Vertical</option>
                                      <option value="right">Right Vertical</option>
                                    </select>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Small Multiples Group */}
                          {matchesSearch("Small multiples") && (
                            <div className="border-b border-slate-200 bg-white">
                              <div
                                className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-slate-50"
                                onClick={() => toggleFormatGroup("small-multiples")}
                              >
                                <span className="flex items-center gap-1.5 font-bold text-slate-700">
                                  {expandedFormatGroups["small-multiples"] ? (
                                    <ChevronDown className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                                  ) : (
                                    <ChevronRight className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                                  )}
                                  Small multiples
                                </span>
                              </div>
                              {expandedFormatGroups["small-multiples"] && (
                                <div className="px-6 py-2.5 bg-slate-50/50 border-t border-slate-100 text-[10px] text-slate-505 leading-normal">
                                  Splits visual charts into a multi-column layout grid based on the categories dropped into the Small multiples drop-zone.
                                </div>
                              )}
                            </div>
                          )}

                          {/* Gridlines Group */}
                          {matchesSearch("Gridlines") && (
                            <div className="border-b border-slate-200 bg-white">
                              <div
                                className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-slate-50"
                                onClick={() => toggleFormatGroup("gridlines")}
                              >
                                <span className="flex items-center gap-1.5 font-bold text-slate-700">
                                  {expandedFormatGroups["gridlines"] ? (
                                    <ChevronDown className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                                  ) : (
                                    <ChevronRight className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                                  )}
                                  Gridlines
                                </span>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setFormatOptions((prev) => ({ ...prev, showGridlines: !prev.showGridlines }));
                                  }}
                                  className={cn(
                                    "relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                                    formatOptions.showGridlines ? "bg-[#118d95]" : "bg-slate-300"
                                  )}
                                >
                                  <span
                                    className={cn(
                                      "pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                                      formatOptions.showGridlines ? "translate-x-3" : "translate-x-0"
                                    )}
                                  />
                                </button>
                              </div>
                              {expandedFormatGroups["gridlines"] && (
                                <div className="px-6 py-2.5 space-y-3 bg-slate-50/50 border-t border-slate-100 text-[11px] text-slate-600">
                                  <div className="space-y-1">
                                    <span className="font-bold text-slate-700">Style</span>
                                    <select
                                      value={formatOptions.gridlineStyle}
                                      onChange={(e) => setFormatOptions((prev) => ({ ...prev, gridlineStyle: e.target.value }))}
                                      className="h-7 w-full rounded border border-slate-300 bg-white text-[10px] px-1 outline-none text-slate-800"
                                    >
                                      <option value="3 3">Dashed</option>
                                      <option value="1 1">Dotted</option>
                                      <option value="0">Solid</option>
                                    </select>
                                  </div>
                                  <div className="space-y-1">
                                    <span className="font-bold text-slate-700">Color</span>
                                    <div className="flex gap-1.5 items-center">
                                      <input
                                        type="color"
                                        value={formatOptions.gridlineColor.startsWith("rgba") ? "#cbd5e1" : formatOptions.gridlineColor}
                                        onChange={(e) => setFormatOptions(prev => ({ ...prev, gridlineColor: e.target.value }))}
                                        className="w-8 h-7 p-0.5 border border-slate-300 bg-white rounded cursor-pointer shrink-0"
                                      />
                                      <span className="text-[10px] text-slate-400 font-mono">{formatOptions.gridlineColor}</span>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Zoom Slider Group */}
                          {matchesSearch("Zoom slider") && (
                            <div className="border-b border-slate-200 bg-white">
                              <div
                                className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-slate-50"
                                onClick={() => toggleFormatGroup("zoom-slider")}
                              >
                                <span className="flex items-center gap-1.5 font-bold text-slate-700">
                                  {expandedFormatGroups["zoom-slider"] ? (
                                    <ChevronDown className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                                  ) : (
                                    <ChevronRight className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                                  )}
                                  Zoom slider
                                </span>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setFormatOptions((prev) => ({ ...prev, showZoomSlider: !prev.showZoomSlider }));
                                  }}
                                  className={cn(
                                    "relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                                    formatOptions.showZoomSlider ? "bg-[#118d95]" : "bg-slate-300"
                                  )}
                                >
                                  <span
                                    className={cn(
                                      "pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                                      formatOptions.showZoomSlider ? "translate-x-3" : "translate-x-0"
                                    )}
                                  />
                                </button>
                              </div>
                              {expandedFormatGroups["zoom-slider"] && (
                                <div className="px-6 py-2.5 bg-slate-50/50 border-t border-slate-100 text-[10px] text-slate-500 leading-normal">
                                  Adds interactive slider brushes below the X-axis to dynamically zoom and navigate dense time-series chart categories.
                                </div>
                              )}
                            </div>
                          )}

                          {/* Bars Group */}
                          {matchesSearch("Bars") && (
                            <div className="border-b border-slate-200 bg-white">
                              <div
                                className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-slate-50"
                                onClick={() => toggleFormatGroup("bars")}
                              >
                                <span className="flex items-center gap-1.5 font-bold text-slate-700">
                                  {expandedFormatGroups["bars"] ? (
                                    <ChevronDown className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                                  ) : (
                                    <ChevronRight className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                                  )}
                                  Bars
                                </span>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setFormatOptions((prev) => ({ ...prev, showBars: !prev.showBars }));
                                  }}
                                  className={cn(
                                    "relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                                    formatOptions.showBars ? "bg-[#118d95]" : "bg-slate-300"
                                  )}
                                >
                                  <span
                                    className={cn(
                                      "pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                                      formatOptions.showBars ? "translate-x-3" : "translate-x-0"
                                    )}
                                  />
                                </button>
                              </div>
                              {expandedFormatGroups["bars"] && (
                                <div className="px-6 py-2.5 space-y-3.5 bg-slate-50/50 border-t border-slate-100 text-[11px] text-slate-600">
                                  <div className="space-y-1">
                                    <span className="font-bold text-slate-700">Bar Color</span>
                                    <div className="flex gap-1.5 items-center">
                                      <input
                                        type="color"
                                        value={formatOptions.barsColor}
                                        onChange={(e) => setFormatOptions(prev => ({ ...prev, barsColor: e.target.value }))}
                                        className="w-8 h-7 p-0.5 border border-slate-300 bg-white rounded cursor-pointer shrink-0"
                                      />
                                      <span className="text-[10px] text-slate-400 font-mono">{formatOptions.barsColor}</span>
                                    </div>
                                  </div>
                                  <div className="space-y-1">
                                    <span className="font-bold text-slate-700 flex justify-between">
                                      <span>Spacing / Padding</span>
                                      <span className="font-mono text-[10px]">{Math.round(formatOptions.barsPadding * 100)}%</span>
                                    </span>
                                    <input
                                      type="range"
                                      min={0}
                                      max={0.5}
                                      step={0.05}
                                      value={formatOptions.barsPadding}
                                      onChange={(e) => setFormatOptions(prev => ({ ...prev, barsPadding: Number(e.target.value) }))}
                                      className="w-full h-1 accent-[#118d95] cursor-pointer"
                                    />
                                  </div>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Ribbons Group */}
                          {matchesSearch("Ribbons") && (
                            <div className="border-b border-slate-200 bg-white">
                              <div
                                className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-slate-50"
                                onClick={() => toggleFormatGroup("ribbons")}
                              >
                                <span className="flex items-center gap-1.5 font-bold text-slate-700">
                                  {expandedFormatGroups["ribbons"] ? (
                                    <ChevronDown className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                                  ) : (
                                    <ChevronRight className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                                  )}
                                  Ribbons
                                </span>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setFormatOptions((prev) => ({ ...prev, showRibbons: !prev.showRibbons }));
                                  }}
                                  className={cn(
                                    "relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                                    formatOptions.showRibbons ? "bg-[#118d95]" : "bg-slate-300"
                                  )}
                                >
                                  <span
                                    className={cn(
                                      "pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                                      formatOptions.showRibbons ? "translate-x-3" : "translate-x-0"
                                    )}
                                  />
                                </button>
                              </div>
                              {expandedFormatGroups["ribbons"] && (
                                <div className="px-6 py-2.5 bg-slate-50/50 border-t border-slate-100 text-[10px] text-slate-500 leading-normal">
                                  Highlights ribbon connections across stacked categories. Only active on ribbons or stacked charts.
                                </div>
                              )}
                            </div>
                          )}

                          {/* Data Labels Group */}
                          {matchesSearch("Data labels") && (
                            <div className="border-b border-slate-200 bg-white">
                              <div
                                className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-slate-50"
                                onClick={() => toggleFormatGroup("data-labels")}
                              >
                                <span className="flex items-center gap-1.5 font-bold text-slate-700">
                                  {expandedFormatGroups["data-labels"] ? (
                                    <ChevronDown className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                                  ) : (
                                    <ChevronRight className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                                  )}
                                  Data labels
                                </span>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setFormatOptions((prev) => ({ ...prev, showDataLabels: !prev.showDataLabels }));
                                  }}
                                  className={cn(
                                    "relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                                    formatOptions.showDataLabels ? "bg-[#118d95]" : "bg-slate-300"
                                  )}
                                >
                                  <span
                                    className={cn(
                                      "pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                                      formatOptions.showDataLabels ? "translate-x-3" : "translate-x-0"
                                    )}
                                  />
                                </button>
                              </div>
                              {expandedFormatGroups["data-labels"] && (
                                <div className="px-6 py-2.5 space-y-3 bg-slate-50/50 border-t border-slate-100 text-[11px] text-slate-600">
                                  <div className="space-y-1">
                                    <span className="font-bold text-slate-700 flex justify-between">
                                      <span>Text Size</span>
                                      <span className="font-mono text-[10px]">{formatOptions.dataLabelsSize}pt</span>
                                    </span>
                                    <input
                                      type="range"
                                      min={6}
                                      max={16}
                                      value={formatOptions.dataLabelsSize}
                                      onChange={(e) => setFormatOptions(prev => ({ ...prev, dataLabelsSize: Number(e.target.value) }))}
                                      className="w-full h-1 accent-[#118d95] cursor-pointer"
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <span className="font-bold text-slate-700">Text Color</span>
                                    <div className="flex gap-1.5 items-center">
                                      <input
                                        type="color"
                                        value={formatOptions.dataLabelsColor}
                                        onChange={(e) => setFormatOptions(prev => ({ ...prev, dataLabelsColor: e.target.value }))}
                                        className="w-8 h-7 p-0.5 border border-slate-300 bg-white rounded cursor-pointer shrink-0"
                                      />
                                      <span className="text-[10px] text-slate-400 font-mono">{formatOptions.dataLabelsColor}</span>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Total Labels Group */}
                          {matchesSearch("Total labels") && (
                            <div className="border-b border-slate-200 bg-white">
                              <div
                                className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-slate-50"
                                onClick={() => toggleFormatGroup("total-labels")}
                              >
                                <span className="flex items-center gap-1.5 font-bold text-slate-700">
                                  {expandedFormatGroups["total-labels"] ? (
                                    <ChevronDown className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                                  ) : (
                                    <ChevronRight className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                                  )}
                                  Total labels
                                </span>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setFormatOptions((prev) => ({ ...prev, showTotalLabels: !prev.showTotalLabels }));
                                  }}
                                  className={cn(
                                    "relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                                    formatOptions.showTotalLabels ? "bg-[#118d95]" : "bg-slate-300"
                                  )}
                                >
                                  <span
                                    className={cn(
                                      "pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                                      formatOptions.showTotalLabels ? "translate-x-3" : "translate-x-0"
                                    )}
                                  />
                                </button>
                              </div>
                              {expandedFormatGroups["total-labels"] && (
                                <div className="px-6 py-2.5 bg-slate-50/50 border-t border-slate-100 text-[10px] text-slate-505 leading-normal">
                                  Displays a combined summation value tag atop stacked bars or areas.
                                </div>
                              )}
                            </div>
                          )}

                          {/* Plot Area Background Group */}
                          {matchesSearch("Plot area background") && (
                            <div className="border-b border-slate-200 bg-white">
                              <div
                                className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-slate-50"
                                onClick={() => toggleFormatGroup("plot-area-bg")}
                              >
                                <span className="flex items-center gap-1.5 font-bold text-slate-700">
                                  {expandedFormatGroups["plot-area-bg"] ? (
                                    <ChevronDown className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                                  ) : (
                                    <ChevronRight className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                                  )}
                                  Plot area background
                                </span>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setFormatOptions((prev) => ({ ...prev, showPlotAreaBg: !prev.showPlotAreaBg }));
                                  }}
                                  className={cn(
                                    "relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                                    formatOptions.showPlotAreaBg ? "bg-[#118d95]" : "bg-slate-300"
                                  )}
                                >
                                  <span
                                    className={cn(
                                      "pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                                      formatOptions.showPlotAreaBg ? "translate-x-3" : "translate-x-0"
                                    )}
                                  />
                                </button>
                              </div>
                              {expandedFormatGroups["plot-area-bg"] && (
                                <div className="px-6 py-2.5 space-y-3 bg-slate-50/50 border-t border-slate-100 text-[11px] text-slate-600">
                                  <div className="space-y-1">
                                    <span className="font-bold text-slate-700">Fill Color</span>
                                    <div className="flex gap-1.5 items-center">
                                      <input
                                        type="color"
                                        value={formatOptions.plotAreaBgColor}
                                        onChange={(e) => setFormatOptions(prev => ({ ...prev, plotAreaBgColor: e.target.value }))}
                                        className="w-8 h-7 p-0.5 border border-slate-300 bg-white rounded cursor-pointer shrink-0"
                                      />
                                      <span className="text-[10px] text-slate-400 font-mono">{formatOptions.plotAreaBgColor}</span>
                                    </div>
                                  </div>
                                  <div className="space-y-1">
                                    <span className="font-bold text-slate-700 flex justify-between">
                                      <span>Transparency</span>
                                      <span className="font-mono text-[10px]">{formatOptions.plotAreaBgTransparency}%</span>
                                    </span>
                                    <input
                                      type="range"
                                      min={0}
                                      max={100}
                                      step={1}
                                      value={formatOptions.plotAreaBgTransparency}
                                      onChange={(e) => setFormatOptions(prev => ({ ...prev, plotAreaBgTransparency: Number(e.target.value) }))}
                                      className="w-full h-1 accent-[#118d95] cursor-pointer"
                                    />
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ) : (
                        /* General Tab */
                        <div className="p-3.5 space-y-3.5">
                          <div className="space-y-1 bg-white border border-slate-200 rounded p-2.5 shadow-sm">
                            <span className="font-bold text-slate-700 block text-xs">General Options</span>
                            <p className="text-[10px] text-slate-450 leading-normal">Configure widget container header text and boundaries.</p>
                          </div>
                          
                          <div className="space-y-2 border border-slate-200 rounded bg-white p-3 shadow-sm">
                            <span className="font-bold text-slate-800 text-[11px] block">Title</span>
                            <div className="space-y-1.5">
                              <span className="text-[10px] text-slate-500">Text Title</span>
                              <Input
                                value={draft.title}
                                onChange={(e) => setDraft(curr => ({ ...curr, title: e.target.value }))}
                                className="h-7 text-[10px] bg-white border-slate-300 rounded"
                                placeholder="Widget title"
                              />
                            </div>
                          </div>

                          {/* CONDITIONAL FORMATTING CARD */}
                          <div className="border border-slate-200 rounded bg-white p-3 shadow-sm space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-slate-800 text-[11px] block">Conditional Formatting</span>
                              <button
                                type="button"
                                onClick={() => {
                                  setFormatOptions(prev => ({
                                    ...prev,
                                    conditionalFormattingEnabled: !prev.conditionalFormattingEnabled
                                  }));
                                }}
                                className={cn(
                                  "relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                                  formatOptions.conditionalFormattingEnabled ? "bg-[#118d95]" : "bg-slate-300"
                                )}
                              >
                                <span
                                  className={cn(
                                    "pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                                    formatOptions.conditionalFormattingEnabled ? "translate-x-3" : "translate-x-0"
                                  )}
                                />
                              </button>
                            </div>
                            
                            {formatOptions.conditionalFormattingEnabled && (
                              <div className="space-y-3 text-[10px] pt-1">
                                <div className="space-y-1">
                                  <span className="text-slate-500">Min Threshold Value</span>
                                  <Input
                                    type="number"
                                    value={formatOptions.conditionalMinThreshold ?? ""}
                                    onChange={(e) => setFormatOptions(prev => ({ ...prev, conditionalMinThreshold: e.target.value === "" ? undefined : Number(e.target.value) }))}
                                    placeholder="e.g. 500"
                                    className="h-7 text-[10px] bg-white border-slate-300 rounded"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <span className="text-slate-500">Min Threshold Color</span>
                                  <div className="flex gap-1.5 items-center">
                                    <input
                                      type="color"
                                      value={formatOptions.conditionalMinColor || "#ef4444"}
                                      onChange={(e) => setFormatOptions(prev => ({ ...prev, conditionalMinColor: e.target.value }))}
                                      className="w-8 h-7 p-0.5 border border-slate-300 bg-white rounded cursor-pointer shrink-0"
                                    />
                                    <span className="text-[10px] text-slate-400 font-mono">{formatOptions.conditionalMinColor || "#ef4444"}</span>
                                  </div>
                                </div>
                                
                                <div className="space-y-1 border-t border-slate-100 pt-2">
                                  <span className="text-slate-500">Max Threshold Value</span>
                                  <Input
                                    type="number"
                                    value={formatOptions.conditionalMaxThreshold ?? ""}
                                    onChange={(e) => setFormatOptions(prev => ({ ...prev, conditionalMaxThreshold: e.target.value === "" ? undefined : Number(e.target.value) }))}
                                    placeholder="e.g. 1000"
                                    className="h-7 text-[10px] bg-white border-slate-300 rounded"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <span className="text-slate-550">Max Threshold Color</span>
                                  <div className="flex gap-1.5 items-center">
                                    <input
                                      type="color"
                                      value={formatOptions.conditionalMaxColor || "#10b981"}
                                      onChange={(e) => setFormatOptions(prev => ({ ...prev, conditionalMaxColor: e.target.value }))}
                                      className="w-8 h-7 p-0.5 border border-slate-300 bg-white rounded cursor-pointer shrink-0"
                                    />
                                    <span className="text-[10px] text-slate-400 font-mono">{formatOptions.conditionalMaxColor || "#10b981"}</span>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

                  {activeVizTab === "analytics" && (
                    <div className="p-3.5 space-y-3.5 bg-[#f3f2f1] min-h-[400px]">
                      {/* Constant Line */}
                      <div className="border border-slate-200 rounded bg-white p-3 shadow-sm space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-850 text-[11px] block">X-Axis Constant Line</span>
                          <button
                            type="button"
                            onClick={() => setFormatOptions((prev) => ({ ...prev, showXConstantLine: !prev.showXConstantLine }))}
                            className={cn(
                              "relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                              formatOptions.showXConstantLine ? "bg-[#118d95]" : "bg-slate-300"
                            )}
                          >
                            <span
                              className={cn(
                                "pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                                formatOptions.showXConstantLine ? "translate-x-3" : "translate-x-0"
                              )}
                            />
                          </button>
                        </div>
                        {formatOptions.showXConstantLine && (
                          <div className="space-y-2.5 text-[10px] pt-1">
                            <div className="space-y-1">
                              <span className="text-slate-500">Constant Value (X coordinate)</span>
                              <Input
                                value={formatOptions.xConstantLineValue}
                                onChange={(e) => setFormatOptions((prev) => ({ ...prev, xConstantLineValue: e.target.value }))}
                                placeholder="e.g. category label"
                                className="h-7 text-[10px] bg-white border-slate-300 rounded"
                              />
                            </div>
                            <div className="space-y-1">
                              <span className="text-slate-500">Label text</span>
                              <Input
                                value={formatOptions.xConstantLineLabel}
                                onChange={(e) => setFormatOptions((prev) => ({ ...prev, xConstantLineLabel: e.target.value }))}
                                placeholder="Constant Line"
                                className="h-7 text-[10px] bg-white border-slate-300 rounded"
                              />
                            </div>
                            <div className="space-y-1">
                              <span className="text-slate-500">Line Color</span>
                              <div className="flex gap-1.5 items-center">
                                <input
                                  type="color"
                                  value={formatOptions.xConstantLineColor}
                                  onChange={(e) => setFormatOptions((prev) => ({ ...prev, xConstantLineColor: e.target.value }))}
                                  className="w-8 h-7 p-0.5 border border-slate-300 bg-white rounded cursor-pointer shrink-0"
                                />
                                <span className="text-[10px] text-slate-400 font-mono">{formatOptions.xConstantLineColor}</span>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Error Bars */}
                      <div className="border border-slate-200 rounded bg-white p-3 shadow-sm space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-850 text-[11px] block">Error Bars</span>
                          <button
                            type="button"
                            onClick={() => setFormatOptions((prev) => ({ ...prev, showErrorBars: !prev.showErrorBars }))}
                            className={cn(
                              "relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                              formatOptions.showErrorBars ? "bg-[#118d95]" : "bg-slate-300"
                            )}
                          >
                            <span
                              className={cn(
                                "pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                                formatOptions.showErrorBars ? "translate-x-3" : "translate-x-0"
                              )}
                            />
                          </button>
                        </div>
                        {formatOptions.showErrorBars && (
                          <div className="space-y-2.5 text-[10px] pt-1">
                            <div className="space-y-1">
                              <span className="text-slate-500 flex justify-between">
                                <span>Error Margin</span>
                                <span className="font-mono">{formatOptions.errorBarPercentage}%</span>
                              </span>
                              <input
                                type="range"
                                min={1}
                                max={25}
                                value={formatOptions.errorBarPercentage}
                                onChange={(e) => setFormatOptions(prev => ({ ...prev, errorBarPercentage: Number(e.target.value) }))}
                                className="w-full h-1 accent-[#118d95] cursor-pointer"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </section>
            ) : (
              <button
                onClick={() => setShowVisualizationsPane(true)}
                className="w-8 border-r border-slate-300 bg-[#f3f2f1] hover:bg-slate-200 flex flex-col items-center py-4 text-slate-600 text-[10px] font-bold gap-1 select-none"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                <span className="[writing-mode:vertical-lr] tracking-wider uppercase">Visualizations</span>
              </button>
            )}
          </div>

          {/* 3. DATA PANE */}
          <div className="flex">
            {showDataPane ? (
              <section className="w-[240px] flex flex-col bg-[#f3f2f1] border-r border-slate-300 text-xs">
                <div className="flex h-9 items-center justify-between border-b border-slate-200 px-3 bg-white font-semibold">
                  <span className="flex items-center gap-1.5">
                    <Database className="h-3.5 w-3.5 text-slate-600" />
                    Data Fields
                  </span>
                  <button onClick={() => setShowDataPane(false)} title="Collapse Data">
                    <ChevronRight className="h-4 w-4 text-slate-500 hover:text-black" />
                  </button>
                </div>
                
                <div className="p-3.5 space-y-3.5 max-h-[calc(100vh-170px)] overflow-y-auto">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={dataSearch}
                      onChange={(event) => setDataSearch(event.target.value)}
                      className="pl-8 h-8 text-xs bg-white border-slate-300 rounded"
                      placeholder="Search field..."
                    />
                  </div>

                  {/* Dataset Selector */}
                  <select
                    value={selectedDatasetId}
                    onChange={(event) => {
                      setSelectedDatasetId(event.target.value);
                      setPreview(null);
                      setPreviewError("");
                    }}
                    className="h-8.5 w-full rounded border border-slate-300 bg-white px-2.5 text-xs text-slate-800 outline-none"
                  >
                    <option value="">Select active dataset</option>
                    {datasets.map((dataset) => (
                      <option key={dataset.id} value={dataset.id}>
                        {dataset.name}
                      </option>
                    ))}
                  </select>

                  {/* Model utilities */}
                  <div className="grid grid-cols-2 gap-1.5">
                    <Button variant="outline" className="w-full h-8 text-[11px] border-slate-300 text-slate-700" onClick={() => fileInputRef.current?.click()}>
                      {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3 mr-1" />}
                      Get Data
                    </Button>
                    <Button variant="outline" className="w-full h-8 text-[11px] text-red-600 hover:bg-red-50 border-slate-300" onClick={deleteSelectedDataset} disabled={!selectedDataset}>
                      <X className="h-3.5 w-3.5 mr-1" />
                      Remove
                    </Button>
                  </div>

                  {/* Fields list draggable */}
                  <div className="rounded border border-slate-200 bg-white">
                    <div className="border-b border-slate-200 bg-slate-50 px-3 py-1.5 flex items-center justify-between">
                      <span className="font-semibold text-slate-800 truncate max-w-[140px]" title={selectedDataset?.name || "Active Model"}>
                        {selectedDataset?.name || "Active Model"}
                      </span>
                      <span className="text-[10px] text-slate-400">{columns.length} cols</span>
                    </div>

                    <div className="max-h-[300px] overflow-y-auto p-1.5 space-y-0.5">
                      {filteredColumns.length === 0 ? (
                        <p className="px-2 py-6 text-center text-xs text-muted-foreground">
                          {selectedDataset ? "No columns match query" : "Import data to start"}
                        </p>
                      ) : (
                        filteredColumns.map((column) => (
                          <button
                            key={column}
                            type="button"
                            draggable
                            onDragStart={(event) => event.dataTransfer.setData("text/plain", column)}
                            onDoubleClick={() => {
                              if (!draft.axis) addField("axis", column);
                              else if (draft.values.length === 0) addField("values", column);
                              else addField("tooltips", column);
                            }}
                            className="flex w-full items-center justify-between rounded px-2.5 py-1 hover:bg-slate-100 text-left text-slate-800 text-[11px] group transition-colors"
                          >
                            <span className="flex min-w-0 items-center gap-1.5">
                              {(() => {
                                const IconComponent = getColumnIcon(column, selectedDataset, dashboard);
                                return <IconComponent className="h-3.5 w-3.5 text-slate-400 shrink-0 group-hover:text-primary" />;
                              })()}
                              <span className="truncate">{column}</span>
                            </span>
                            <span className="text-[9px] text-slate-400 opacity-0 group-hover:opacity-100">drag</span>
                          </button>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Table details summary */}
                  {selectedDataset && (
                    <div className="rounded border border-slate-200 bg-white p-3 space-y-1">
                      <div className="flex items-center justify-between text-[11px] font-bold text-slate-700">
                        <span>Details</span>
                        <button type="button" className="text-primary hover:underline text-[10px]" onClick={() => setDraft((current) => ({ ...current, chart_type: "table" }))}>
                          Table visual
                        </button>
                      </div>
                      <div className="text-[10px] text-slate-500 space-y-0.5">
                        <p className="truncate">Database table: {selectedDataset.table_name}</p>
                        <p>Total lines: {selectedDataset.row_count.toLocaleString()}</p>
                      </div>
                    </div>
                  )}

                  {/* Smart Data Recommendations */}
                  {selectedDataset && smartRecommendation && draft.chart_type !== smartRecommendation.type && (
                    <div className="rounded border border-[#118d95]/30 bg-[#118d95]/5 p-3 space-y-2">
                      <div className="flex items-center gap-1.5 font-bold text-[#118d95] text-[11px]">
                        <Sparkles className="h-3.5 w-3.5 animate-pulse" />
                        <span>Recommended Visual</span>
                      </div>
                      <div className="text-[10px] text-slate-600 space-y-1.5">
                        <p>Based on your selected fields, we recommend a <span className="font-semibold text-slate-800">{smartRecommendation.title}</span>.</p>
                        <p className="text-slate-500 italic leading-snug">{smartRecommendation.reason}</p>
                        <button
                          type="button"
                          onClick={() => setDraft(curr => ({ ...curr, chart_type: smartRecommendation.type }))}
                          className="text-[10.5px] font-semibold text-[#118d95] hover:underline flex items-center gap-0.5"
                        >
                          Apply recommendation
                        </button>
                      </div>
                    </div>
                  )}

                </div>
              </section>
            ) : (
              <button
                onClick={() => setShowDataPane(true)}
                className="w-8 border-r border-slate-300 bg-[#f3f2f1] hover:bg-slate-200 flex flex-col items-center py-4 text-slate-600 text-[10px] font-bold gap-1 select-none"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                <span className="[writing-mode:vertical-lr] tracking-wider uppercase">Data</span>
              </button>
            )}
          </div>

          {/* 4. BOOKMARKS PANE */}
          <div className="flex">
            {showBookmarksPane ? (
              <section className="w-[220px] flex flex-col bg-[#f3f2f1] text-xs">
                <div className="flex h-9 items-center justify-between border-b border-slate-200 px-3 bg-white font-semibold">
                  <span className="flex items-center gap-1.5 text-slate-700">
                    <Save className="h-3.5 w-3.5" />
                    Bookmarks
                  </span>
                  <button onClick={() => setShowBookmarksPane(false)} title="Collapse Bookmarks">
                    <ChevronRight className="h-4 w-4 text-slate-500 hover:text-black" />
                  </button>
                </div>
                <div className="p-3.5 space-y-4 max-h-[calc(100vh-170px)] overflow-y-auto">
                  <div className="space-y-2">
                    <span className="font-bold text-slate-800">Add Bookmark</span>
                    <div className="flex gap-1.5">
                      <Input
                        value={bookmarkName}
                        onChange={(e) => setBookmarkName(e.target.value)}
                        placeholder="Bookmark name..."
                        className="h-8 text-xs bg-white border-slate-300 rounded"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") addBookmark();
                        }}
                      />
                      <Button 
                        onClick={addBookmark} 
                        className="h-8 px-3 bg-[#118d95] hover:bg-[#0e757b] text-white rounded text-[11px] font-semibold"
                      >
                        Add
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <span className="font-bold text-slate-800">Saved Bookmarks</span>
                    {bookmarks.length === 0 ? (
                      <div className="text-center py-6 text-slate-400 text-[11px] border border-dashed border-slate-300 rounded bg-white">
                        No bookmarks saved
                      </div>
                    ) : (
                      <div className="space-y-1">
                        {bookmarks.map((b) => (
                          <div
                            key={b.name}
                            className="flex items-center justify-between p-2 rounded bg-white border border-slate-200 hover:border-slate-300 transition-colors"
                          >
                            <button
                              onClick={() => applyBookmark(b)}
                              className="text-left font-medium text-slate-700 hover:text-[#118d95] truncate flex-1 mr-2"
                              title={`Apply bookmark: ${b.name}`}
                            >
                              {b.name}
                            </button>
                            <button
                              onClick={() => deleteBookmark(b.name)}
                              className="text-slate-400 hover:text-red-500"
                              title="Delete bookmark"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </section>
            ) : (
              <button
                onClick={() => setShowBookmarksPane(true)}
                className="w-8 bg-[#f3f2f1] hover:bg-slate-200 flex flex-col items-center py-4 text-slate-600 text-[10px] font-bold gap-1 select-none"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                <span className="[writing-mode:vertical-lr] tracking-wider uppercase">Bookmarks</span>
              </button>
            )}
          </div>

        </aside>
      </div>

      {/* Power BI Bottom status bar with tabs & zoom & layout selectors */}
      <footer className="h-9 border-t border-slate-300 bg-[#e1dfdd] text-slate-800 text-xs px-4 flex items-center justify-between flex-shrink-0 z-30 select-none">
        
        {/* Left: Page tab selectors */}
        <div className="flex items-center gap-2 h-full">
          <div className="flex items-center bg-[#f3f2f1] h-7 border border-slate-300 rounded shadow-sm text-slate-700">
            {pages.map((pageName) => {
              const isActive = activePage === pageName;
              const isEditing = editingPage === pageName;
              
              return (
                <div
                  key={pageName}
                  draggable={!isEditing}
                  onDragStart={() => setDraggedPage(pageName)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    if (draggedPage) {
                      reorderPages(draggedPage, pageName);
                      setDraggedPage(null);
                    }
                  }}
                  onDoubleClick={() => {
                    setEditingPage(pageName);
                    setEditingPageValue(pageName);
                  }}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setTabContextMenu({ x: event.clientX, y: event.clientY, pageName });
                  }}
                  className={cn(
                    "h-full flex items-center border-r border-slate-200 transition-colors relative group/tab",
                    isActive ? "bg-white text-black font-extrabold" : "hover:bg-slate-200 text-slate-700"
                  )}
                >
                  {isEditing ? (
                    <input
                      type="text"
                      value={editingPageValue}
                      onChange={(e) => setEditingPageValue(e.target.value)}
                      onBlur={() => {
                        renamePage(pageName, editingPageValue);
                        setEditingPage(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          renamePage(pageName, editingPageValue);
                          setEditingPage(null);
                        } else if (e.key === "Escape") {
                          setEditingPage(null);
                        }
                      }}
                      className="px-2 h-full text-[11px] font-semibold w-20 outline-none border-none bg-slate-50 focus:bg-white text-black"
                      autoFocus
                    />
                  ) : (
                    <button
                      onClick={() => {
                        setActivePage(pageName);
                        setSelectedWidgetId("");
                        toast.success(`Switched to ${pageName}`);
                      }}
                      className="h-full px-3 text-[11px] font-semibold flex items-center gap-1.5"
                    >
                      {lockedPages.includes(pageName) && <Lock className="h-3 w-3 text-slate-500 shrink-0" />}
                      {hiddenPages.includes(pageName) && <EyeOff className="h-3 w-3 text-slate-500 shrink-0" />}
                      <span>{pageName}</span>
                      {pages.length > 1 && (
                        <span
                          onClick={(e) => {
                            e.stopPropagation();
                            deletePage(pageName);
                          }}
                          className="w-3.5 h-3.5 hover:bg-slate-200 rounded-full flex items-center justify-center text-slate-400 hover:text-red-500 opacity-0 group-hover/tab:opacity-100 transition-opacity ml-1 shrink-0"
                          title="Delete Page"
                        >
                          <X className="h-2 w-2" />
                        </span>
                      )}
                    </button>
                  )}
                </div>
              );
            })}
            <button
              onClick={addPage}
              className="h-full px-2.5 hover:bg-slate-200 text-slate-600 hover:text-black flex items-center"
              title="Add New Report Page"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
          <span className="text-[10px] text-slate-500 font-mono pl-1">Page 1 of {pages.length}</span>
        </div>

        {/* Center: Layout Toggles */}
        <div className="flex items-center gap-3">
          <button className="p-1.5 hover:bg-slate-200 rounded text-slate-700" title="Desktop Layout View" onClick={() => toast.success("Desktop layout active")}>
            <LayoutDashboard className="h-4 w-4" />
          </button>
          <button className="p-1.5 hover:bg-slate-200 rounded text-slate-700" title="Mobile Layout View" onClick={() => toast.success("Mobile device canvas view loaded")}>
            <Calculator className="h-4 w-4" />
          </button>
        </div>

        {/* Right: Zoom Slider & Fullscreen */}
        <div className="flex items-center gap-3.5">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setZoomPercent((prev) => Math.max(50, prev - 10))}
              className="w-5 h-5 flex items-center justify-center bg-white/60 hover:bg-white rounded border border-slate-400 font-bold"
            >
              -
            </button>
            <input
              type="range"
              min={50}
              max={150}
              step={10}
              value={zoomPercent}
              onChange={(e) => setZoomPercent(Number(e.target.value))}
              className="w-24 h-1 accent-[#118d95] cursor-pointer"
            />
            <button
              onClick={() => setZoomPercent((prev) => Math.min(150, prev + 10))}
              className="w-5 h-5 flex items-center justify-center bg-white/60 hover:bg-white rounded border border-slate-400 font-bold"
            >
              +
            </button>
            <span className="text-[10px] font-mono font-bold w-9 text-right">{zoomPercent}%</span>
          </div>

          <div className="h-4 w-px bg-slate-400" />
          
          <button className="p-1 hover:bg-slate-200 rounded text-slate-700" title="Fit to Full Screen" onClick={() => {
            setZoomPercent(100);
            toast.success("Page scaled to fit full workspace view");
          }}>
            <Maximize2 className="h-4 w-4" />
          </button>
        </div>

      </footer>

      {activeDropdownWidgetId && (
        <div 
          className="fixed inset-0 z-40 bg-transparent" 
          onClick={() => setActiveDropdownWidgetId(null)}
        />
      )}

      {focusedWidget && (
        <div 
          className="fixed inset-0 bg-black/75 backdrop-blur-md flex items-center justify-center z-[100] p-6 animate-in fade-in duration-200"
          onClick={() => setFocusedWidget(null)}
        >
          <div 
            className="bg-slate-900 border border-slate-700/50 shadow-2xl rounded-2xl w-full max-w-5xl h-[85vh] flex flex-col overflow-hidden text-slate-100"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-800 p-5 bg-slate-900/85 backdrop-blur-sm">
              <div>
                <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{focusedWidget.chart_type}</span>
                <h2 className="text-lg font-bold text-slate-100 mt-0.5">{focusedWidget.title}</h2>
              </div>
              <button 
                onClick={() => setFocusedWidget(null)}
                className="text-slate-400 hover:text-slate-200 p-2 hover:bg-slate-800/80 rounded-xl transition-all duration-200"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            
            {/* Chart Container */}
            <div className="flex-1 p-8 bg-slate-950 flex flex-col justify-center min-h-0">
              {focusedWidget.loading ? (
                <div className="flex h-full items-center justify-center">
                  <Loader2 className="h-8 w-8 animate-spin text-[#118d95]" />
                </div>
              ) : focusedWidget.error ? (
                <div className="flex h-full items-center justify-center text-center text-sm text-red-400">
                  {focusedWidget.error}
                </div>
              ) : focusedWidget.chartData ? (
                <div className="w-full flex-1 min-h-0 relative select-none">
                  <ChartWidget
                    data={focusedWidget.chartData}
                    height={500}
                    theme={dashboardTheme}
                    formatOptions={formatOptions}
                    onSelectCategory={(value: any) => handleWidgetSelectCategory(focusedWidget, value)}
                    activeFilters={activeFilters}
                  />
                </div>
              ) : (
                <div className="flex h-full items-center justify-center text-slate-400">No data</div>
              )}
            </div>

            {/* Footer / Controls */}
            <div className="border-t border-slate-800 p-4 bg-slate-900/60 flex items-center justify-between text-xs text-slate-400">
              <div>
                {focusedWidget.x_key && (
                  <p>Axis Column: <span className="font-semibold text-slate-300">{focusedWidget.x_key}</span></p>
                )}
              </div>
              <div className="flex items-center gap-3">
                {(() => {
                  const widgetLabels = focusedWidget.chartData?.labels || [];
                  const isFiltered = (focusedWidget.x_key && activeFilters[focusedWidget.x_key] !== undefined) || widgetLabels.some(l => activeFilters[l] !== undefined);
                  if (!isFiltered) return null;
                  return (
                    <button 
                      onClick={() => handleWidgetSelectCategory(focusedWidget, "__CLEAR__")}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#118d95]/20 hover:bg-[#118d95]/30 text-[#25c4ce] transition-all"
                    >
                      <Filter className="h-3.5 w-3.5" />
                      <span>Clear active filter</span>
                    </button>
                  );
                })()}
                <button 
                  onClick={() => exportWidgetCSV(focusedWidget)}
                  className="px-4 py-1.5 rounded-lg border border-slate-700 hover:bg-slate-800 text-slate-300 font-medium transition-all"
                >
                  Export Data
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {contextMenu && (
        <div
          className="fixed bg-white border border-slate-300 shadow-2xl rounded py-1 z-50 text-slate-800 text-xs w-40"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => {
              copyWidget(contextMenu.widget);
              setContextMenu(null);
            }}
            className="w-full text-left px-4 py-2 hover:bg-slate-100 flex items-center gap-2"
          >
            Copy
          </button>
          <button
            onClick={() => {
              duplicateWidget(contextMenu.widget);
              setContextMenu(null);
            }}
            className="w-full text-left px-4 py-2 hover:bg-slate-100 flex items-center gap-2"
          >
            Duplicate
          </button>
          <button
            onClick={() => {
              adjustLayering(contextMenu.widget, "forward");
              setContextMenu(null);
            }}
            className="w-full text-left px-4 py-2 hover:bg-slate-100 flex items-center gap-2"
          >
            Bring Forward
          </button>
          <button
            onClick={() => {
              adjustLayering(contextMenu.widget, "backward");
              setContextMenu(null);
            }}
            className="w-full text-left px-4 py-2 hover:bg-slate-100 flex items-center gap-2"
          >
            Send Backward
          </button>
          <button
            onClick={() => {
              exportWidgetCSV(contextMenu.widget);
              setContextMenu(null);
            }}
            className="w-full text-left px-4 py-2 hover:bg-slate-100 flex items-center gap-2 font-medium text-emerald-700"
          >
            Export to CSV
          </button>
          <div className="h-px bg-slate-200 my-1" />
          <button
            onClick={() => {
              removeWidget(contextMenu.widget.id);
              setContextMenu(null);
            }}
            className="w-full text-left px-4 py-2 hover:bg-slate-100 flex items-center gap-2 text-red-600 font-semibold"
          >
            Delete Visual
          </button>
        </div>
      )}

      {tabContextMenu && (
        <div
          className="fixed bg-white border border-slate-300 shadow-2xl rounded py-1 z-50 text-slate-800 text-xs w-44"
          style={{ left: tabContextMenu.x, top: tabContextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => {
              setEditingPage(tabContextMenu.pageName);
              setEditingPageValue(tabContextMenu.pageName);
              setTabContextMenu(null);
            }}
            className="w-full text-left px-3 py-1.5 hover:bg-slate-100 flex items-center gap-2"
          >
            <span>✏️</span> Rename Page
          </button>
          <button
            onClick={() => {
              duplicatePage(tabContextMenu.pageName);
              setTabContextMenu(null);
            }}
            className="w-full text-left px-3 py-1.5 hover:bg-slate-100 flex items-center gap-2"
          >
            <span>📋</span> Duplicate Page
          </button>
          <button
            onClick={() => {
              toggleLockPage(tabContextMenu.pageName);
              setTabContextMenu(null);
            }}
            className="w-full text-left px-3 py-1.5 hover:bg-slate-100 flex items-center gap-2"
          >
            <span>🔒</span> {lockedPages.includes(tabContextMenu.pageName) ? "Unlock Page" : "Lock Page"}
          </button>
          <button
            onClick={() => {
              toggleHidePage(tabContextMenu.pageName);
              setTabContextMenu(null);
            }}
            className="w-full text-left px-3 py-1.5 hover:bg-slate-100 flex items-center gap-2"
          >
            {hiddenPages.includes(tabContextMenu.pageName) ? (
              <>
                <span>👁️</span> Unhide Page
              </>
            ) : (
              <>
                <span>👁️‍🗨️</span> Hide Page
              </>
            )}
          </button>
          {pages.length > 1 && (
            <>
              <div className="border-t border-slate-200 my-1" />
              <button
                onClick={() => {
                  deletePage(tabContextMenu.pageName);
                  setTabContextMenu(null);
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-red-50 text-red-600 flex items-center gap-2 font-semibold"
              >
                <span>❌</span> Delete Page
              </button>
            </>
          )}
        </div>
      )}
      {showScheduleModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[9999] p-4">
          <div className="bg-white border border-slate-200 shadow-2xl rounded-xl w-full max-w-lg overflow-hidden text-left">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-slate-50">
              <h3 className="font-bold text-sm text-slate-800 flex items-center gap-1.5">
                <Calendar className="h-4.5 w-4.5 text-primary" /> Automated Report Schedules
              </h3>
              <button
                onClick={() => setShowScheduleModal(false)}
                className="text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
              >
                <X className="h-4.5 w-4.5" />
              </button>
            </div>

            <div className="p-5 space-y-5">
              {/* Form */}
              <div className="space-y-3 bg-slate-50 p-4 border border-slate-200 rounded-lg">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">Create New Email Dispatch</h4>
                
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-700">Recipient Email Addresses (comma separated)</label>
                  <input
                    type="text"
                    value={scheduleRecipients}
                    onChange={(e) => setScheduleRecipients(e.target.value)}
                    placeholder="manager@company.com, analytics@company.com"
                    className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary text-slate-800"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-700">Dispatch Frequency</label>
                  <select
                    value={scheduleFrequency}
                    onChange={(e) => setScheduleFrequency(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 text-xs focus:outline-none text-slate-800"
                  >
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </div>

                <button
                  onClick={handleCreateSchedule}
                  className="w-full py-2 bg-primary hover:bg-primary/95 text-white font-semibold rounded text-xs transition-all cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Plus className="h-3.5 w-3.5" /> Schedule Automated PDF Dispatch
                </button>
              </div>

              {/* Schedules List */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">Active Schedules</h4>
                {loadingSchedules ? (
                  <div className="flex justify-center py-6">
                    <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
                  </div>
                ) : schedules.length === 0 ? (
                  <p className="text-xs text-slate-400 italic text-center py-4 border border-dashed border-slate-200 rounded-lg">
                    No active dispatches configured for this dashboard.
                  </p>
                ) : (
                  <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                    {schedules.map((s) => (
                      <div key={s.id} className="flex items-center justify-between p-3 border border-slate-200 bg-white rounded-lg hover:border-slate-300 transition-colors">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 bg-slate-100 border border-slate-200 rounded text-slate-600">
                              {s.frequency}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              Last run: {s.last_run_at ? new Date(s.last_run_at).toLocaleString() : "Never"}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-600 mt-1 truncate max-w-[320px]">
                            {s.recipients.join(", ")}
                          </p>
                        </div>
                        <button
                          onClick={() => handleDeleteSchedule(s.id)}
                          className="p-1 hover:bg-red-50 text-slate-400 hover:text-red-500 rounded border border-transparent hover:border-red-100 transition-all cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50 flex justify-end">
              <button
                onClick={() => setShowScheduleModal(false)}
                className="px-4 py-1.5 border border-slate-300 bg-white hover:bg-slate-50 rounded text-xs font-semibold text-slate-700 transition-all cursor-pointer"
              >
                Close Dialog
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

}
