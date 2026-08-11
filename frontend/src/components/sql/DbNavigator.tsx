import { useState, useEffect } from "react";
import { 
  Database, 
  Folder, 
  FolderOpen, 
  Table2, 
  Type, 
  Sigma, 
  Calendar, 
  ChevronRight, 
  ChevronDown, 
  Upload, 
  Loader2, 
  X, 
  Trash2, 
  Copy, 
  Info,
  Network
} from "lucide-react";
import { datasetsApi, dataApi } from "@/lib/api";
import toast from "react-hot-toast";

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

interface NavigatorData {
  schema: string;
  tables: TableNode[];
}

interface DbNavigatorProps {
  onSelectTable: (tableName: string) => void;
  onRefreshTrigger?: number;
  onRefreshWorkspace?: () => void;
  onSchemaLoaded?: (tables: TableNode[]) => void;
}

interface ColumnStat {
  column: string;
  type: string;
  null_count: number;
  null_percentage: number;
  unique_count: number;
  min: string | null;
  max: string | null;
  avg: number | null;
}

interface StatsData {
  id: string;
  name: string;
  row_count: number;
  columns: ColumnStat[];
}

export function DbNavigator({ onSelectTable, onRefreshTrigger, onRefreshWorkspace, onSchemaLoaded }: DbNavigatorProps) {
  const [navigatorData, setNavigatorData] = useState<NavigatorData | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({
    "schemas": true,
    "public": true,
    "tables": true
  });
  
  // Stats Modal State
  const [activeStatsTable, setActiveStatsTable] = useState<TableNode | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsData, setStatsData] = useState<StatsData | null>(null);

  const fetchNavigator = async () => {
    setLoading(true);
    try {
      const data = await dataApi.navigator();
      setNavigatorData(data);
      if (onSchemaLoaded) {
        onSchemaLoaded(data.tables);
      }
    } catch (e) {
      console.error(e);
      toast.error("Failed to load database explorer schema");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNavigator();
  }, [onRefreshTrigger]);

  const toggleExpand = (nodeId: string) => {
    setExpandedNodes(prev => ({ ...prev, [nodeId]: !prev[nodeId] }));
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const res = await datasetsApi.upload(file, file.name);
      toast.success(`Successfully uploaded and registered virtual table: ${res.name}`);
      fetchNavigator();
      if (onRefreshWorkspace) onRefreshWorkspace();
    } catch (e: any) {
      toast.error(e.response?.data?.detail || e.message || "Failed to upload file");
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  };

  const handleDeleteDataset = async (datasetId: string, name: string) => {
    if (!confirm(`Are you sure you want to delete dataset '${name}'? This drops its virtual table.`)) return;
    try {
      await datasetsApi.delete(datasetId);
      toast.success(`Dropped virtual table for: ${name}`);
      fetchNavigator();
      if (onRefreshWorkspace) onRefreshWorkspace();
    } catch (e: any) {
      toast.error(e.message || "Failed to delete dataset");
    }
  };

  const handleViewStats = async (table: TableNode) => {
    setActiveStatsTable(table);
    setStatsLoading(true);
    setStatsData(null);
    try {
      const stats = await datasetsApi.stats(table.id);
      setStatsData(stats);
    } catch (e: any) {
      toast.error(e.message || "Failed to load metadata statistics");
      setActiveStatsTable(null);
    } finally {
      setStatsLoading(false);
    }
  };

  const getColIcon = (type: string) => {
    const t = type.toUpperCase();
    if (t.includes("INT") || t.includes("FLOAT") || t.includes("DOUBLE") || t.includes("PRECISION") || t.includes("NUMERIC")) {
      return <Sigma className="h-3 w-3 text-emerald-500 shrink-0" />;
    }
    if (t.includes("DATE") || t.includes("TIME") || t.includes("TIMESTAMP")) {
      return <Calendar className="h-3 w-3 text-orange-500 shrink-0" />;
    }
    return <Type className="h-3 w-3 text-blue-500 shrink-0" />;
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 border-r border-slate-700 text-slate-350 select-none text-[11px] font-sans">
      {/* Navigator Header */}
      <div className="p-3 border-b border-slate-700 flex items-center justify-between bg-slate-950 flex-shrink-0">
        <div className="flex items-center gap-1.5 font-bold text-slate-200">
          <Database className="h-3.5 w-3.5 text-cyan-400" />
          <span>CONNECTIONS / NAVIGATOR</span>
        </div>
        <button 
          onClick={fetchNavigator} 
          disabled={loading}
          className="p-1 hover:bg-slate-800 rounded hover:text-white transition-colors"
          title="Refresh Schemas"
        >
          {loading ? (
            <Loader2 className="h-3 w-3 animate-spin text-slate-400" />
          ) : (
            <span className="text-[10px]">🔄</span>
          )}
        </button>
      </div>

      {/* Dataset Upload Area */}
      <div className="p-3 border-b border-slate-700 bg-slate-900/50 flex-shrink-0">
        <label className="border border-dashed border-slate-600 hover:border-cyan-400 bg-slate-800/40 hover:bg-slate-800/60 p-2.5 rounded-lg flex flex-col items-center justify-center cursor-pointer transition-all gap-1 text-center">
          {uploading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin text-cyan-400" />
              <span className="font-semibold text-slate-300">Ingesting Dataset...</span>
            </>
          ) : (
            <>
              <Upload className="h-4 w-4 text-cyan-400" />
              <span className="font-semibold text-slate-300">Upload CSV / XLSX / JSON / Parquet</span>
              <span className="text-[9px] text-slate-500">Auto-registers as virtual SQL table</span>
            </>
          )}
          <input
            type="file"
            accept=".csv,.xlsx,.xls,.json,.parquet"
            onChange={handleFileUpload}
            disabled={uploading}
            className="hidden"
          />
        </label>
      </div>

      {/* Navigation Tree */}
      <div className="flex-1 overflow-auto p-2.5 space-y-1 font-mono">
        <div className="tree-node">
          {/* Top-level Connections node */}
          <div 
            className="flex items-center gap-1 py-1 px-1.5 hover:bg-slate-800 hover:text-white rounded cursor-pointer"
            onClick={() => toggleExpand("schemas")}
          >
            {expandedNodes["schemas"] ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            <Database className="h-3 w-3 text-cyan-400" />
            <span className="font-bold text-slate-200">Local Postgres Server</span>
          </div>

          {expandedNodes["schemas"] && (
            <div className="pl-3.5 border-l border-slate-800 ml-1.5 mt-0.5 space-y-1">
              {/* Schemas Node */}
              <div 
                className="flex items-center gap-1 py-0.5 px-1 hover:bg-slate-800 hover:text-white rounded cursor-pointer"
                onClick={() => toggleExpand("public")}
              >
                {expandedNodes["public"] ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                {expandedNodes["public"] ? <FolderOpen className="h-3 w-3 text-yellow-500" /> : <Folder className="h-3 w-3 text-yellow-500" />}
                <span>Schema: public</span>
              </div>

              {expandedNodes["public"] && (
                <div className="pl-3.5 border-l border-slate-800 ml-1.5 space-y-1">
                  {/* Tables Node */}
                  <div 
                    className="flex items-center gap-1 py-0.5 px-1 hover:bg-slate-800 hover:text-white rounded cursor-pointer"
                    onClick={() => toggleExpand("tables")}
                  >
                    {expandedNodes["tables"] ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                    {expandedNodes["tables"] ? <FolderOpen className="h-3 w-3 text-sky-400" /> : <Folder className="h-3 w-3 text-sky-400" />}
                    <span className="font-semibold text-slate-300">Tables ({navigatorData?.tables.length || 0})</span>
                  </div>

                  {expandedNodes["tables"] && (
                    <div className="pl-3.5 border-l border-slate-800 ml-1.5 space-y-1">
                      {loading ? (
                        <div className="text-[10px] text-slate-500 py-1 flex items-center gap-1">
                          <Loader2 className="h-3 w-3 animate-spin" /> Loading schema...
                        </div>
                      ) : navigatorData?.tables.map(table => (
                        <div key={table.id} className="tree-table-node">
                          {/* Table Title Block */}
                          <div className="flex items-center justify-between group py-0.5 px-1 hover:bg-slate-800 hover:text-slate-100 rounded cursor-pointer">
                            <div 
                              className="flex items-center gap-1 min-w-0"
                              onClick={() => toggleExpand(`tbl-${table.id}`)}
                            >
                              {expandedNodes[`tbl-${table.id}`] ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                              <Table2 className="h-3 w-3 text-indigo-400 shrink-0" />
                              <span className="truncate text-slate-200" title={table.name}>{table.sanitized_name}</span>
                              <span className="text-[9px] text-slate-500 shrink-0">({table.row_count} rows)</span>
                            </div>
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 shrink-0">
                              <button 
                                onClick={() => {
                                  navigator.clipboard.writeText(table.sanitized_name);
                                  toast.success("Table name copied!");
                                }}
                                className="p-0.5 hover:bg-slate-700 hover:text-white rounded"
                                title="Copy Table Name"
                              >
                                <Copy className="h-2.5 w-2.5" />
                              </button>
                              <button 
                                onClick={() => handleViewStats(table)}
                                className="p-0.5 hover:bg-slate-700 hover:text-cyan-400 rounded"
                                title="Column Stats"
                              >
                                <Info className="h-2.5 w-2.5" />
                              </button>
                              <button 
                                onClick={() => onSelectTable(table.sanitized_name)}
                                className="p-0.5 hover:bg-slate-700 hover:text-emerald-400 rounded font-bold"
                                title="Generate SELECT *"
                              >
                                <span className="text-[8px]">▶</span>
                              </button>
                              <button 
                                onClick={() => handleDeleteDataset(table.id, table.name)}
                                className="p-0.5 hover:bg-slate-700 hover:text-red-500 rounded"
                                title="Drop Table"
                              >
                                <Trash2 className="h-2.5 w-2.5" />
                              </button>
                            </div>
                          </div>

                          {/* Expanded Table Columns & Relations */}
                          {expandedNodes[`tbl-${table.id}`] && (
                            <div className="pl-3.5 border-l border-slate-800 ml-1.5 space-y-1.5 py-1">
                              {/* Columns folder node */}
                              <div>
                                <div 
                                  className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-slate-200"
                                  onClick={() => toggleExpand(`tbl-${table.id}-cols`)}
                                >
                                  {expandedNodes[`tbl-${table.id}-cols`] ? <ChevronDown className="h-2.5 w-2.5" /> : <ChevronRight className="h-2.5 w-2.5" />}
                                  <span>columns</span>
                                </div>
                                {expandedNodes[`tbl-${table.id}-cols`] !== false && (
                                  <div className="pl-2.5 space-y-0.5 mt-0.5 border-l border-slate-850 ml-1">
                                    {table.columns.map(col => (
                                      <div 
                                        key={col.name} 
                                        className="flex items-center justify-between group/col py-0.5 px-1 hover:bg-slate-800 hover:text-slate-200 rounded"
                                      >
                                        <div className="flex items-center gap-1 min-w-0">
                                          {getColIcon(col.type)}
                                          <span className="truncate text-slate-350" title={col.name}>{col.name}</span>
                                        </div>
                                        <span className="text-[8px] text-slate-500 uppercase">{col.type}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>

                              {/* Relationships folder node */}
                              {table.relationships && table.relationships.length > 0 && (
                                <div>
                                  <div 
                                    className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-slate-200"
                                    onClick={() => toggleExpand(`tbl-${table.id}-rels`)}
                                  >
                                    {expandedNodes[`tbl-${table.id}-rels`] ? <ChevronDown className="h-2.5 w-2.5" /> : <ChevronRight className="h-2.5 w-2.5" />}
                                    <Network className="h-2.5 w-2.5 text-amber-500" />
                                    <span>relationships</span>
                                  </div>
                                  {expandedNodes[`tbl-${table.id}-rels`] && (
                                    <div className="pl-2.5 space-y-0.5 mt-0.5 border-l border-slate-850 ml-1">
                                      {table.relationships.map((rel, idx) => {
                                        const isFrom = rel.from_table === table.table_name;
                                        const selfCol = isFrom ? rel.from_col : rel.to_col;
                                        const otherTableCode = isFrom ? rel.to_table : rel.from_table;
                                        const otherCol = isFrom ? rel.to_col : rel.from_col;
                                        
                                        const otherDataset = navigatorData?.tables.find(t => t.table_name === otherTableCode);
                                        const otherTableName = otherDataset ? otherDataset.sanitized_name : otherTableCode;

                                        return (
                                          <div 
                                            key={idx}
                                            className="py-0.5 px-1 text-slate-400 rounded hover:text-slate-100 flex items-center gap-1"
                                            title={`JOIN ${otherTableName} ON ${selfCol} = ${otherCol}`}
                                          >
                                            <span className="text-amber-500 font-bold">🔗</span>
                                            <span className="truncate">
                                              {selfCol} ➔ {otherTableName}.{otherCol}
                                            </span>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                      {!loading && navigatorData?.tables.length === 0 && (
                        <div className="text-[10px] text-slate-600 py-1 pl-1">
                          No virtual tables. Upload a file above.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Stats Modal */}
      {activeStatsTable && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-4xl shadow-2xl flex flex-col max-h-[85vh]">
            {/* Modal Header */}
            <div className="p-4 border-b border-slate-700 bg-slate-950 rounded-t-xl flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-200 flex items-center gap-1.5">
                  <Info className="h-4 w-4 text-cyan-400" />
                  Table Metadata Statistics: {activeStatsTable.sanitized_name}
                </h3>
                <p className="text-[10px] text-slate-500 mt-0.5">Original Filename: {activeStatsTable.name} · Database Table: {activeStatsTable.table_name}</p>
              </div>
              <button 
                onClick={() => setActiveStatsTable(null)}
                className="text-slate-400 hover:text-white p-1 rounded-full hover:bg-slate-800 transition-all"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-auto p-4">
              {statsLoading ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3">
                  <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
                  <span className="text-slate-400 text-xs">Analyzing dataset structure & computing stats...</span>
                </div>
              ) : statsData ? (
                <div className="space-y-4">
                  {/* General Row count widget */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-center">
                      <div className="text-[10px] text-slate-500 font-bold uppercase">Total Row Count</div>
                      <div className="text-lg font-bold text-slate-200 mt-1">{statsData.row_count.toLocaleString()}</div>
                    </div>
                    <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-center">
                      <div className="text-[10px] text-slate-500 font-bold uppercase">Columns Quantity</div>
                      <div className="text-lg font-bold text-slate-200 mt-1">{statsData.columns.length}</div>
                    </div>
                    <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-center">
                      <div className="text-[10px] text-slate-500 font-bold uppercase">Virtual Table Mapping</div>
                      <div className="text-[11px] font-mono text-cyan-400 mt-2 truncate bg-slate-900 px-2 py-0.5 rounded">{statsData.name}</div>
                    </div>
                  </div>

                  {/* Columns Detail Grid */}
                  <div className="bg-slate-950 rounded-lg border border-slate-800 overflow-hidden">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-900 text-slate-400 border-b border-slate-800 font-semibold text-[10px]">
                          <th className="p-2 border-r border-slate-800">Column Name</th>
                          <th className="p-2 border-r border-slate-800">Data Type</th>
                          <th className="p-2 border-r border-slate-800 text-center">Null Count (%)</th>
                          <th className="p-2 border-r border-slate-800 text-center">Distinct Values</th>
                          <th className="p-2 border-r border-slate-800">Min Val</th>
                          <th className="p-2 border-r border-slate-800">Max Val</th>
                          <th className="p-2">Avg Val</th>
                        </tr>
                      </thead>
                      <tbody>
                        {statsData.columns.map((col, idx) => (
                          <tr key={col.column} className="border-b border-slate-800/65 hover:bg-slate-800/30">
                            <td className="p-2 font-mono text-slate-200 border-r border-slate-800 font-bold">{col.column}</td>
                            <td className="p-2 text-slate-400 font-mono border-r border-slate-800">{col.type}</td>
                            <td className="p-2 text-center border-r border-slate-800 text-slate-300">
                              {col.null_count} <span className="text-[9px] text-slate-500">({col.null_percentage}%)</span>
                            </td>
                            <td className="p-2 text-center border-r border-slate-800 text-cyan-400 font-bold font-mono">{col.unique_count}</td>
                            <td className="p-2 border-r border-slate-800 text-slate-350 truncate max-w-[120px] font-mono">{col.min ?? "N/A"}</td>
                            <td className="p-2 border-r border-slate-800 text-slate-350 truncate max-w-[120px] font-mono">{col.max ?? "N/A"}</td>
                            <td className="p-2 text-emerald-400 font-mono">{col.avg !== null ? col.avg : "N/A"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="text-center text-slate-500 py-10">No metadata available</div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-3 border-t border-slate-700 bg-slate-950 rounded-b-xl flex justify-end">
              <button 
                onClick={() => setActiveStatsTable(null)}
                className="px-4 py-1.5 bg-slate-800 text-slate-200 hover:text-white rounded hover:bg-slate-700 text-xs font-semibold"
              >
                Close View
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
