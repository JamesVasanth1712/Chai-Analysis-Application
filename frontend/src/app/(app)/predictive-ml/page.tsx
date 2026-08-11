"use client";

import { useState, useEffect, useCallback } from "react";
import { datasetsApi, mlApi } from "@/lib/api";
import { Dataset } from "@/types/bi";
import {
  TrendingUp,
  AlertTriangle,
  Users,
  Play,
  Loader2,
  Calendar,
  Layers,
  CheckCircle,
  HelpCircle,
  Sparkles,
} from "lucide-react";
import toast from "react-hot-toast";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

// Simple Markdown Parser (from AnalysisResponseCard)
function parseLine(line: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let current = line;
  const regex = /(\*\*.*?\*\*|`.*?`)/g;
  const matches = [...current.matchAll(regex)];

  if (matches.length === 0) {
    return <span>{line}</span>;
  }

  let lastIndex = 0;
  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const text = match[0];
    const index = match.index!;

    if (index > lastIndex) {
      parts.push(<span key={`text-${lastIndex}`}>{current.substring(lastIndex, index)}</span>);
    }

    if (text.startsWith("**") && text.endsWith("**")) {
      parts.push(
        <strong key={`bold-${index}`} className="font-semibold text-foreground">
          {text.slice(2, -2)}
        </strong>
      );
    } else if (text.startsWith("`") && text.endsWith("`")) {
      parts.push(
        <code key={`code-${index}`} className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono text-primary border border-border/40">
          {text.slice(1, -1)}
        </code>
      );
    }

    lastIndex = index + text.length;
  }

  if (lastIndex < current.length) {
    parts.push(<span key={`text-${lastIndex}`}>{current.substring(lastIndex)}</span>);
  }

  return <>{parts}</>;
}

function renderMarkdown(text: string): React.ReactNode {
  if (!text) return null;

  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let currentList: React.ReactNode[] = [];
  let inList = false;

  const flushList = (key: number) => {
    if (currentList.length > 0) {
      elements.push(
        <ul key={`list-${key}`} className="list-disc pl-5 mb-4 space-y-1 text-sm text-muted-foreground">
          {currentList}
        </ul>
      );
      currentList = [];
    }
    inList = false;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith("# ")) {
      flushList(i);
      const title = trimmed.substring(2);
      elements.push(
        <div key={`h1-${i}`} className="flex items-center gap-2 mt-6 mb-3 border-b border-border/50 pb-1.5 first:mt-0">
          <Sparkles className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-bold text-foreground tracking-tight uppercase">{title}</h2>
        </div>
      );
    } else if (trimmed.startsWith("## ")) {
      flushList(i);
      elements.push(
        <h3 key={`h2-${i}`} className="text-xs font-bold text-foreground/80 mt-4 mb-2">
          {parseLine(trimmed.substring(3))}
        </h3>
      );
    } else if (trimmed.startsWith("### ")) {
      flushList(i);
      elements.push(
        <h4 key={`h3-${i}`} className="text-xs font-semibold text-muted-foreground mt-3 mb-1">
          {parseLine(trimmed.substring(4))}
        </h4>
      );
    } else if (trimmed.startsWith("* ") || trimmed.startsWith("- ")) {
      inList = true;
      const content = trimmed.substring(2);
      currentList.push(
        <li key={`li-${i}-${currentList.length}`} className="leading-relaxed">
          {parseLine(content)}
        </li>
      );
    } else if (/^\d+\.\s/.test(trimmed)) {
      flushList(i);
      const match = trimmed.match(/^(\d+)\.\s(.*)/);
      if (match) {
        elements.push(
          <div key={`num-${i}`} className="flex items-start gap-2 mb-2 text-sm">
            <span className="font-semibold text-primary">{match[1]}.</span>
            <div className="flex-1 text-muted-foreground">{parseLine(match[2])}</div>
          </div>
        );
      }
    } else if (trimmed === "") {
      flushList(i);
    } else {
      if (inList) {
        flushList(i);
      }
      elements.push(
        <p key={`p-${i}`} className="text-sm text-muted-foreground leading-relaxed mb-2.5">
          {parseLine(line)}
        </p>
      );
    }
  }

  flushList(lines.length);
  return <div className="space-y-1">{elements}</div>;
}

export default function PredictiveMLPage() {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [loadingDatasets, setLoadingDatasets] = useState(true);
  const [selectedDatasetId, setSelectedDatasetId] = useState<string>("");

  const [modelType, setModelType] = useState<"forecast" | "anomalies" | "segmentation">("forecast");
  const [dateColumn, setDateColumn] = useState<string>("");
  const [metricColumn, setMetricColumn] = useState<string>("");
  const [metricColumns, setMetricColumns] = useState<string[]>([]);
  const [forecastHorizon, setForecastHorizon] = useState<number>(30);
  const [nClusters, setNClusters] = useState<number>(3);
  const [features, setFeatures] = useState<string[]>([]);

  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  // AutoML & Model Comparison states
  const [recommendations, setRecommendations] = useState<any[]>([]);
  const [loadingRecs, setLoadingRecs] = useState(false);
  const [comparisonResult, setComparisonResult] = useState<any>(null);
  const [comparing, setComparing] = useState(false);

  const loadRecommendations = useCallback(async (datasetId: string) => {
    if (!datasetId) return;
    setLoadingRecs(true);
    setRecommendations([]);
    try {
      const data = await mlApi.recommend(datasetId);
      setRecommendations(data.recommendations || []);
    } catch (err) {
      console.error("Failed to load recommendations", err);
    } finally {
      setLoadingRecs(false);
    }
  }, []);

  const compareModels = async () => {
    if (!selectedDatasetId || !dateColumn || !metricColumn) {
      toast.error("Please select a dataset, date, and metric column first");
      return;
    }
    setComparing(true);
    setComparisonResult(null);
    try {
      const res = await mlApi.compareModels({
        dataset_id: selectedDatasetId,
        date_column: dateColumn,
        metric_column: metricColumn
      });
      setComparisonResult(res);
      toast.success("Model comparison complete!");
    } catch (err: any) {
      const msg = err.response?.data?.detail || err.message || "Comparison failed";
      toast.error(msg);
    } finally {
      setComparing(false);
    }
  };

  // Load datasets
  const loadDatasets = useCallback(async () => {
    try {
      const data = await datasetsApi.list();
      setDatasets(data.filter((d: Dataset) => d.status === "ready"));
      if (data.length > 0) {
        setSelectedDatasetId(data[0].id);
      }
    } catch (err) {
      toast.error("Failed to load datasets");
    } finally {
      setLoadingDatasets(false);
    }
  }, []);

  useEffect(() => {
    loadDatasets();
  }, [loadDatasets]);

  useEffect(() => {
    if (selectedDatasetId) {
      loadRecommendations(selectedDatasetId);
      setComparisonResult(null);
    }
  }, [selectedDatasetId, loadRecommendations]);

  // Selected dataset details
  const activeDataset = datasets.find((d) => d.id === selectedDatasetId);

  // Set default column selections when dataset or model changes
  useEffect(() => {
    if (activeDataset) {
      const colNames = activeDataset.columns;
      const colTypes = activeDataset.column_types || {};

      // Filter columns
      const dateCols = colNames.filter((c) => {
        const type = (colTypes[c] || "").toUpperCase();
        return type.includes("DATE") || type.includes("TIME") || type.includes("TIMESTAMP");
      });
      const numCols = colNames.filter((c) => {
        const type = (colTypes[c] || "").toUpperCase();
        return (
          type.includes("INT") ||
          type.includes("FLOAT") ||
          type.includes("DOUBLE") ||
          type.includes("NUMERIC") ||
          type.includes("DECIMAL") ||
          type.includes("REAL")
        );
      });

      // Default date column
      if (dateCols.length > 0) {
        setDateColumn(dateCols[0]);
      } else {
        // Fallback to columns containing date-like names
        const dateLike = colNames.find((c) =>
          ["date", "time", "created", "timestamp", "year", "month"].some((k) =>
            c.toLowerCase().includes(k)
          )
        );
        setDateColumn(dateLike || colNames[0] || "");
      }

      // Default metric column
      if (numCols.length > 0) {
        setMetricColumn(numCols[0]);
        setMetricColumns([numCols[0]]);
        setFeatures(colNames.slice(0, 3));
      } else {
        setMetricColumn(colNames[0] || "");
        setMetricColumns(colNames.slice(0, 1));
        setFeatures(colNames.slice(0, 3));
      }
    }
  }, [activeDataset]);

  const runModel = async () => {
    if (!selectedDatasetId) {
      toast.error("Please select a dataset first");
      return;
    }
    setRunning(true);
    setResult(null);
    setError(null);

    try {
      let data: any;
      if (modelType === "forecast") {
        if (!dateColumn || !metricColumn) {
          toast.error("Both Date and Metric columns must be selected");
          setRunning(false);
          return;
        }
        data = await mlApi.forecast({
          dataset_id: selectedDatasetId,
          date_column: dateColumn,
          metric_column: metricColumn,
          periods: forecastHorizon,
        });
      } else if (modelType === "anomalies") {
        if (!dateColumn || metricColumns.length === 0) {
          toast.error("Select a Date column and at least one metric");
          setRunning(false);
          return;
        }
        data = await mlApi.anomalies({
          dataset_id: selectedDatasetId,
          date_column: dateColumn,
          metric_columns: metricColumns,
        });
      } else if (modelType === "segmentation") {
        if (features.length < 2) {
          toast.error("Select at least 2 features for K-Means clustering");
          setRunning(false);
          return;
        }
        data = await mlApi.segmentation({
          dataset_id: selectedDatasetId,
          features: features,
          n_clusters: nClusters,
        });
      }
      setResult(data);
      toast.success("Analysis complete!");
    } catch (err: any) {
      const msg = err.response?.data?.detail || err.message || "Model execution failed";
      setError(msg);
      toast.error(msg);
    } finally {
      setRunning(false);
    }
  };

  const handleMetricToggle = (col: string) => {
    if (metricColumns.includes(col)) {
      setMetricColumns(metricColumns.filter((c) => c !== col));
    } else {
      setMetricColumns([...metricColumns, col]);
    }
  };

  const handleFeatureToggle = (col: string) => {
    if (features.includes(col)) {
      setFeatures(features.filter((c) => c !== col));
    } else {
      setFeatures([...features, col]);
    }
  };

  // Helper lists
  const columnNames = activeDataset?.columns || [];
  const colTypes = activeDataset?.column_types || {};
  const numericColumnsList = columnNames.filter((c) => {
    const type = (colTypes[c] || "").toUpperCase();
    return (
      type.includes("INT") ||
      type.includes("FLOAT") ||
      type.includes("DOUBLE") ||
      type.includes("NUMERIC") ||
      type.includes("DECIMAL") ||
      type.includes("REAL")
    );
  });

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <TrendingUp className="h-6 w-6 text-primary" /> Predictive ML Analytics
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Apply advanced statistical & machine learning models to your uploaded datasets visually.
        </p>
      </div>

      {loadingDatasets ? (
        <div className="flex justify-center items-center h-48 bg-card border border-border rounded-xl">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : datasets.length === 0 ? (
        <div className="text-center py-16 bg-card border border-border rounded-xl space-y-4">
          <TrendingUp className="h-12 w-12 mx-auto text-muted-foreground/40" />
          <p className="text-muted-foreground text-sm">No ready datasets found to analyze.</p>
          <a
            href="/datasets"
            className="inline-block px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            Upload a dataset
          </a>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Controls Sidebar */}
          <div className="space-y-6">
            {/* Dataset selection */}
            <div className="bg-card border border-border rounded-xl p-5 space-y-4 shadow-sm">
              <h2 className="text-sm font-bold tracking-tight uppercase text-muted-foreground">
                1. Select Dataset
              </h2>
              <select
                value={selectedDatasetId}
                onChange={(e) => setSelectedDatasetId(e.target.value)}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                {datasets.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.row_count.toLocaleString()} rows)
                  </option>
                ))}
              </select>
            </div>

            {/* AutoML Suggestions */}
            <div className="bg-card border border-border rounded-xl p-5 space-y-4 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold tracking-tight uppercase text-muted-foreground flex items-center gap-1.5">
                  <Sparkles className="h-4 w-4 text-amber-500 animate-pulse" /> AutoML Recommendations
                </h2>
                {loadingRecs && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
              </div>
              
              {loadingRecs ? (
                <div className="space-y-2 py-2">
                  <div className="h-12 bg-muted/50 rounded-lg animate-pulse" />
                  <div className="h-12 bg-muted/50 rounded-lg animate-pulse" />
                </div>
              ) : recommendations.length === 0 ? (
                <p className="text-xs text-muted-foreground">Select a dataset to see suggestions.</p>
              ) : (
                <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
                  {recommendations.map((rec, idx) => (
                    <div 
                      key={idx} 
                      className="border border-border/80 hover:border-primary/50 bg-background/50 hover:bg-primary/5 rounded-lg p-3 text-left transition-all duration-200 cursor-pointer group relative overflow-hidden"
                      onClick={() => {
                        if (rec.model_type === "Forecasting") {
                          setModelType("forecast");
                          if (rec.params.date_column) setDateColumn(rec.params.date_column);
                          if (rec.params.metric_column) setMetricColumn(rec.params.metric_column);
                        } else if (rec.model_type === "Anomaly Detection") {
                          setModelType("anomalies");
                          if (rec.params.date_column) setDateColumn(rec.params.date_column);
                          if (rec.params.metric_columns) setMetricColumns(rec.params.metric_columns);
                        } else if (rec.model_type === "Clustering") {
                          setModelType("segmentation");
                          if (rec.params.features) setFeatures(rec.params.features);
                          if (rec.params.n_clusters) setNClusters(rec.params.n_clusters);
                        }
                        toast.success(`Applied: ${rec.name}`);
                      }}
                    >
                      <div className="absolute top-0 right-0 w-16 h-16 bg-primary/5 rounded-bl-full translate-x-4 -translate-y-4 group-hover:scale-110 transition-transform" />
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <span className="font-semibold text-xs text-foreground group-hover:text-primary transition-colors">
                          {rec.name}
                        </span>
                        <span className="shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                          {Math.round(rec.confidence * 100)}% Match
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        {rec.reason}
                      </p>
                      <div className="mt-2 flex items-center gap-1.5 text-[10px] text-primary font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                        <span>Apply configuration</span> →
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Model Selection */}
            <div className="bg-card border border-border rounded-xl p-5 space-y-4 shadow-sm">
              <h2 className="text-sm font-bold tracking-tight uppercase text-muted-foreground">
                2. Select ML Model
              </h2>
              <div className="grid grid-cols-3 gap-2 bg-background p-1.5 border border-border rounded-lg">
                <button
                  onClick={() => setModelType("forecast")}
                  className={`flex flex-col items-center justify-center py-3 px-1 rounded-lg text-xs font-medium transition-colors ${
                    modelType === "forecast"
                      ? "bg-primary text-white shadow-sm"
                      : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                  }`}
                >
                  <Calendar className="h-4 w-4 mb-1" />
                  Forecast
                </button>
                <button
                  onClick={() => setModelType("anomalies")}
                  className={`flex flex-col items-center justify-center py-3 px-1 rounded-lg text-xs font-medium transition-colors ${
                    modelType === "anomalies"
                      ? "bg-primary text-white shadow-sm"
                      : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                  }`}
                >
                  <AlertTriangle className="h-4 w-4 mb-1" />
                  Anomalies
                </button>
                <button
                  onClick={() => setModelType("segmentation")}
                  className={`flex flex-col items-center justify-center py-3 px-1 rounded-lg text-xs font-medium transition-colors ${
                    modelType === "segmentation"
                      ? "bg-primary text-white shadow-sm"
                      : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                  }`}
                >
                  <Users className="h-4 w-4 mb-1" />
                  Segment
                </button>
              </div>
            </div>

            {/* Parameters Settings */}
            <div className="bg-card border border-border rounded-xl p-5 space-y-4 shadow-sm">
              <h2 className="text-sm font-bold tracking-tight uppercase text-muted-foreground">
                3. Model Parameters
              </h2>

              {modelType === "forecast" && (
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Date Column</label>
                    <select
                      value={dateColumn}
                      onChange={(e) => setDateColumn(e.target.value)}
                      className="w-full bg-background border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                    >
                      {columnNames.map((c) => (
                        <option key={c} value={c}>
                          {c} ({colTypes[c] || "text"})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Metric Column</label>
                    <select
                      value={metricColumn}
                      onChange={(e) => setMetricColumn(e.target.value)}
                      className="w-full bg-background border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                    >
                      {numericColumnsList.map((c) => (
                        <option key={c} value={c}>
                          {c} ({colTypes[c] || "numeric"})
                        </option>
                      ))}
                    </select>
                    {numericColumnsList.length === 0 && (
                      <p className="text-[10px] text-red-500 mt-1">No numeric columns detected in this dataset</p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs font-medium text-muted-foreground">
                      <span>Forecast Horizon</span>
                      <span className="text-primary font-bold">{forecastHorizon} Days</span>
                    </div>
                    <input
                      type="range"
                      min={7}
                      max={90}
                      value={forecastHorizon}
                      onChange={(e) => setForecastHorizon(parseInt(e.target.value))}
                      className="w-full accent-primary h-1 bg-muted rounded-lg appearance-none cursor-pointer"
                    />
                  </div>

                  <div className="pt-2 border-t border-border/50">
                    <button
                      onClick={compareModels}
                      disabled={comparing}
                      className="w-full py-1.5 bg-muted hover:bg-muted/80 text-foreground font-medium rounded-lg text-xs transition-colors flex items-center justify-center gap-1.5 border border-border cursor-pointer disabled:opacity-50"
                    >
                      {comparing ? (
                        <>
                          <Loader2 className="h-3 w-3 animate-spin" /> Comparing Models...
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-3.5 w-3.5 text-primary animate-pulse" /> Compare Forecast Algorithms
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {modelType === "anomalies" && (
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Date Column</label>
                    <select
                      value={dateColumn}
                      onChange={(e) => setDateColumn(e.target.value)}
                      className="w-full bg-background border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                    >
                      {columnNames.map((c) => (
                        <option key={c} value={c}>
                          {c} ({colTypes[c] || "text"})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Analyze Columns (Multi-select)</label>
                    <div className="max-h-36 overflow-y-auto border border-border rounded-lg p-2.5 space-y-1.5 bg-background">
                      {numericColumnsList.map((c) => (
                        <label key={c} className="flex items-center gap-2 text-xs cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={metricColumns.includes(c)}
                            onChange={() => handleMetricToggle(c)}
                            className="rounded border-border text-primary focus:ring-primary w-3.5 h-3.5"
                          />
                          <span className="truncate">{c}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {modelType === "segmentation" && (
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Input Features (Select 2+)</label>
                    <div className="max-h-36 overflow-y-auto border border-border rounded-lg p-2.5 space-y-1.5 bg-background">
                      {columnNames.map((c) => (
                        <label key={c} className="flex items-center gap-2 text-xs cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={features.includes(c)}
                            onChange={() => handleFeatureToggle(c)}
                            className="rounded border-border text-primary focus:ring-primary w-3.5 h-3.5"
                          />
                          <span className="truncate">{c}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs font-medium text-muted-foreground">
                      <span>Number of Clusters (K)</span>
                      <span className="text-primary font-bold">{nClusters} Clusters</span>
                    </div>
                    <input
                      type="range"
                      min={2}
                      max={8}
                      value={nClusters}
                      onChange={(e) => setNClusters(parseInt(e.target.value))}
                      className="w-full accent-primary h-1 bg-muted rounded-lg appearance-none cursor-pointer"
                    />
                  </div>
                </div>
              )}

              <button
                onClick={runModel}
                disabled={running}
                className="w-full py-2.5 bg-primary hover:bg-primary/95 text-primary-foreground font-semibold rounded-lg text-sm transition-all shadow-md hover:shadow-lg disabled:opacity-50 flex items-center justify-center gap-2 border border-primary/20 cursor-pointer"
              >
                {running ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Running Analysis...
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4" /> Run Predictive Analysis
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Results Area */}
          <div className="lg:col-span-2 space-y-6">
            {running && (
              <div className="h-96 flex flex-col justify-center items-center bg-card border border-border rounded-xl space-y-3">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Calculating algorithm formulas...</p>
              </div>
            )}

            {comparing && (
              <div className="h-96 flex flex-col justify-center items-center bg-card border border-border rounded-xl space-y-3">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Fitting ARIMA, ETS & Naive models for validation...</p>
              </div>
            )}

            {!running && !comparing && comparisonResult && (
              <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-5 animate-slide-up">
                <div className="flex items-center justify-between border-b border-border/50 pb-3">
                  <div>
                    <h3 className="text-sm font-bold text-foreground flex items-center gap-1.5">
                      <Sparkles className="h-4 w-4 text-primary" /> Forecast Algorithm Comparison
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Evaluated on {comparisonResult.validation_points_count} validation data points (80/20 train/test split).
                    </p>
                  </div>
                  <span className="inline-flex items-center px-2 py-1 rounded text-xs font-semibold bg-primary/10 text-primary border border-primary/20">
                    Winner: {comparisonResult.best_model}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Rankings Table */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground text-foreground/80">Error Metric Rankings</h4>
                    <div className="overflow-hidden border border-border/60 rounded-lg">
                      <table className="w-full text-xs text-left border-collapse">
                        <thead>
                          <tr className="border-b border-border bg-muted/20 text-muted-foreground">
                            <th className="p-2 font-semibold">Model</th>
                            <th className="p-2 font-semibold text-right">MAPE (%)</th>
                            <th className="p-2 font-semibold text-right">MAE</th>
                            <th className="p-2 font-semibold text-right">RMSE</th>
                          </tr>
                        </thead>
                        <tbody>
                          {comparisonResult.rankings.map((rank: any, i: number) => (
                            <tr 
                              key={rank.model} 
                              className={`border-b border-border/40 hover:bg-muted/10 last:border-0 ${
                                rank.model === comparisonResult.best_model ? "bg-emerald-500/5 text-emerald-500" : ""
                              }`}
                            >
                              <td className="p-2 font-medium flex items-center gap-1">
                                {i === 0 && "🏆"} {rank.model}
                              </td>
                              <td className="p-2 font-mono text-right">{rank.mape.toFixed(2)}%</td>
                              <td className="p-2 font-mono text-right">{rank.mae.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                              <td className="p-2 font-mono text-right">{rank.rmse.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      * MAPE: Mean Absolute Percentage Error. Lower error metrics represent higher prediction accuracy.
                    </p>
                  </div>

                  {/* Recharts Bar Chart of MAPE */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground text-foreground/80">Model Error Comparison (MAPE %)</h4>
                    <div className="h-44 pt-1">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={comparisonResult.rankings}
                          layout="vertical"
                          margin={{ top: 5, right: 15, left: -20, bottom: 5 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" horizontal={false} className="stroke-muted/30" />
                          <XAxis type="number" tick={{ fontSize: 9 }} stroke="currentColor" className="text-muted-foreground" unit="%" />
                          <YAxis dataKey="model" type="category" tick={{ fontSize: 9 }} stroke="currentColor" className="text-muted-foreground" />
                          <Tooltip 
                            contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))", fontSize: 10 }}
                            formatter={(value: any) => [`${parseFloat(value).toFixed(2)}%`, 'Error (MAPE)']}
                          />
                          <Bar 
                            dataKey="mape" 
                            radius={[0, 4, 4, 0]}
                            fill="#3b82f6"
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {!running && !result && !error && (
              <div className="h-96 flex flex-col justify-center items-center text-center p-8 bg-card/40 border border-border/60 rounded-xl border-dashed">
                <Layers className="h-10 w-10 text-muted-foreground/30 mb-3" />
                <h3 className="text-sm font-semibold text-foreground/80">Prediction Workbench Ready</h3>
                <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                  Configure the ML models in the left panel and click run to view predictive forecasts, auto-detected anomalies, or cluster analysis.
                </p>
              </div>
            )}

            {!running && error && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6 shadow-sm space-y-3 flex items-start gap-4 animate-slide-up">
                <AlertTriangle className="h-6 w-6 text-red-500 mt-0.5 shrink-0" />
                <div className="space-y-1">
                  <h3 className="text-sm font-semibold text-red-500">Analysis Failed</h3>
                  <p className="text-xs text-red-400 leading-relaxed">{error}</p>
                </div>
              </div>
            )}

            {result && (
              <div className="space-y-6 animate-slide-up">
                {/* Visual Chart */}
                <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
                  <h3 className="text-sm font-semibold text-foreground">
                    {modelType === "forecast" && `Time-Series Forecast: ${result.metric}`}
                    {modelType === "anomalies" && `Anomaly Detection: ${result.metric}`}
                    {modelType === "segmentation" && `K-Means Segments size`}
                  </h3>
                  <div className="h-64 pt-2">
                    <ResponsiveContainer width="100%" height="100%">
                      {modelType === "forecast" ? (
                        <LineChart data={result.chart_data} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-muted/30" />
                          <XAxis dataKey="date" tick={{ fontSize: 9 }} stroke="currentColor" className="text-muted-foreground" />
                          <YAxis tick={{ fontSize: 9 }} stroke="currentColor" className="text-muted-foreground" />
                          <Tooltip contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))", fontSize: 10 }} />
                          <Legend wrapperStyle={{ fontSize: 10 }} />
                          <Line
                            type="monotone"
                            dataKey="Actual"
                            stroke="#3b82f6"
                            strokeWidth={2}
                            dot={{ r: 1 }}
                            activeDot={{ r: 4 }}
                          />
                          <Line
                            type="monotone"
                            dataKey="Forecast"
                            stroke="#a855f7"
                            strokeDasharray="5 5"
                            strokeWidth={2}
                            dot={false}
                          />
                        </LineChart>
                      ) : modelType === "anomalies" ? (
                        <LineChart data={result.chart_data} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-muted/30" />
                          <XAxis dataKey="date" tick={{ fontSize: 9 }} stroke="currentColor" className="text-muted-foreground" />
                          <YAxis tick={{ fontSize: 9 }} stroke="currentColor" className="text-muted-foreground" />
                          <Tooltip contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))", fontSize: 10 }} />
                          <Legend wrapperStyle={{ fontSize: 10 }} />
                          <Line
                            type="monotone"
                            dataKey="Value"
                            stroke="#3b82f6"
                            strokeWidth={1.5}
                            dot={false}
                          />
                          <Line
                            type="monotone"
                            dataKey="Anomaly"
                            stroke="#ef4444"
                            strokeWidth={0}
                            dot={{ r: 5, fill: "#ef4444", stroke: "#fff", strokeWidth: 1.5 }}
                          />
                        </LineChart>
                      ) : (
                        <BarChart data={result.chart_data} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-muted/30" />
                          <XAxis dataKey="Segment" tick={{ fontSize: 9 }} stroke="currentColor" className="text-muted-foreground" />
                          <YAxis tick={{ fontSize: 9 }} stroke="currentColor" className="text-muted-foreground" />
                          <Tooltip contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))", fontSize: 10 }} />
                          <Legend wrapperStyle={{ fontSize: 10 }} />
                          <Bar dataKey="Size" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      )}
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Text summary description */}
                <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
                  {renderMarkdown(result.summary)}
                </div>

                {/* Extra table for Segmentation Details */}
                {modelType === "segmentation" && result.segments && (
                  <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-3">
                    <h3 className="text-sm font-semibold text-foreground">Cluster Feature Averages</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-left border-collapse">
                        <thead>
                          <tr className="border-b border-border bg-muted/20">
                            <th className="p-2.5 font-bold">Cluster ID</th>
                            <th className="p-2.5 font-bold">Size</th>
                            <th className="p-2.5 font-bold">Percentage</th>
                            {features.map((f) => (
                              <th key={f} className="p-2.5 font-bold">Avg {f}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {result.segments.map((s: any) => (
                            <tr key={s.cluster_id} className="border-b border-border hover:bg-muted/10">
                              <td className="p-2.5 font-semibold">Cluster {s.cluster_id}</td>
                              <td className="p-2.5">{s.size.toLocaleString()} rows</td>
                              <td className="p-2.5">{s.percentage.toFixed(1)}%</td>
                              {features.map((f) => (
                                <td key={f} className="p-2.5 font-mono">
                                  {s.stats[f]?.mean?.toLocaleString(undefined, {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                  }) || "0.00"}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
