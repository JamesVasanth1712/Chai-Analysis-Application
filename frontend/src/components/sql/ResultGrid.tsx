import { useState, useMemo } from "react";
import { 
  Table2, 
  BarChart3, 
  Download, 
  ChevronLeft, 
  ChevronRight, 
  SlidersHorizontal,
  FileSpreadsheet
} from "lucide-react";
import { ChartWidget } from "@/components/charts/ChartWidget";
import { ChartTypeSelector } from "@/components/charts/ChartTypeSelector";
import { ChartData, ExploreResult } from "@/types/bi";
import toast from "react-hot-toast";

interface ResultGridProps {
  result: ExploreResult | null;
  loading: boolean;
  onPageChange?: (page: number) => void;
  error?: string | null;
}

export function ResultGrid({ result, loading, onPageChange, error }: ResultGridProps) {
  const [viewTab, setViewTab] = useState<"grid" | "chart">("grid");
  const [searchTerm, setSearchTerm] = useState("");
  
  // Sorting States
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  // Client-Side Pagination States
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Dynamic Chart Parameters
  const [chartType, setChartType] = useState<"bar" | "line" | "area" | "pie" | "donut" | "card">("bar");
  const [xAxisKey, setXAxisKey] = useState("");
  const [yAxisKey, setYAxisKey] = useState("");

  const columns = result?.columns || [];
  const rawRows = result?.rows || [];

  // Reset page and sort when result changes
  useMemo(() => {
    setPage(1);
    setSortCol(null);
    if (columns.length > 0) {
      setXAxisKey(columns[0]);
      setYAxisKey(columns[1] || columns[0]);
    }
  }, [result]);

  // Client side sorting & filtering
  const filteredAndSortedRows = useMemo(() => {
    let rows = [...rawRows];

    // 1. Text Filter Search
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      rows = rows.filter(row => 
        Object.values(row).some(val => String(val ?? "").toLowerCase().includes(term))
      );
    }

    // 2. Sort columns
    if (sortCol) {
      rows.sort((a, b) => {
        const valA = a[sortCol];
        const valB = b[sortCol];
        
        if (valA === valB) return 0;
        if (valA === null || valA === undefined) return 1;
        if (valB === null || valB === undefined) return -1;

        const isNum = typeof valA === "number" && typeof valB === "number";
        if (isNum) {
          return sortDir === "asc" ? valA - valB : valB - valA;
        } else {
          const strA = String(valA).toLowerCase();
          const strB = String(valB).toLowerCase();
          return sortDir === "asc" 
            ? strA.localeCompare(strB) 
            : strB.localeCompare(strA);
        }
      });
    }

    return rows;
  }, [rawRows, searchTerm, sortCol, sortDir]);

  // Pagination calculations
  const totalRows = filteredAndSortedRows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const paginatedRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredAndSortedRows.slice(start, start + pageSize);
  }, [filteredAndSortedRows, page, pageSize]);

  const handleSort = (colName: string) => {
    if (sortCol === colName) {
      setSortDir(prev => prev === "asc" ? "desc" : "asc");
    } else {
      setSortCol(colName);
      setSortDir("asc");
    }
    setPage(1);
  };

  // Export CSV
  const handleExportCSV = () => {
    if (totalRows === 0) return;
    const header = columns.join(",");
    const csvContent = [
      header,
      ...filteredAndSortedRows.map(row => 
        columns.map(col => {
          const val = row[col] ?? "";
          const str = String(val).replace(/"/g, '""');
          return str.includes(",") || str.includes("\n") || str.includes('"') ? `"${str}"` : str;
        }).join(",")
      )
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `sql_result_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("CSV Export downloaded successfully");
  };

  // Shape results for the ChartWidget
  const shapedChartData = useMemo((): ChartData | null => {
    if (totalRows === 0 || !xAxisKey) return null;
    
    const chartRows = filteredAndSortedRows.slice(0, 50); // limit chart preview to first 50 rows
    const labels = chartRows.map(r => String(r[xAxisKey] ?? ""));

    if (chartType === "pie" || chartType === "donut") {
      const series = chartRows.map(r => ({
        name: String(r[xAxisKey] ?? ""),
        value: Number(r[yAxisKey]) || 0
      }));
      return {
        chart_type: chartType,
        labels,
        series,
        x_key: xAxisKey,
        y_keys: [yAxisKey],
        columns,
        row_count: chartRows.length,
        sql: result?.sql || ""
      };
    }

    if (chartType === "card") {
      const value = Number(chartRows[0]?.[yAxisKey]) || 0;
      return {
        chart_type: "card",
        labels: [yAxisKey],
        series: [{ name: yAxisKey, value }],
        x_key: xAxisKey,
        y_keys: [yAxisKey],
        columns,
        row_count: 1,
        sql: result?.sql || ""
      };
    }

    const series = [{
      name: yAxisKey,
      data: chartRows.map(r => Number(r[yAxisKey]) || 0)
    }];

    return {
      chart_type: chartType,
      labels,
      series,
      x_key: xAxisKey,
      y_keys: [yAxisKey],
      columns,
      row_count: chartRows.length,
      sql: result?.sql || ""
    };
  }, [filteredAndSortedRows, xAxisKey, yAxisKey, chartType, result]);

  return (
    <div className="flex flex-col h-full bg-slate-900 border-t border-slate-700 text-slate-350 select-none text-[11px] font-sans">
      {/* Tab Row Controls */}
      <div className="flex items-center justify-between border-b border-slate-700 bg-slate-950 px-3 py-1 flex-shrink-0">
        <div className="flex items-center gap-1.5 py-0.5">
          <button
            onClick={() => setViewTab("grid")}
            className={`px-3 py-1 rounded flex items-center gap-1 hover:text-white font-bold transition-all ${
              viewTab === "grid" ? "bg-slate-800 text-cyan-400" : "text-slate-400"
            }`}
          >
            <Table2 className="h-3.5 w-3.5" />
            <span>GRID VIEW</span>
          </button>
          <button
            onClick={() => setViewTab("chart")}
            disabled={totalRows === 0}
            className={`px-3 py-1 rounded flex items-center gap-1 hover:text-white font-bold transition-all ${
              viewTab === "chart" ? "bg-slate-800 text-cyan-400" : "text-slate-400 disabled:opacity-30"
            }`}
          >
            <BarChart3 className="h-3.5 w-3.5" />
            <span>VISUAL CHART</span>
          </button>
        </div>

        {/* Action button triggers */}
        {totalRows > 0 && viewTab === "grid" && (
          <div className="flex items-center gap-2">
            {/* Client Search filter */}
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
              placeholder="Filter results..."
              className="h-6 w-48 bg-slate-900 border border-slate-700 rounded px-2 text-[10px] text-slate-200 focus:outline-none focus:border-cyan-400"
            />
            <button
              onClick={handleExportCSV}
              className="h-6 px-2 bg-slate-800 hover:bg-slate-700 hover:text-white border border-slate-700 text-slate-300 rounded flex items-center gap-1 transition-all"
            >
              <Download className="h-3 w-3" />
              <span>Export CSV</span>
            </button>
          </div>
        )}
      </div>

      {/* Main Tab Render Body */}
      <div className="flex-1 min-h-0 overflow-auto bg-slate-900 relative">
        {loading ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/60 z-20 gap-2">
            <Loader2 />
          </div>
        ) : error ? (
          <div className="p-4 font-mono text-red-400 bg-red-950/20 border border-red-900/50 rounded-lg m-4 space-y-2 select-text">
            <div className="flex items-center gap-2 text-xs font-bold text-red-500 uppercase">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <span>Query Execution Failed</span>
            </div>
            <pre className="text-[11px] whitespace-pre-wrap leading-relaxed bg-slate-950 p-3 rounded border border-slate-855 max-h-60 overflow-y-auto">
              {error}
            </pre>
            <p className="text-[10px] text-slate-500 font-sans font-medium">
              Tip: Click the pulsing "AI Debug & Fix" button in the toolbar above to have the AI automatically repair this query.
            </p>
          </div>
        ) : viewTab === "grid" ? (
          result ? (
            <div className="h-full flex flex-col">
              {/* Data Grid view wrapper */}
              <div className="flex-1 overflow-auto border-b border-slate-850">
                <table className="w-full border-collapse font-mono text-[10.5px] text-left">
                  <thead className="sticky top-0 bg-slate-950 text-slate-400 z-10 font-bold border-b border-slate-800">
                    <tr>
                      <th className="p-2 border-r border-slate-800 text-center w-10">#</th>
                      {columns.map(col => (
                        <th 
                          key={col} 
                          onClick={() => handleSort(col)}
                          className="p-2 border-r border-slate-800 cursor-pointer hover:bg-slate-900 transition-colors group relative"
                        >
                          <div className="flex items-center justify-between gap-1.5">
                            <span className="truncate">{col}</span>
                            <span className="text-[9px] text-slate-500 shrink-0 select-none">
                              {sortCol === col ? (sortDir === "asc" ? "▲" : "▼") : ""}
                            </span>
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedRows.map((row, idx) => (
                      <tr key={idx} className="border-b border-slate-850/60 hover:bg-slate-800/40">
                        <td className="p-2 border-r border-slate-850 bg-slate-950 text-center text-[9px] text-slate-600">
                          {((page - 1) * pageSize) + idx + 1}
                        </td>
                        {columns.map(col => (
                          <td key={col} className="p-2 border-r border-slate-850 text-slate-200 truncate max-w-xs font-medium">
                            {row[col] !== null && row[col] !== undefined ? String(row[col]) : <span className="text-slate-600 italic">null</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {totalRows === 0 && (
                  <div className="text-center text-slate-500 py-16 text-xs">No records matching the search query.</div>
                )}
              </div>

              {/* Grid Pagination Footer controls */}
              <div className="h-9 px-4 border-t border-slate-800 bg-slate-950 flex items-center justify-between text-[10px] text-slate-500 flex-shrink-0 font-sans">
                <div className="flex items-center gap-4">
                  <span>Total rows: <strong className="text-slate-350">{totalRows}</strong></span>
                  <div className="flex items-center gap-1.5">
                    <span>Rows per page:</span>
                    <select
                      value={pageSize}
                      onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
                      className="bg-slate-900 border border-slate-700 text-slate-300 rounded px-1 py-0.5 outline-none"
                    >
                      {[25, 50, 100, 250].map(sz => (
                        <option key={sz} value={sz}>{sz}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 font-bold">
                  <button
                    onClick={() => setPage(prev => Math.max(1, prev - 1))}
                    disabled={page === 1}
                    className="p-1 rounded hover:bg-slate-800 hover:text-white disabled:opacity-30 transition-colors"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </button>
                  <span>Page <strong className="text-slate-350">{page}</strong> of {totalPages}</span>
                  <button
                    onClick={() => setPage(prev => Math.min(totalPages, prev + 1))}
                    disabled={page === totalPages}
                    className="p-1 rounded hover:bg-slate-800 hover:text-white disabled:opacity-30 transition-colors"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-48 gap-1.5 text-slate-500 font-sans">
              <Table2 className="h-8 w-8 opacity-45" />
              <span>pgAdmin SQL Workspace Query Editor. Input SELECT query and hit Run.</span>
            </div>
          )
        ) : (
          /* Visual Chart Tab view */
          shapedChartData && (
            <div className="h-full flex flex-col p-4 bg-slate-900 font-sans">
              {/* Parameter Settings Toolbar */}
              <div className="flex flex-wrap items-center gap-4 bg-slate-950 border border-slate-800 rounded-lg p-3 mb-4 select-none">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] uppercase font-bold text-slate-500">Visual Type:</span>
                  <ChartTypeSelector 
                    value={
                      chartType === "donut" 
                        ? "pie" 
                        : chartType === "card" 
                        ? "bar" 
                        : (chartType as any)
                    } 
                    onChange={(val) => setChartType(val as any)} 
                  />
                </div>
                
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] uppercase font-bold text-slate-500">X-Axis (Label):</span>
                  <select
                    value={xAxisKey}
                    onChange={(e) => setXAxisKey(e.target.value)}
                    className="bg-slate-900 border border-slate-700 text-slate-300 rounded px-2 py-1 outline-none text-[10.5px]"
                  >
                    {columns.map(col => (
                      <option key={col} value={col}>{col}</option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] uppercase font-bold text-slate-500">Y-Axis (Metrics):</span>
                  <select
                    value={yAxisKey}
                    onChange={(e) => setYAxisKey(e.target.value)}
                    className="bg-slate-900 border border-slate-700 text-slate-300 rounded px-2 py-1 outline-none text-[10.5px]"
                  >
                    {columns.map(col => (
                      <option key={col} value={col}>{col}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Shaped Chart widget canvas rendering */}
              <div className="flex-1 bg-slate-950 border border-slate-850 rounded-xl p-4 flex items-center justify-center min-h-[300px]">
                <div className="w-full max-w-3xl">
                  <ChartWidget data={shapedChartData} height={320} />
                </div>
              </div>
            </div>
          )
        )}
      </div>
    </div>
  );
}

function Loader2({ className }: { className?: string }) {
  return (
    <div className={`flex flex-col items-center justify-center gap-2 text-cyan-400 font-sans ${className}`}>
      <span className="text-xl font-bold animate-pulse">Running SELECT query...</span>
      <div className="w-16 h-1 bg-slate-800 rounded-full overflow-hidden">
        <div className="h-full bg-cyan-400 w-1/2 rounded-full animate-infinite-scroll" />
      </div>
    </div>
  );
}
