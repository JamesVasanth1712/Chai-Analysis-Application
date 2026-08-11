"use client";

import { useState, useEffect, useCallback } from "react";
import { datasetsApi } from "@/lib/api";
import { Dataset } from "@/types/bi";
import { UploadDropzone } from "@/components/datasets/UploadDropzone";
import toast from "react-hot-toast";
import {
  Layers,
  Database,
  RefreshCw,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Play,
  Sparkles,
  HelpCircle,
  BarChart3,
  Sliders,
  ChevronDown,
  Loader2,
  Grid,
} from "lucide-react";

export default function DatasetsPage() {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<{ dataset: Dataset; rows: Record<string, unknown>[]; columns: string[] } | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  // Quality & Cleaning States
  const [activeTab, setActiveTab] = useState<"preview" | "profile" | "clean">("preview");
  const [stats, setStats] = useState<any | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [cleaningAction, setCleaningAction] = useState(false);
  const [cleanCol, setCleanCol] = useState("");
  const [cleanFillVal, setCleanFillVal] = useState("");

  const load = useCallback(async () => {
    try {
      const data = await datasetsApi.list();
      setDatasets(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const loadStats = useCallback(async (id: string) => {
    setLoadingStats(true);
    try {
      const data = await datasetsApi.stats(id);
      setStats(data);
    } catch {
      toast.error("Failed to load dataset quality profile");
    } finally {
      setLoadingStats(false);
    }
  }, []);

  async function openPreview(ds: Dataset) {
    try {
      const res = await datasetsApi.preview(ds.id, 50);
      setPreview({ dataset: ds, rows: res.rows, columns: res.columns });
      setActiveTab("preview");
      setStats(null);
      loadStats(ds.id);
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Failed to load preview");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this dataset? This cannot be undone.")) return;
    setDeleting(id);
    try {
      await datasetsApi.delete(id);
      setDatasets((prev) => prev.filter((d) => d.id !== id));
      if (preview?.dataset.id === id) setPreview(null);
      toast.success("Dataset deleted");
    } finally {
      setDeleting(null);
    }
  }

  async function handleClean(action: string, column?: string, fillValue?: string) {
    if (!preview) return;
    setCleaningAction(true);
    const toastId = toast.loading("Processing data cleaning query...");
    try {
      const res = await datasetsApi.clean(preview.dataset.id, {
        action,
        column,
        fill_value: fillValue,
      });
      toast.success(res.message || "Data cleaning succeeded!", { id: toastId });
      
      // Reload stats and preview
      const ds = preview.dataset;
      const previewRes = await datasetsApi.preview(ds.id, 50);
      setPreview({ 
        dataset: { ...ds, row_count: res.row_count || ds.row_count, columns: res.columns || ds.columns }, 
        rows: previewRes.rows, 
        columns: previewRes.columns 
      });
      loadStats(ds.id);
      load(); // Reload datasets list to update rows count in UI
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Cleaning operation failed", { id: toastId });
    } finally {
      setCleaningAction(false);
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto text-left">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Database className="h-6 w-6 text-primary" /> Dataset Analytics & Catalog
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Upload CSV, JSON, or Excel files, profile data quality, and run cleaning tasks.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Upload Panel */}
        <div className="space-y-6 lg:col-span-1">
          <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
            <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Upload New Dataset
            </h2>
            <UploadDropzone onSuccess={load} />
          </div>

          {/* Dataset list card */}
          <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
            <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Your Catalog ({datasets.length})
            </h2>
            {loading ? (
              <div className="flex justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
              </div>
            ) : datasets.length === 0 ? (
              <p className="text-xs text-muted-foreground italic text-center py-4 border border-dashed border-border rounded-lg">
                No uploaded datasets. Use the dropzone above to upload a file.
              </p>
            ) : (
              <div className="space-y-2.5 max-h-[400px] overflow-y-auto pr-1">
                {datasets.map((ds) => {
                  const isSelected = preview?.dataset.id === ds.id;
                  return (
                    <div
                      key={ds.id}
                      onClick={() => openPreview(ds)}
                      className={`p-3 border rounded-lg text-left transition-all duration-200 cursor-pointer group ${
                        isSelected
                          ? "border-primary bg-primary/5 shadow-sm"
                          : "border-border bg-background/50 hover:bg-muted/40 hover:border-slate-300"
                      }`}
                    >
                      <h4 className="font-semibold text-xs text-foreground truncate group-hover:text-primary transition-colors">
                        {ds.name}
                      </h4>
                      <div className="flex items-center justify-between gap-1.5 mt-1.5">
                        <span className="text-[10px] text-muted-foreground font-mono truncate max-w-[140px]">
                          {ds.original_filename}
                        </span>
                        <span className="text-[10px] text-muted-foreground font-medium shrink-0">
                          {ds.row_count.toLocaleString()} rows
                        </span>
                      </div>
                      <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/40">
                        <span
                          className={`text-[9px] font-bold uppercase tracking-wider ${
                            ds.status === "ready"
                              ? "text-emerald-500"
                              : ds.status === "failed"
                              ? "text-red-500"
                              : "text-amber-500 animate-pulse"
                          }`}
                        >
                          {ds.status}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(ds.id);
                          }}
                          disabled={deleting === ds.id}
                          className="text-[10px] text-slate-400 hover:text-red-500 p-0.5 rounded transition-colors"
                          title="Delete Dataset"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Preview / Profiling / Cleaning Panel */}
        <div className="lg:col-span-2">
          {preview ? (
            <div className="bg-card border border-border rounded-xl shadow-md overflow-hidden animate-slide-up flex flex-col h-full min-h-[500px]">
              {/* Tab Header */}
              <div className="flex items-center justify-between px-5 py-3 border-b border-border/50 bg-slate-900/10 shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs font-bold text-slate-800 bg-primary/10 border border-primary/20 px-2 py-0.5 rounded truncate">
                    {preview.dataset.name}
                  </span>
                </div>
                <button
                  onClick={() => setPreview(null)}
                  className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
                >
                  ✕ Close Preview
                </button>
              </div>

              {/* Navigation Tabs */}
              <div className="flex border-b border-border/40 bg-slate-950/20 px-5 gap-4 shrink-0">
                <button
                  onClick={() => setActiveTab("preview")}
                  className={`py-2 px-1 border-b-2 font-bold text-xs transition-colors flex items-center gap-1.5 cursor-pointer ${
                    activeTab === "preview"
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Grid className="w-3.5 h-3.5" /> Data Preview
                </button>
                <button
                  onClick={() => setActiveTab("profile")}
                  className={`py-2 px-1 border-b-2 font-bold text-xs transition-colors flex items-center gap-1.5 cursor-pointer ${
                    activeTab === "profile"
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <BarChart3 className="w-3.5 h-3.5" /> Quality Profile
                </button>
                <button
                  onClick={() => setActiveTab("clean")}
                  className={`py-2 px-1 border-b-2 font-bold text-xs transition-colors flex items-center gap-1.5 cursor-pointer ${
                    activeTab === "clean"
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Sliders className="w-3.5 h-3.5" /> Data Cleaning Tools
                </button>
              </div>

              {/* Tab Content Container */}
              <div className="p-5 flex-1 overflow-hidden min-h-[380px]">
                {/* 1. DATA PREVIEW TAB */}
                {activeTab === "preview" && (
                  <div className="space-y-3 h-full flex flex-col justify-between">
                    <div className="overflow-auto max-h-[380px] border border-border/60 rounded-lg flex-1">
                      <table className="w-full text-xs border-collapse">
                        <thead>
                          <tr className="bg-muted/30">
                            {preview.columns.map((c) => (
                              <th
                                key={c}
                                className="border border-border px-3 py-1.5 text-left font-semibold text-foreground whitespace-nowrap"
                              >
                                {c}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {preview.rows.map((row, i) => (
                            <tr key={i} className="hover:bg-muted/10">
                              {preview.columns.map((c) => (
                                <td
                                  key={c}
                                  className="border border-border px-3 py-1 text-muted-foreground whitespace-nowrap max-w-[200px] truncate"
                                >
                                  {String(row[c] ?? "")}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="text-[10px] text-muted-foreground pt-1.5 border-t border-border/40 shrink-0">
                      DuckDB Catalog Table: <code className="font-mono bg-slate-100 px-1 py-0.5 rounded text-primary">"{preview.dataset.table_name}"</code>
                    </div>
                  </div>
                )}

                {/* 2. QUALITY PROFILE TAB */}
                {activeTab === "profile" && (
                  <div className="space-y-4 h-full overflow-y-auto max-h-[380px] pr-1">
                    {loadingStats ? (
                      <div className="flex justify-center py-16">
                        <Loader2 className="h-6 w-6 animate-spin text-primary" />
                      </div>
                    ) : !stats ? (
                      <p className="text-xs text-muted-foreground italic">Failed to fetch stats profile.</p>
                    ) : (
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                          <div className="bg-background border border-border/60 p-3 rounded-lg flex flex-col">
                            <span className="text-[10px] font-bold text-muted-foreground uppercase">Dataset Type</span>
                            <span className="text-xs font-semibold text-foreground mt-1 truncate">Structured Catalog</span>
                          </div>
                          <div className="bg-background border border-border/60 p-3 rounded-lg flex flex-col">
                            <span className="text-[10px] font-bold text-muted-foreground uppercase">Total Records</span>
                            <span className="text-xs font-semibold text-foreground mt-1 font-mono">{stats.row_count?.toLocaleString()} rows</span>
                          </div>
                          <div className="bg-background border border-border/60 p-3 rounded-lg flex flex-col col-span-2 md:col-span-1">
                            <span className="text-[10px] font-bold text-muted-foreground uppercase">Column Count</span>
                            <span className="text-xs font-semibold text-foreground mt-1 font-mono">{stats.columns?.length} fields</span>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <h4 className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Field Summary & Missing Values</h4>
                          
                          <div className="border border-border/60 rounded-lg overflow-hidden">
                            <table className="w-full text-xs text-left border-collapse">
                              <thead>
                                <tr className="border-b border-border bg-muted/20 text-muted-foreground font-semibold">
                                  <th className="p-2">Column Name</th>
                                  <th className="p-2">Type</th>
                                  <th className="p-2 text-right">Nulls (%)</th>
                                  <th className="p-2 text-right">Unique Vals</th>
                                  <th className="p-2 text-right">Avg / Min-Max</th>
                                </tr>
                              </thead>
                              <tbody>
                                {stats.columns?.map((c: any) => {
                                  const fillRate = 100 - c.null_percentage;
                                  return (
                                    <tr key={c.column} className="border-b border-border/30 hover:bg-muted/10 last:border-0">
                                      <td className="p-2 font-semibold text-foreground truncate max-w-[130px]">{c.column}</td>
                                      <td className="p-2">
                                        <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-muted text-muted-foreground uppercase">
                                          {c.type}
                                        </span>
                                      </td>
                                      <td className="p-2 text-right">
                                        <div className="flex flex-col items-end gap-1.5">
                                          <span className="font-mono">{c.null_count > 0 ? `${c.null_percentage}%` : "0%"}</span>
                                          <div className="w-16 h-1 bg-slate-100 rounded-full overflow-hidden">
                                            <div 
                                              className={`h-full ${c.null_percentage > 25 ? "bg-amber-500" : "bg-emerald-500"}`}
                                              style={{ width: `${fillRate}%` }}
                                            />
                                          </div>
                                        </div>
                                      </td>
                                      <td className="p-2 font-mono text-right">{c.unique_count?.toLocaleString()}</td>
                                      <td className="p-2 font-mono text-[10px] text-right text-slate-500 max-w-[150px] truncate">
                                        {c.avg !== null 
                                          ? `Avg: ${c.avg}` 
                                          : (c.min ? `${c.min} → ${c.max}` : "-")}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* 3. DATA CLEANING TOOLS TAB */}
                {activeTab === "clean" && (
                  <div className="space-y-5 h-full overflow-y-auto max-h-[380px] pr-1">
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Optimize the dataset schema by dropping duplicate entries, standardizing casing, or filling empty coordinates.
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Section A: Global cleaners */}
                      <div className="border border-border/80 rounded-xl p-4.5 space-y-4 bg-slate-50">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">Global Operations</h4>
                        
                        <div className="space-y-3.5">
                          {/* Drop duplicates */}
                          <div className="flex items-start justify-between gap-3 bg-white p-3 border border-slate-200 rounded-lg">
                            <div className="min-w-0">
                              <h5 className="text-xs font-bold text-slate-800">Remove Duplicates</h5>
                              <p className="text-[10px] text-slate-500 mt-0.5 leading-relaxed">
                                Scans the entire table and retains only unique rows.
                              </p>
                            </div>
                            <button
                              onClick={() => handleClean("drop_duplicates")}
                              disabled={cleaningAction}
                              className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded text-[10px] border border-slate-300 cursor-pointer shrink-0 disabled:opacity-50"
                            >
                              Drop Rows
                            </button>
                          </div>

                          {/* Standardize Headers */}
                          <div className="flex items-start justify-between gap-3 bg-white p-3 border border-slate-200 rounded-lg">
                            <div className="min-w-0">
                              <h5 className="text-xs font-bold text-slate-800">Format Column Headers</h5>
                              <p className="text-[10px] text-slate-500 mt-0.5 leading-relaxed">
                                Standardizes header spelling to lowercase snake_case (e.g. "Sales Rep" → "sales_rep").
                              </p>
                            </div>
                            <button
                              onClick={() => handleClean("format_headers")}
                              disabled={cleaningAction}
                              className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded text-[10px] border border-slate-300 cursor-pointer shrink-0 disabled:opacity-50"
                            >
                              Format
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Section B: Column Fill Nulls */}
                      <div className="border border-border/80 rounded-xl p-4.5 space-y-3 bg-slate-50 text-slate-800">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">Impute Missing Values</h4>
                        <p className="text-[10px] text-slate-500 leading-relaxed">
                          Fills NULL/empty cells in a specific column with a default placeholder value.
                        </p>

                        <div className="space-y-3 pt-1">
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-500">Select Target Column</label>
                            <select
                              value={cleanCol}
                              onChange={(e) => setCleanCol(e.target.value)}
                              className="w-full bg-white border border-slate-300 rounded h-8 px-2 text-xs text-slate-800 focus:outline-none"
                            >
                              <option value="">-- Choose Column --</option>
                              {preview.columns.map((c) => (
                                <option key={c} value={c}>{c}</option>
                              ))}
                            </select>
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-500">Fill Value Placeholder</label>
                            <input
                              type="text"
                              value={cleanFillVal}
                              onChange={(e) => setCleanFillVal(e.target.value)}
                              placeholder="e.g. 0, Unknown, N/A"
                              className="w-full bg-white border border-slate-300 rounded h-8 px-2.5 text-xs text-slate-800 focus:outline-none"
                            />
                          </div>

                          <button
                            onClick={() => {
                              if (!cleanCol) {
                                toast.error("Choose a target column to clean");
                                return;
                              }
                              handleClean("fill_nulls", cleanCol, cleanFillVal);
                              setCleanCol("");
                              setCleanFillVal("");
                            }}
                            disabled={cleaningAction || !cleanCol}
                            className="w-full py-1.5 bg-primary hover:bg-primary/95 text-white font-semibold rounded text-xs transition-colors cursor-pointer disabled:opacity-50"
                          >
                            Apply Impute
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col justify-center items-center text-center p-16 border border-border/80 border-dashed rounded-xl bg-card/30 min-h-[500px]">
              <Database className="h-12 w-12 text-muted-foreground/30 mb-3" />
              <h3 className="text-sm font-semibold text-foreground/80">Select Dataset for Profiling</h3>
              <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                Choose an uploaded dataset from the left catalog, or upload a new file, to preview schema quality and launch cleaning algorithms.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
