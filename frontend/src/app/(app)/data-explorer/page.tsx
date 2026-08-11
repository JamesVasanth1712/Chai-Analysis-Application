"use client";

import { useState, useEffect, useCallback } from "react";
import { DbNavigator } from "@/components/sql/DbNavigator";
import { SqlEditor } from "@/components/sql/SqlEditor";
import { ResultGrid } from "@/components/sql/ResultGrid";
import { dataApi } from "@/lib/api";
import { ExploreResult } from "@/types/bi";
import toast from "react-hot-toast";
import {
  Sparkles,
  Database,
  History,
  AlertTriangle,
  Pin,
  Trash2,
  Heart,
  CheckCircle2,
  WandSparkles,
  Loader2,
  RefreshCw,
  Clock,
  ArrowRight,
} from "lucide-react";

interface ColumnInfo {
  name: string;
  type: string;
}

interface RelationshipInfo {
  from_table: string;
  from_col: string;
  to_table: string;
  to_col: string;
}

interface TableNode {
  id: string;
  name: string;
  sanitized_name: string;
  table_name: string;
  row_count: number;
  columns: ColumnInfo[];
  relationships: RelationshipInfo[];
}

interface ErrorDetails {
  message: string;
  explanation?: string;
  suggestion?: string;
}

export default function DataExplorerPage() {
  const [navigatorTables, setNavigatorTables] = useState<TableNode[]>([]);
  const [externalSql, setExternalSql] = useState<{ sql: string; timestamp: number } | null>(null);
  const [queryResult, setQueryResult] = useState<ExploreResult | null>(null);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<ErrorDetails | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Sidebar navigation and history
  const [sidebarTab, setSidebarTab] = useState<"schema" | "history">("schema");
  const [history, setHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const data = await dataApi.listHistory();
      setHistory(data);
    } catch (err) {
      console.error("Failed to load query history", err);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (sidebarTab === "history") {
      loadHistory();
    }
  }, [sidebarTab, loadHistory]);

  const handleSelectTable = (tableName: string) => {
    setExternalSql({
      sql: `SELECT * FROM "${tableName}" LIMIT 100;`,
      timestamp: Date.now()
    });
  };

  const handleSchemaLoaded = (tables: TableNode[]) => {
    setNavigatorTables(tables);
  };

  const handleRefreshWorkspace = () => {
    setRefreshTrigger((prev) => prev + 1);
  };

  const handleExecuteQuery = async (sql: string) => {
    setLoading(true);
    setError(null);
    setErrorDetails(null);
    try {
      const res = await dataApi.explore({
        sql: sql,
        page: 1,
        page_size: 250,
      });
      setQueryResult(res);
      // Reload history in the background to show the new query
      if (sidebarTab === "history") {
        loadHistory();
      }
    } catch (e: any) {
      const detail = e.response?.data?.detail;
      if (detail && typeof detail === "object") {
        setError(detail.error || "Query execution failed");
        setErrorDetails({
          message: detail.error || "Query execution failed",
          explanation: detail.explanation,
          suggestion: detail.suggestion,
        });
      } else {
        const errMessage = detail || e.message || "Query execution failed";
        setError(errMessage);
        setErrorDetails({ message: errMessage });
      }
      setQueryResult(null);
    } finally {
      setLoading(false);
    }
  };

  const handleTogglePin = async (id: string) => {
    try {
      await dataApi.togglePin(id);
      loadHistory();
      toast.success("Pin preference updated");
    } catch {
      toast.error("Failed to toggle pin state");
    }
  };

  const handleToggleFavorite = async (id: string) => {
    try {
      await dataApi.toggleFavorite(id);
      loadHistory();
      toast.success("Favorite preference updated");
    } catch {
      toast.error("Failed to toggle favorite state");
    }
  };

  const handleDeleteHistory = async (id: string) => {
    try {
      await dataApi.deleteHistory(id);
      loadHistory();
      toast.success("History item deleted");
    } catch {
      toast.error("Failed to delete history item");
    }
  };

  return (
    <div className="flex h-[calc(100vh-64px)] w-full overflow-hidden bg-slate-950 text-slate-100">
      {/* Left panel: DB Navigator & History Sidebar */}
      <div className="w-80 border-r border-slate-800 h-full flex-shrink-0 flex flex-col bg-slate-900">
        {/* Tab Buttons */}
        <div className="flex border-b border-slate-800 bg-slate-950/80 p-2 gap-1.5">
          <button
            onClick={() => setSidebarTab("schema")}
            className={`flex-1 py-1.5 px-3 rounded-md text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              sidebarTab === "schema"
                ? "bg-primary text-primary-foreground shadow"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
            }`}
          >
            <Database className="h-3.5 w-3.5" /> Schema
          </button>
          <button
            onClick={() => setSidebarTab("history")}
            className={`flex-1 py-1.5 px-3 rounded-md text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              sidebarTab === "history"
                ? "bg-primary text-primary-foreground shadow"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
            }`}
          >
            <History className="h-3.5 w-3.5" /> History
          </button>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-hidden">
          {sidebarTab === "schema" ? (
            <DbNavigator
              onSelectTable={handleSelectTable}
              onSchemaLoaded={handleSchemaLoaded}
              onRefreshTrigger={refreshTrigger}
              onRefreshWorkspace={handleRefreshWorkspace}
            />
          ) : (
            <div className="h-full flex flex-col overflow-hidden">
              <div className="p-3 border-b border-slate-800/80 flex items-center justify-between bg-slate-950/20">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Execution History</span>
                <button
                  onClick={loadHistory}
                  disabled={historyLoading}
                  className="text-slate-400 hover:text-slate-200 transition-colors disabled:opacity-50 cursor-pointer"
                >
                  <RefreshCw className={`h-3 w-3 ${historyLoading ? "animate-spin" : ""}`} />
                </button>
              </div>

              {historyLoading && history.length === 0 ? (
                <div className="flex-1 flex items-center justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                </div>
              ) : history.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
                  <History className="h-8 w-8 text-slate-600 mb-2" />
                  <p className="text-xs text-slate-400">No executed queries recorded.</p>
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto p-2 space-y-2 max-h-[calc(100vh-160px)]">
                  {history.map((item) => (
                    <div
                      key={item.id}
                      className="border border-slate-800/80 hover:border-slate-700 bg-slate-950/40 rounded-lg p-2.5 space-y-2 text-left group transition-all"
                    >
                      <div className="flex items-center justify-between gap-1.5">
                        <div className="flex items-center gap-1.5 text-[9px] text-slate-400">
                          <Clock className="h-3 w-3 text-slate-500" />
                          <span>{item.execution_time_ms ? `${item.execution_time_ms}ms` : "cached"}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleTogglePin(item.id)}
                            className={`p-1 rounded hover:bg-slate-800 transition-colors cursor-pointer ${
                              item.is_pinned ? "text-amber-500" : "text-slate-500 hover:text-slate-300"
                            }`}
                            title={item.is_pinned ? "Unpin query" : "Pin query"}
                          >
                            <Pin className="h-3 w-3" />
                          </button>
                          <button
                            onClick={() => handleToggleFavorite(item.id)}
                            className={`p-1 rounded hover:bg-slate-800 transition-colors cursor-pointer ${
                              item.is_favorite ? "text-red-500" : "text-slate-500 hover:text-slate-300"
                            }`}
                            title={item.is_favorite ? "Remove favorite" : "Favorite query"}
                          >
                            <Heart className="h-3 w-3 fill-current" />
                          </button>
                          <button
                            onClick={() => handleDeleteHistory(item.id)}
                            className="p-1 rounded hover:bg-slate-800 text-slate-500 hover:text-red-400 transition-colors cursor-pointer"
                            title="Delete item"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </div>

                      <pre
                        onClick={() => {
                          setExternalSql({
                            sql: item.sql_query,
                            timestamp: Date.now()
                          });
                          toast.success("SQL query loaded into editor");
                        }}
                        className="text-[10px] font-mono bg-slate-950 border border-slate-800/60 p-1.5 rounded text-slate-300 overflow-x-auto select-none cursor-pointer max-h-16 line-clamp-2 hover:border-slate-600 transition-all"
                        title="Click to load query into editor"
                      >
                        {item.sql_query}
                      </pre>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Right panel: split SQL editor and Results grid */}
      <div className="flex-1 flex flex-col h-full min-w-0 bg-slate-950">
        <div className="flex-1 min-h-[300px] border-b border-slate-800">
          <SqlEditor
            tables={navigatorTables}
            onExecute={handleExecuteQuery}
            loading={loading}
            externalSql={externalSql}
            error={error}
          />
        </div>

        {/* Results / SQL Debugger Section */}
        <div className="flex-1 min-h-[250px] overflow-hidden flex flex-col">
          {errorDetails && (
            <div className="p-4 bg-red-950/15 border-b border-red-900/30 text-left space-y-3 animate-slide-up flex-shrink-0">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-red-500 mt-0.5 shrink-0" />
                <div className="space-y-1.5">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-red-400">AI SQL Debugger Assistant</h3>
                  
                  {errorDetails.explanation ? (
                    <p className="text-xs text-orange-400/90 leading-relaxed max-w-2xl">
                      {errorDetails.explanation}
                    </p>
                  ) : (
                    <p className="text-xs text-red-400/90 leading-relaxed">
                      {errorDetails.message}
                    </p>
                  )}
                  
                  {errorDetails.suggestion && (
                    <div className="mt-2.5 pt-2.5 border-t border-red-900/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/40 p-3 rounded-lg border border-slate-800">
                      <div className="space-y-1">
                        <span className="text-[10px] font-bold uppercase text-slate-400 flex items-center gap-1">
                          <WandSparkles className="h-3 w-3 text-primary" /> Suggested Correction
                        </span>
                        <pre className="text-[10px] font-mono text-emerald-400 mt-1 max-w-lg overflow-x-auto">
                          {errorDetails.suggestion}
                        </pre>
                      </div>
                      <button
                        onClick={() => {
                          if (errorDetails.suggestion) {
                            setExternalSql({
                              sql: errorDetails.suggestion,
                              timestamp: Date.now()
                            });
                            setErrorDetails(null);
                            toast.success("Applied correction to editor!");
                          }
                        }}
                        className="self-end sm:self-center px-3 py-1.5 bg-primary hover:bg-primary/95 text-primary-foreground font-semibold rounded text-xs transition-all flex items-center gap-1 shadow cursor-pointer shrink-0"
                      >
                        Apply Fix <ArrowRight className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="flex-1 overflow-hidden">
            <ResultGrid
              result={queryResult}
              loading={loading}
              error={error}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
