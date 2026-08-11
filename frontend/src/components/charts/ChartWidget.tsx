"use client";
import { useState } from "react";
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area,
  PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, Brush, LabelList,
  ReferenceLine, ErrorBar, ScatterChart, Scatter,
  Treemap, ComposedChart, Radar, RadarChart, PolarGrid,
  PolarAngleAxis, PolarRadiusAxis
} from "recharts";
import { ChartData } from "@/types/bi";

const THEMES: Record<string, string[]> = {
  default: ["#6366f1", "#22d3ee", "#f59e0b", "#10b981", "#f43f5e", "#a78bfa"],
  classic: ["#118D95", "#8064A2", "#B0C4DE", "#F2C811", "#374E59", "#E68A00"],
  sunset: ["#f59e0b", "#e11d48", "#db2777", "#ea580c", "#ca8a04", "#be123c"],
  emerald: ["#10b981", "#059669", "#0d9488", "#047857", "#14b8a6", "#15803d"],
  royal: ["#8b5cf6", "#7c3aed", "#4f46e5", "#6366f1", "#a78bfa", "#3b82f6"],
  steel: ["#4682B4", "#7b9bb6", "#5F9EA0", "#48D1CC", "#20B2AA", "#008B8B"],
};

export interface FormattingOptions {
  showYAxis: boolean;
  yAxisFontFamily: string;
  yAxisFontSize: number;
  yAxisBold: boolean;
  yAxisItalic: boolean;
  yAxisUnderline: boolean;
  yAxisColor: string;
  showYAxisTitle: boolean;
  yAxisTitleText: string;
  
  showXAxis: boolean;
  xAxisFontFamily: string;
  xAxisFontSize: number;
  xAxisBold: boolean;
  xAxisItalic: boolean;
  xAxisUnderline: boolean;
  xAxisColor: string;
  showXAxisTitle: boolean;
  xAxisTitleText: string;

  showLegend: boolean;
  legendPosition: string;
  showGridlines: boolean;
  gridlineColor: string;
  gridlineStyle: string;
  showZoomSlider: boolean;
  
  // Bars
  showBars: boolean;
  barsColor: string;
  barsPadding: number;

  // Ribbons
  showRibbons: boolean;

  showDataLabels: boolean;
  dataLabelsColor: string;
  dataLabelsSize: number;
  
  showTotalLabels: boolean;

  // Plot area background
  showPlotAreaBg: boolean;
  plotAreaBgColor: string;
  plotAreaBgTransparency: number;

  // Analytics
  showXConstantLine: boolean;
  xConstantLineValue: string;
  xConstantLineColor: string;
  xConstantLineLabel: string;
  showErrorBars: boolean;
  errorBarPercentage: number;

  // Conditional Formatting
  conditionalFormattingEnabled?: boolean;
  conditionalMinThreshold?: number;
  conditionalMinColor?: string;
  conditionalMaxThreshold?: number;
  conditionalMaxColor?: string;
}

interface Props {
  data: ChartData;
  height?: number;
  theme?: string;
  formatOptions?: Partial<FormattingOptions>;
  activeFilters?: Record<string, any>;
  onSelectCategory?: (value: any) => void;
}

export function ChartWidget({
  data,
  height = 300,
  theme = "default",
  formatOptions,
  activeFilters,
  onSelectCategory,
}: Props) {
  const { chart_type, labels, series, columns, x_key } = data;
  const colors = THEMES[theme] || THEMES.default;

  const opts = {
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
    gridlineColor: "rgba(255,255,255,0.05)",
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

    // Conditional Formatting defaults
    conditionalFormattingEnabled: false,
    conditionalMinThreshold: undefined as number | undefined,
    conditionalMinColor: "#ef4444",
    conditionalMaxThreshold: undefined as number | undefined,
    conditionalMaxColor: "#10b981",
    ...formatOptions
  };

  const yAxisTickStyle = {
    fontFamily: opts.yAxisFontFamily,
    fontSize: opts.yAxisFontSize,
    fontWeight: opts.yAxisBold ? "bold" : "normal",
    fontStyle: opts.yAxisItalic ? "italic" : "normal",
    textDecoration: opts.yAxisUnderline ? "underline" : "none",
    fill: opts.yAxisColor,
  };

  const xAxisTickStyle = {
    fontFamily: opts.xAxisFontFamily,
    fontSize: opts.xAxisFontSize,
    fontWeight: opts.xAxisBold ? "bold" : "normal",
    fontStyle: opts.xAxisItalic ? "italic" : "normal",
    textDecoration: opts.xAxisUnderline ? "underline" : "none",
    fill: opts.xAxisColor,
  };

  const getLegendProps = (pos: string) => {
    const horizontalStyle = {
      maxHeight: 42,
      overflowY: "auto" as const,
      fontSize: 10,
      lineHeight: "14px",
      paddingBottom: 2,
    };
    const verticalStyle = {
      maxWidth: 96,
      maxHeight: Math.max(56, height - 32),
      overflowY: "auto" as const,
      fontSize: 10,
      lineHeight: "14px",
    };
    if (pos === "bottom") return { verticalAlign: "bottom" as const, align: "center" as const, layout: "horizontal" as const, wrapperStyle: horizontalStyle };
    if (pos === "left") return { verticalAlign: "middle" as const, align: "left" as const, layout: "vertical" as const, wrapperStyle: verticalStyle };
    if (pos === "right") return { verticalAlign: "middle" as const, align: "right" as const, layout: "vertical" as const, wrapperStyle: verticalStyle };
    return { verticalAlign: "top" as const, align: "center" as const, layout: "horizontal" as const, wrapperStyle: horizontalStyle };
  };

  const getBgColor = () => {
    if (!opts.showPlotAreaBg) return "transparent";
    const hex = opts.plotAreaBgColor || "#ffffff";
    const alpha = 1 - (opts.plotAreaBgTransparency / 100);
    
    if (hex.startsWith("#")) {
      const cleanHex = hex.replace("#", "");
      let r = 255, g = 255, b = 255;
      if (cleanHex.length === 3) {
        r = parseInt(cleanHex[0] + cleanHex[0], 16);
        g = parseInt(cleanHex[1] + cleanHex[1], 16);
        b = parseInt(cleanHex[2] + cleanHex[2], 16);
      } else if (cleanHex.length === 6) {
        r = parseInt(cleanHex.slice(0, 2), 16);
        g = parseInt(cleanHex.slice(2, 4), 16);
        b = parseInt(cleanHex.slice(4, 6), 16);
      }
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
    return hex;
  };

  const bgStyle = {
    backgroundColor: getBgColor(),
    borderRadius: "6px",
    padding: "8px",
    width: "100%",
    maxWidth: "100%",
    height: `${height}px`,
    maxHeight: "100%",
    boxSizing: "border-box" as const,
    overflow: "hidden",
    minHeight: 0,
  };
  const chartHeight = Math.max(48, height - 16);

  // Slicer component
  if (chart_type === "slicer") {
    const [slicerMode, setSlicerMode] = useState<"list" | "date">("list");
    const [searchTerm, setSearchTerm] = useState("");
    const [relativeType, setRelativeType] = useState<"days" | "quarter" | "year">("days");
    const [daysVal, setDaysVal] = useState(30);

    const filteredLabels = labels.filter((label) =>
      String(label ?? "").toLowerCase().includes(searchTerm.toLowerCase())
    );

    const handleCheckboxChange = (val: any) => {
      onSelectCategory?.({
        type: "checkbox",
        x_key,
        value: val
      });
    };

    const handleApplyRelativeDate = () => {
      onSelectCategory?.({
        type: "date",
        x_key,
        relativeType,
        value: daysVal,
      });
    };

    const handleClear = () => {
      onSelectCategory?.("__CLEAR__");
    };

    const isDateSlicerActive = activeFilters && activeFilters[x_key] && activeFilters[x_key].type === "date";
    const isValChecked = (val: any) => {
      if (!activeFilters) return false;
      const current = activeFilters[x_key];
      if (current && Array.isArray(current)) {
        return current.includes(val);
      }
      if (current && current.type === "checkbox" && Array.isArray(current.values)) {
        return current.values.includes(val);
      }
      return !!activeFilters[val];
    };

    const hasAnySlicerFilter = activeFilters && (
      activeFilters[x_key] !== undefined ||
      Object.keys(activeFilters).some(k => labels.includes(k) && activeFilters[k] === true)
    );

    return (
      <div style={bgStyle} className="h-full flex flex-col gap-1.5 p-2 text-xs text-left overflow-hidden bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded shadow-sm">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-850 pb-1.5 mb-1 text-slate-500 font-semibold text-[10px]">
          <div className="flex items-center gap-1">
            <button
              type="button"
              className={`px-1.5 py-0.5 rounded transition-colors ${slicerMode === "list" ? "bg-slate-200 text-slate-800 font-bold" : "hover:bg-slate-100 text-slate-500"}`}
              onClick={() => setSlicerMode("list")}
            >
              List
            </button>
            <button
              type="button"
              className={`px-1.5 py-0.5 rounded transition-colors ${slicerMode === "date" ? "bg-slate-200 text-slate-800 font-bold" : "hover:bg-slate-100 text-slate-500"}`}
              onClick={() => setSlicerMode("date")}
            >
              Relative Date
            </button>
          </div>
          {hasAnySlicerFilter && (
            <button type="button" className="text-red-500 hover:underline" onClick={handleClear}>
              Clear
            </button>
          )}
        </div>

        {/* Content */}
        {slicerMode === "list" ? (
          <div className="flex-1 flex flex-col min-h-0">
            {/* Search Box */}
            <div className="mb-2 relative">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search values..."
                className="w-full h-6.5 px-2 text-[10px] border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-[#118d95] bg-slate-50 text-slate-850"
              />
            </div>
            
            {/* Checkbox List */}
            <div className="flex-1 overflow-y-auto space-y-1 pr-1">
              {filteredLabels.map((val) => {
                const isChecked = isValChecked(val);
                return (
                  <label key={val} className="flex items-center gap-2 cursor-pointer py-0.5 hover:bg-slate-100 rounded px-1 transition-colors">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => handleCheckboxChange(val)}
                      className="rounded border-slate-300 text-[#118d95] focus:ring-[#118d95] h-3.5 w-3.5"
                    />
                    <span className="truncate text-slate-700 dark:text-slate-200">{String(val)}</span>
                  </label>
                );
              })}
              {filteredLabels.length === 0 && (
                <div className="text-[10px] text-slate-400 italic text-center py-2">No items found</div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col gap-2 justify-center pr-1 py-1">
            <div className="flex flex-col gap-1">
              <span className="text-[10px] text-slate-400 font-bold">Time Window</span>
              <select
                value={relativeType}
                onChange={(e) => setRelativeType(e.target.value as any)}
                className="h-7 border border-slate-300 rounded bg-white px-1.5 focus:outline-none focus:ring-1 focus:ring-[#118d95] text-slate-800"
              >
                <option value="days">Last N Days</option>
                <option value="quarter">This Quarter</option>
                <option value="year">This Year</option>
              </select>
            </div>

            {relativeType === "days" && (
              <div className="flex flex-col gap-1">
                <span className="text-[10px] text-slate-400 font-bold">Number of Days</span>
                <input
                  type="number"
                  min={1}
                  value={daysVal}
                  onChange={(e) => setDaysVal(Number(e.target.value))}
                  className="h-7 border border-slate-300 rounded px-2 focus:outline-none focus:ring-1 focus:ring-[#118d95] text-slate-800"
                />
              </div>
            )}

            <button
              type="button"
              onClick={handleApplyRelativeDate}
              className="mt-1 w-full h-7 bg-[#118d95] hover:bg-[#0e747b] text-white font-bold rounded shadow transition-colors"
            >
              Apply Filter
            </button>
            {isDateSlicerActive && (
              <div className="text-[9px] text-emerald-600 font-semibold text-center mt-1">
                ✓ Active: Last {activeFilters[x_key]?.dateRelative?.type === "days" ? `${activeFilters[x_key]?.dateRelative?.value} days` : activeFilters[x_key]?.dateRelative?.type}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  if (chart_type === "table") {
    const rows = data.series as unknown as Record<string, unknown>[];
    if (!rows || rows.length === 0) {
      return (
        <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
          No rows to display
        </div>
      );
    }
    return (
      <div className="overflow-auto text-xs h-full min-h-0" style={{ backgroundColor: getBgColor(), maxHeight: `${height}px` }}>
        <table className="w-full border-collapse">
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c} className="border border-border px-2 py-1 text-left font-medium bg-muted/40">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="hover:bg-muted/20">
                {columns.map((c) => (
                  <td key={c} className="border border-border px-2 py-1">
                    {String(row[c] ?? "")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (!series || series.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
        No data to display
      </div>
    );
  }

  if (chart_type === "card") {
    const first = series[0];
    const value = first.value ?? first.data?.[0] ?? 0;
    return (
      <div className="flex h-full min-h-0 flex-col items-center justify-center overflow-hidden rounded border border-border px-2 text-center" style={{ backgroundColor: getBgColor() }}>
        <div className="max-w-full truncate text-3xl font-semibold tabular-nums">{Number(value).toLocaleString()}</div>
        <div className="mt-1 max-w-full truncate text-xs text-muted-foreground">{first.name}</div>
      </div>
    );
  }

  if (chart_type === "pie" || chart_type === "donut") {
    // Filter out zero-value entries so the pie has visible slices
    const pieData = series.filter((s) => Number(s.value ?? 0) !== 0);
    const renderData = pieData.length > 0 ? pieData : series;
    return (
      <div style={{ ...bgStyle, display: "flex", flexDirection: "column" }}>
        <ResponsiveContainer width="100%" height={chartHeight}>
          <PieChart>
            <Pie
              data={renderData}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={chart_type === "donut" ? "40%" : 0}
              outerRadius="70%"
              labelLine={false}
              label={({ name, percent }) =>
                percent > 0.04 ? `${(percent * 100).toFixed(0)}%` : ""
              }
              onClick={(node) => {
                if (node && node.name) onSelectCategory?.(node.name);
              }}
            >
              {renderData.map((entry, i) => {
                const isSelected = activeFilters && activeFilters[entry.name];
                const hasAnyFilter = activeFilters && Object.keys(activeFilters).length > 0;
                const opacity = hasAnyFilter && !isSelected ? 0.35 : 1;
                let fillVal = colors[i % colors.length];
                const cellVal = Number(entry.value ?? 0);
                if (opts.conditionalFormattingEnabled) {
                  if (opts.conditionalMinThreshold !== undefined && cellVal < opts.conditionalMinThreshold) {
                    fillVal = opts.conditionalMinColor || "#ef4444";
                  } else if (opts.conditionalMaxThreshold !== undefined && cellVal > opts.conditionalMaxThreshold) {
                    fillVal = opts.conditionalMaxColor || "#10b981";
                  }
                }
                return (
                  <Cell key={i} fill={fillVal} opacity={opacity} />
                );
              })}
            </Pie>
            <Tooltip formatter={(value: number) => value.toLocaleString()} />
            {opts.showLegend && <Legend {...getLegendProps(opts.legendPosition)} />}
          </PieChart>
        </ResponsiveContainer>
      </div>
    );
  }

  if (chart_type === "scatter") {
    // For scatter, we map data rows directly to coordinates
    const scatterData = labels.map((label, i) => ({
      x: Number(series[0]?.data?.[i] ?? i),
      y: Number(series[1]?.data?.[i] ?? series[0]?.data?.[i] ?? 0),
      label: label
    }));
    return (
      <div style={bgStyle}>
        <ResponsiveContainer width="100%" height={chartHeight}>
          <ScatterChart margin={{ top: 12, right: 16, left: 10, bottom: 12 }}>
            {opts.showGridlines && <CartesianGrid strokeDasharray={opts.gridlineStyle} stroke={opts.gridlineColor} />}
            <XAxis type="number" dataKey="x" name={series[0]?.name || "X-Axis"} tick={xAxisTickStyle} />
            <YAxis type="number" dataKey="y" name={series[1]?.name || series[0]?.name || "Y-Axis"} tick={yAxisTickStyle} />
            <Tooltip cursor={{ strokeDasharray: '3 3' }} />
            {opts.showLegend && <Legend {...getLegendProps(opts.legendPosition)} />}
            <Scatter name="Points" data={scatterData} fill={colors[0]} onClick={(data) => {
              if (data && data.payload) onSelectCategory?.(data.payload.label);
            }}>
              {scatterData.map((entry, idx) => {
                const isSelected = activeFilters && activeFilters[entry.label];
                const hasAnyFilter = activeFilters && Object.keys(activeFilters).length > 0;
                const opacity = hasAnyFilter && !isSelected ? 0.35 : 1;
                let fillVal = colors[idx % colors.length];
                const cellVal = Number(entry.y ?? 0);
                if (opts.conditionalFormattingEnabled) {
                  if (opts.conditionalMinThreshold !== undefined && cellVal < opts.conditionalMinThreshold) {
                    fillVal = opts.conditionalMinColor || "#ef4444";
                  } else if (opts.conditionalMaxThreshold !== undefined && cellVal > opts.conditionalMaxThreshold) {
                    fillVal = opts.conditionalMaxColor || "#10b981";
                  }
                }
                return (
                  <Cell key={idx} fill={fillVal} opacity={opacity} />
                );
              })}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    );
  }


  const chartData = labels.map((label, i) => {
    const point: Record<string, unknown> = { label };
    series.forEach((s) => {
      const val = s.data?.[i] ?? 0;
      point[s.name] = val;
      if (opts.showErrorBars) {
        point[`${s.name}_error`] = val * (opts.errorBarPercentage / 100);
      }
    });
    return point;
  });

  const commonProps = {
    data: chartData,
    margin: { top: 12, right: 16, left: 10, bottom: 12 },
  };

  if (chart_type === "line") {
    return (
      <div style={bgStyle}>
        <ResponsiveContainer width="100%" height={chartHeight}>
          <LineChart
            {...commonProps}
            onClick={(data) => {
              if (data && data.activeLabel) onSelectCategory?.(data.activeLabel);
            }}
          >
            {opts.showGridlines && <CartesianGrid strokeDasharray={opts.gridlineStyle} stroke={opts.gridlineColor} />}
            <XAxis dataKey="label" hide={!opts.showXAxis} tick={xAxisTickStyle} />
            <YAxis hide={!opts.showYAxis} tick={yAxisTickStyle} />
            <Tooltip />
            {opts.showLegend && <Legend {...getLegendProps(opts.legendPosition)} />}
            {series.map((s, i) => (
              <Line key={s.name} type="monotone" dataKey={s.name} stroke={colors[i % colors.length]} dot={true}>
                {opts.showDataLabels && <LabelList position="top" style={{ fontSize: opts.dataLabelsSize, fill: opts.dataLabelsColor, fontFamily: opts.xAxisFontFamily }} />}
                {opts.showErrorBars && <ErrorBar dataKey={`${s.name}_error`} width={4} strokeWidth={1.5} stroke={colors[i % colors.length]} direction="y" />}
              </Line>
            ))}
            {opts.showXConstantLine && opts.xConstantLineValue && (
              <ReferenceLine
                x={opts.xConstantLineValue}
                stroke={opts.xConstantLineColor}
                strokeWidth={1.5}
                strokeDasharray="4 4"
                label={{
                  value: opts.xConstantLineLabel || "Constant Line",
                  position: "top",
                  fill: opts.xConstantLineColor,
                  fontSize: 9,
                  fontWeight: "bold",
                }}
              />
            )}
            {opts.showZoomSlider && <Brush dataKey="label" height={20} stroke="#118d95" />}
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  }

  if (chart_type === "area") {
    return (
      <div style={bgStyle}>
        <ResponsiveContainer width="100%" height={chartHeight}>
          <AreaChart
            {...commonProps}
            onClick={(data) => {
              if (data && data.activeLabel) onSelectCategory?.(data.activeLabel);
            }}
          >
            {opts.showGridlines && <CartesianGrid strokeDasharray={opts.gridlineStyle} stroke={opts.gridlineColor} />}
            <XAxis dataKey="label" hide={!opts.showXAxis} tick={xAxisTickStyle} />
            <YAxis hide={!opts.showYAxis} tick={yAxisTickStyle} />
            <Tooltip />
            {opts.showLegend && <Legend {...getLegendProps(opts.legendPosition)} />}
            {series.map((s, i) => (
              <Area key={s.name} type="monotone" dataKey={s.name} stroke={colors[i % colors.length]} fill={colors[i % colors.length] + "33"}>
                {opts.showDataLabels && <LabelList position="top" style={{ fontSize: opts.dataLabelsSize, fill: opts.dataLabelsColor, fontFamily: opts.xAxisFontFamily }} />}
                {opts.showErrorBars && <ErrorBar dataKey={`${s.name}_error`} width={4} strokeWidth={1.5} stroke={colors[i % colors.length]} direction="y" />}
              </Area>
            ))}
            {opts.showXConstantLine && opts.xConstantLineValue && (
              <ReferenceLine
                x={opts.xConstantLineValue}
                stroke={opts.xConstantLineColor}
                strokeWidth={1.5}
                strokeDasharray="4 4"
                label={{
                  value: opts.xConstantLineLabel || "Constant Line",
                  position: "top",
                  fill: opts.xConstantLineColor,
                  fontSize: 9,
                  fontWeight: "bold",
                }}
              />
            )}
            {opts.showZoomSlider && <Brush dataKey="label" height={20} stroke="#118d95" />}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    );
  }

  // 1. Gauge Chart
  if (chart_type === "gauge") {
    const first = series[0];
    const value = Number(first?.value ?? first?.data?.[0] ?? 0);
    const maxVal = opts.conditionalMaxThreshold || 100;
    const minVal = opts.conditionalMinThreshold || 0;
    const percent = Math.min(100, Math.max(0, ((value - minVal) / (maxVal - minVal)) * 100));
    
    const radius = 60;
    const circumference = 2 * Math.PI * radius;
    
    return (
      <div style={bgStyle} className="flex flex-col items-center justify-center h-full min-h-0 p-2 text-slate-800">
        <div className="relative flex items-center justify-center">
          <svg className="w-32 h-20 overflow-visible" viewBox="0 0 160 100">
            <path
              d="M 20 80 A 60 60 0 0 1 140 80"
              fill="none"
              stroke="#e2e8f0"
              strokeWidth="14"
              strokeLinecap="round"
            />
            <path
              d="M 20 80 A 60 60 0 0 1 140 80"
              fill="none"
              stroke={colors[0]}
              strokeWidth="14"
              strokeLinecap="round"
              strokeDasharray={`${circumference * 0.5} ${circumference}`}
              style={{
                strokeDashoffset: (circumference * 0.5) - (percent / 100) * (circumference * 0.5),
                transition: "stroke-dashoffset 0.5s ease",
              }}
            />
            <line
              x1="80" y1="80"
              x2={80 + 55 * Math.cos(Math.PI - (percent / 100) * Math.PI)}
              y2={80 - 55 * Math.sin(Math.PI - (percent / 100) * Math.PI)}
              stroke="#475569"
              strokeWidth="3.5"
              strokeLinecap="round"
            />
            <circle cx="80" cy="80" r="6" fill="#1e293b" />
          </svg>
          <div className="absolute bottom-1.5 flex flex-col items-center">
            <span className="text-xl font-bold font-mono">{value.toLocaleString()}</span>
            <span className="text-[9px] text-slate-400 font-semibold">{first?.name || "Value"}</span>
          </div>
        </div>
        <div className="flex justify-between w-full px-8 text-[9px] font-semibold text-slate-400">
          <span>Min: {minVal}</span>
          <span>Max: {maxVal}</span>
        </div>
      </div>
    );
  }

  // 2. Treemap Chart
  if (chart_type === "treemap") {
    const treemapData = series.map((s, i) => ({
      name: s.name,
      size: Number(s.value ?? s.data?.[0] ?? 0),
      fill: colors[i % colors.length]
    })).filter(item => item.size > 0);

    return (
      <div style={bgStyle}>
        <ResponsiveContainer width="100%" height={chartHeight}>
          <Treemap
            data={treemapData}
            dataKey="size"
            aspectRatio={4 / 3}
            stroke="#fff"
            fill={colors[0]}
          >
            <Tooltip />
          </Treemap>
        </ResponsiveContainer>
      </div>
    );
  }

  // 3. Funnel Chart
  if (chart_type === "funnel") {
    const funnelData = series.map((s, i) => ({
      name: s.name,
      value: Number(s.value ?? s.data?.[0] ?? 0),
      fill: colors[i % colors.length]
    })).sort((a, b) => b.value - a.value);

    const maxVal = funnelData[0]?.value || 1;

    return (
      <div style={bgStyle} className="flex flex-col gap-2.5 justify-center p-3 h-full overflow-y-auto">
        {funnelData.map((item, idx) => {
          const percentOfMax = (item.value / maxVal) * 100;
          return (
            <div key={idx} className="flex items-center gap-3 w-full text-xs">
              <span className="w-20 text-slate-500 font-semibold truncate text-[10px] text-right">{item.name}</span>
              <div className="flex-1 bg-slate-100 rounded-sm h-6 relative overflow-hidden flex items-center">
                <div 
                  className="h-full rounded-sm transition-all duration-500 flex items-center pl-2 text-white font-bold text-[10px]"
                  style={{ 
                    width: `${percentOfMax}%`, 
                    backgroundColor: item.fill,
                    margin: "0 auto"
                  }}
                >
                  <span className="drop-shadow-md">{item.value.toLocaleString()}</span>
                </div>
              </div>
              <span className="w-10 text-[10px] text-slate-400 font-bold">{Math.round(percentOfMax)}%</span>
            </div>
          );
        })}
      </div>
    );
  }

  // 4. Waterfall Chart
  if (chart_type === "waterfall") {
    let runningTotal = 0;
    const waterfallData = labels.map((label, idx) => {
      const value = Number(series[0]?.data?.[idx] ?? 0);
      const start = runningTotal;
      runningTotal += value;
      return {
        name: label,
        value,
        start,
        end: runningTotal,
        fill: value >= 0 ? "#10b981" : "#ef4444"
      };
    });

    waterfallData.push({
      name: "Total",
      value: runningTotal,
      start: 0,
      end: runningTotal,
      fill: "#6366f1"
    });

    const minVal = Math.min(0, ...waterfallData.map(d => Math.min(d.start, d.end)));
    const maxVal = Math.max(0, ...waterfallData.map(d => Math.max(d.start, d.end))) || 1;
    const range = maxVal - minVal;

    return (
      <div style={bgStyle} className="flex flex-col h-full justify-between p-2">
        <div className="flex-1 flex gap-2 items-end min-h-0 px-2 border-b border-slate-200">
          {waterfallData.map((d, idx) => {
            const topPercent = ((maxVal - Math.max(d.start, d.end)) / range) * 100;
            const heightPercent = (Math.abs(d.value) / range) * 100;
            const finalHeight = d.name === "Total" ? ((d.end - minVal) / range) * 100 : heightPercent;
            const finalTop = d.name === "Total" ? ((maxVal - d.end) / range) * 100 : topPercent;

            return (
              <div key={idx} className="flex-1 flex flex-col items-center h-full relative group">
                <div 
                  className="w-full rounded-sm relative transition-all duration-300"
                  style={{
                    top: `${finalTop}%`,
                    height: `${Math.max(4, finalHeight)}%`,
                    backgroundColor: d.fill
                  }}
                  title={`${d.name}: ${d.value.toLocaleString()} (Total: ${d.end.toLocaleString()})`}
                />
                <div className="absolute top-0 opacity-0 group-hover:opacity-100 bg-slate-800 text-white text-[9px] rounded px-1.5 py-0.5 -translate-y-6 pointer-events-none transition-opacity font-mono z-30">
                  {d.name === "Total" ? `Total: ${d.end}` : `Change: ${d.value}`}
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex justify-between mt-1 text-[9px] text-slate-400 font-semibold px-2">
          {waterfallData.map((d, idx) => (
            <span key={idx} className="flex-1 text-center truncate">{d.name}</span>
          ))}
        </div>
      </div>
    );
  }

  // 5. Heatmap Chart
  if (chart_type === "heatmap") {
    const maxVal = Math.max(...series.flatMap(s => s.data || [])) || 1;
    const minVal = Math.min(...series.flatMap(s => s.data || [])) || 0;
    const range = maxVal - minVal || 1;

    return (
      <div style={bgStyle} className="flex flex-col h-full overflow-auto p-1">
        <div className="flex-1 flex flex-col min-w-[320px]">
          <div className="flex w-full mb-1">
            <span className="w-16 shrink-0" />
            {labels.slice(0, 8).map((l, idx) => (
              <span key={idx} className="flex-1 text-center text-[9px] text-slate-400 font-bold truncate">{l}</span>
            ))}
          </div>
          {series.slice(0, 6).map((s, rowIdx) => (
            <div key={rowIdx} className="flex w-full items-center mb-1">
              <span className="w-16 shrink-0 text-[10px] text-slate-500 font-bold truncate pr-1 text-right">{s.name}</span>
              {(s.data || []).slice(0, 8).map((val, colIdx) => {
                const ratio = (val - minVal) / range;
                const r = Math.round(17 + ratio * 200);
                const g = Math.round(141 + ratio * 80);
                const b = Math.round(149 - ratio * 100);
                const bgHex = `rgba(${r}, ${g}, ${b}, 0.85)`;

                return (
                  <div
                    key={colIdx}
                    className="flex-1 h-8 m-[1.5px] rounded-sm flex items-center justify-center text-[9px] font-bold text-white shadow-sm hover:scale-105 transition-transform cursor-pointer"
                    style={{ backgroundColor: bgHex }}
                    title={`${s.name} on ${labels[colIdx]}: ${val.toLocaleString()}`}
                  >
                    {Math.round(val)}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // 6. Sankey Chart
  if (chart_type === "sankey") {
    const sankeyData = series.map((s, idx) => ({
      source: labels[idx % labels.length] || "Source",
      target: s.name,
      value: Number(s.value ?? s.data?.[0] ?? 0)
    })).filter(d => d.value > 0).slice(0, 6);

    const totalVal = sankeyData.reduce((acc, curr) => acc + curr.value, 0) || 1;

    let sourceYOffset = 10;
    let targetYOffset = 10;

    return (
      <div style={bgStyle} className="flex flex-col h-full justify-between p-2">
        <svg className="w-full h-full min-h-0 overflow-hidden" viewBox="0 0 300 150">
          {sankeyData.map((flow, idx) => {
            const height = Math.max(10, (flow.value / totalVal) * 100);
            
            const currentSourceY = sourceYOffset;
            const currentTargetY = targetYOffset;
            
            sourceYOffset += height + 8;
            targetYOffset += height + 8;

            const x0 = 40, y0 = currentSourceY + height / 2;
            const x1 = 260, y1 = currentTargetY + height / 2;
            const pathD = `M ${x0} ${y0} C ${(x0 + x1) / 2} ${y0}, ${(x0 + x1) / 2} ${y1}, ${x1} ${y1}`;

            return (
              <g key={idx} className="hover:opacity-80 transition-opacity">
                <path
                  d={pathD}
                  fill="none"
                  stroke={colors[idx % colors.length]}
                  strokeWidth={height}
                  opacity="0.3"
                />
                <text x="35" y={currentSourceY + height/2 + 3} textAnchor="end" className="text-[8px] font-bold fill-slate-500">{flow.source}</text>
                <text x="265" y={currentTargetY + height/2 + 3} textAnchor="start" className="text-[8px] font-bold fill-slate-500">{flow.target}</text>
              </g>
            );
          })}
          <rect x="36" y="10" width="8" height={Math.min(130, sourceYOffset - 10)} fill="#475569" rx="2" />
          <rect x="256" y="10" width="8" height={Math.min(130, targetYOffset - 10)} fill="#475569" rx="2" />
        </svg>
      </div>
    );
  }

  // 7. Radar Chart
  if (chart_type === "radar") {
    return (
      <div style={bgStyle}>
        <ResponsiveContainer width="100%" height={chartHeight}>
          <RadarChart cx="50%" cy="50%" outerRadius="75%" data={chartData}>
            <PolarGrid stroke={opts.gridlineColor} />
            <PolarAngleAxis dataKey="label" tick={{ fontSize: 9, fill: "#64748b" }} />
            <PolarRadiusAxis angle={30} domain={[0, 'auto']} tick={{ fontSize: 8 }} />
            {series.map((s, i) => (
              <Radar
                key={s.name}
                name={s.name}
                dataKey={s.name}
                stroke={colors[i % colors.length]}
                fill={colors[i % colors.length]}
                fillOpacity={0.4}
              />
            ))}
            <Tooltip />
            {opts.showLegend && <Legend {...getLegendProps(opts.legendPosition)} />}
          </RadarChart>
        </ResponsiveContainer>
      </div>
    );
  }

  // 8. Geo Maps Chart
  if (chart_type === "map") {
    const mapData = series.map((s, idx) => ({
      region: labels[idx % labels.length] || "Other",
      value: Number(s.value ?? s.data?.[0] ?? 0),
      fill: colors[idx % colors.length]
    })).slice(0, 5);

    const maxVal = Math.max(...mapData.map(d => d.value)) || 1;

    const regionPaths = [
      { name: "North America", path: "M 30,30 Q 55,25 70,45 Q 60,65 40,60 Z", x: 45, y: 45 },
      { name: "South America", path: "M 55,68 Q 65,80 60,110 Q 50,105 45,85 Z", x: 55, y: 90 },
      { name: "Europe", path: "M 110,25 Q 130,22 140,40 Q 125,50 115,40 Z", x: 125, y: 35 },
      { name: "Africa", path: "M 110,55 Q 140,55 145,85 Q 125,115 110,95 Z", x: 125, y: 75 },
      { name: "Asia", path: "M 160,25 Q 215,20 230,60 Q 180,85 160,55 Z", x: 190, y: 45 },
      { name: "Australia", path: "M 200,105 Q 225,100 230,115 Q 210,125 195,115 Z", x: 215, y: 112 }
    ];

    return (
      <div style={bgStyle} className="flex h-full justify-between p-2 flex-col">
        <svg className="w-full h-full min-h-0 overflow-hidden bg-[#f8fafc] border border-[#f1f5f9] rounded-md" viewBox="0 0 260 140">
          {regionPaths.map((reg, idx) => {
            const dataMatch = mapData.find(d => d.region.toLowerCase().includes(reg.name.toLowerCase().split(" ")[0]));
            const val = dataMatch ? dataMatch.value : 0;
            const opacity = val ? 0.3 + (val / maxVal) * 0.7 : 0.08;
            const fill = dataMatch ? dataMatch.fill : "#94a3b8";

            return (
              <g key={idx} className="cursor-pointer group" onClick={() => onSelectCategory?.(reg.name)}>
                <path
                  d={reg.path}
                  fill={fill}
                  opacity={opacity}
                  stroke="#ffffff"
                  strokeWidth="1"
                  className="transition-all duration-300 group-hover:stroke-slate-400 group-hover:scale-105 origin-center"
                />
                <text x={reg.x} y={reg.y} className="text-[7px] font-bold fill-slate-600 pointer-events-none text-center opacity-0 group-hover:opacity-100 transition-opacity">
                  {reg.name} ({val.toLocaleString()})
                </text>
              </g>
            );
          })}
        </svg>
        <div className="flex gap-1.5 flex-wrap mt-1 text-[8px] justify-center">
          {mapData.map((d, idx) => (
            <span key={idx} className="flex items-center gap-1 font-semibold text-slate-500">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: d.fill }} />
              {d.region}: {d.value.toLocaleString()}
            </span>
          ))}
        </div>
      </div>
    );
  }

  // 9. Combo Chart
  if (chart_type === "combo") {
    return (
      <div style={bgStyle}>
        <ResponsiveContainer width="100%" height={chartHeight}>
          <ComposedChart {...commonProps}>
            {opts.showGridlines && <CartesianGrid strokeDasharray={opts.gridlineStyle} stroke={opts.gridlineColor} />}
            <XAxis dataKey="label" hide={!opts.showXAxis} tick={xAxisTickStyle} />
            <YAxis hide={!opts.showYAxis} tick={yAxisTickStyle} />
            <Tooltip />
            {opts.showLegend && <Legend {...getLegendProps(opts.legendPosition)} />}
            {series.map((s, i) => {
              if (i === 0) {
                return <Bar key={s.name} dataKey={s.name} fill={colors[i % colors.length]} barSize={28} />;
              }
              return <Line key={s.name} type="monotone" dataKey={s.name} stroke={colors[i % colors.length]} strokeWidth={2.5} dot={{ r: 4 }} />;
            })}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    );
  }

  // 10. Calendar Heatmap Chart
  if (chart_type === "calendar") {
    const maxVal = Math.max(...series.flatMap(s => s.data || [])) || 1;
    const minVal = Math.min(...series.flatMap(s => s.data || [])) || 0;
    const range = maxVal - minVal || 1;

    const weekLabels = ["W1", "W2", "W3", "W4"];
    const dayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

    return (
      <div style={bgStyle} className="flex flex-col h-full justify-between p-2">
        <div className="flex-1 flex flex-col">
          <div className="flex w-full mb-1">
            <span className="w-8 shrink-0" />
            {dayLabels.map((d, i) => (
              <span key={i} className="flex-1 text-center text-[8px] text-slate-400 font-bold">{d}</span>
            ))}
          </div>
          {weekLabels.map((week, weekIdx) => (
            <div key={weekIdx} className="flex w-full items-center mb-1">
              <span className="w-8 shrink-0 text-[8px] text-slate-400 font-bold text-right pr-1.5">{week}</span>
              {dayLabels.map((day, dayIdx) => {
                const cellIndex = weekIdx * 7 + dayIdx;
                const cellVal = Number(series[0]?.data?.[cellIndex % (series[0]?.data?.length || 1)] ?? 0);
                const ratio = (cellVal - minVal) / range;
                
                const r = Math.round(241 - ratio * 150);
                const g = Math.round(248 - ratio * 80);
                const b = Math.round(233 + ratio * 10);
                const bgHex = `rgba(${r}, ${g}, ${b}, 0.9)`;

                return (
                  <div
                    key={dayIdx}
                    className="flex-1 h-5 m-[1px] rounded-sm flex items-center justify-center hover:scale-110 transition-transform cursor-pointer"
                    style={{ backgroundColor: bgHex }}
                    title={`${week} ${day}: ${cellVal.toLocaleString()}`}
                  >
                    <span className="text-[7px] text-slate-500/80 font-mono font-bold">{cellIndex + 1}</span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // 11. Boxplot Chart
  if (chart_type === "boxplot") {
    const maxVal = Math.max(...series.flatMap(s => s.data || [])) || 1;
    const minVal = Math.min(...series.flatMap(s => s.data || [])) || 0;
    const range = maxVal - minVal || 1;

    return (
      <div style={bgStyle} className="flex flex-col h-full justify-between p-2">
        <div className="flex-1 flex gap-3.5 items-end justify-center min-h-0 px-4 border-b border-slate-200">
          {labels.slice(0, 5).map((label, idx) => {
            const dataVal = Number(series[0]?.data?.[idx] ?? 0);

            return (
              <div key={idx} className="flex-1 flex flex-col items-center h-full relative group">
                <svg className="w-full h-full overflow-visible" viewBox="0 0 30 100">
                  <line x1="15" y1="15" x2="15" y2="85" stroke="#64748b" strokeWidth="1.5" strokeDasharray="3 2" />
                  <line x1="8" y1="15" x2="22" y2="15" stroke="#64748b" strokeWidth="1.5" />
                  <line x1="8" y1="85" x2="22" y2="85" stroke="#64748b" strokeWidth="1.5" />
                  <rect x="5" y="30" width="20" height="40" fill={colors[idx % colors.length]} stroke="#334155" strokeWidth="1" rx="1" />
                  <line x1="5" y1="50" x2="25" y2="50" stroke="#ffffff" strokeWidth="2" />
                </svg>
                <div className="absolute top-0 opacity-0 group-hover:opacity-100 bg-slate-800 text-white text-[9px] rounded px-1.5 py-0.5 -translate-y-6 pointer-events-none transition-opacity font-mono z-30 text-center w-20">
                  {label}<br/>Val: {dataVal}
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex justify-between mt-1 text-[9px] text-slate-400 font-semibold px-2">
          {labels.slice(0, 5).map((label, idx) => (
            <span key={idx} className="flex-1 text-center truncate">{label}</span>
          ))}
        </div>
      </div>
    );
  }

  // default: bar
  return (
    <div style={bgStyle}>
      <ResponsiveContainer width="100%" height={chartHeight}>
        <BarChart
          {...commonProps}
          barCategoryGap={`${opts.barsPadding * 100}%`}
          onClick={(data) => {
            if (data && data.activeLabel) onSelectCategory?.(data.activeLabel);
          }}
        >
          {opts.showGridlines && <CartesianGrid strokeDasharray={opts.gridlineStyle} stroke={opts.gridlineColor} />}
          <XAxis dataKey="label" hide={!opts.showXAxis} tick={xAxisTickStyle} />
          <YAxis hide={!opts.showYAxis} tick={yAxisTickStyle} />
          <Tooltip />
          {opts.showLegend && <Legend {...getLegendProps(opts.legendPosition)} />}
          {series.map((s, i) => (
            <Bar key={s.name} dataKey={s.name} fill={series.length === 1 && opts.barsColor ? opts.barsColor : colors[i % colors.length]}>
              {series.map((entry, idx) => {
                const labelVal = labels[idx];
                const isSelected = activeFilters && activeFilters[labelVal];
                const hasAnyFilter = activeFilters && Object.keys(activeFilters).length > 0;
                const opacity = hasAnyFilter && !isSelected ? 0.35 : 1;
                let fillVal = series.length === 1 && opts.barsColor ? opts.barsColor : colors[i % colors.length];
                const cellVal = Number(s.data?.[idx] ?? 0);
                if (opts.conditionalFormattingEnabled) {
                  if (opts.conditionalMinThreshold !== undefined && cellVal < opts.conditionalMinThreshold) {
                    fillVal = opts.conditionalMinColor || "#ef4444";
                  } else if (opts.conditionalMaxThreshold !== undefined && cellVal > opts.conditionalMaxThreshold) {
                    fillVal = opts.conditionalMaxColor || "#10b981";
                  }
                }
                return (
                  <Cell
                    key={`cell-${idx}`}
                    fill={fillVal}
                    opacity={opacity}
                  />
                );
              })}
              {opts.showDataLabels && <LabelList position="top" style={{ fontSize: opts.dataLabelsSize, fill: opts.dataLabelsColor, fontFamily: opts.xAxisFontFamily }} />}
              {opts.showErrorBars && <ErrorBar dataKey={`${s.name}_error`} width={4} strokeWidth={1.5} stroke={colors[i % colors.length]} direction="y" />}
            </Bar>
          ))}
          {opts.showXConstantLine && opts.xConstantLineValue && (
            <ReferenceLine
              x={opts.xConstantLineValue}
              stroke={opts.xConstantLineColor}
              strokeWidth={1.5}
              strokeDasharray="4 4"
              label={{
                value: opts.xConstantLineLabel || "Constant Line",
                position: "top",
                fill: opts.xConstantLineColor,
                fontSize: 9,
                fontWeight: "bold",
              }}
            />
          )}
          {opts.showZoomSlider && <Brush dataKey="label" height={20} stroke="#118d95" />}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
