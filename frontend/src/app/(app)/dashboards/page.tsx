"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { dashboardsApi, datasetsApi } from "@/lib/api";
import { Dataset } from "@/types/bi";
import toast from "react-hot-toast";
import {
  Sparkles,
  Layout,
  Database,
  TrendingUp,
  Coins,
  Users,
  Settings,
  Activity,
  ArrowRight,
  Loader2,
  Plus,
  Trash2,
  Calendar,
  Layers,
  CheckCircle,
} from "lucide-react";

interface DashboardSummary {
  id: string;
  title: string;
  description?: string;
  is_default: boolean;
  created_at: string;
}

interface TemplateSummary {
  id: string;
  name: string;
  category: string;
  description: string;
  layout_config: any;
}

export default function DashboardsPage() {
  const router = useRouter();
  const [dashboards, setDashboards] = useState<DashboardSummary[]>([]);
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(""); // "" means blank dashboard
  const [selectedDatasetId, setSelectedDatasetId] = useState<string>("");

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [dashData, tempData, datasetData] = await Promise.all([
        dashboardsApi.list(),
        dashboardsApi.listTemplates(),
        datasetsApi.list(),
      ]);
      setDashboards(dashData);
      setTemplates(tempData);
      
      const readyDatasets = datasetData.filter((d: Dataset) => d.status === "ready");
      setDatasets(readyDatasets);
      if (readyDatasets.length > 0) {
        setSelectedDatasetId(readyDatasets[0].id);
      }
    } catch (err) {
      toast.error("Failed to load dashboard data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleCreate() {
    if (!newTitle.trim()) {
      toast.error("Please enter a dashboard title");
      return;
    }

    setCreating(true);
    try {
      if (selectedTemplateId) {
        if (!selectedDatasetId) {
          toast.error("Please select a dataset to map the template widgets");
          setCreating(false);
          return;
        }
        
        const res = await dashboardsApi.createFromTemplate({
          template_id: selectedTemplateId,
          dataset_id: selectedDatasetId,
          title: newTitle.trim(),
        });
        toast.success("Dashboard generated successfully from template!");
        router.push(`/dashboards/${res.dashboard_id}`);
      } else {
        const res = await dashboardsApi.create({
          title: newTitle.trim(),
          description: newDescription.trim() || undefined,
        });
        toast.success("Blank dashboard created successfully!");
        router.push(`/dashboards/${res.id}`);
      }
    } catch (err: any) {
      const msg = err.response?.data?.detail || err.message || "Failed to create dashboard";
      toast.error(msg);
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string, title: string) {
    if (!confirm(`Are you sure you want to delete the dashboard "${title}"?`)) return;
    try {
      await dashboardsApi.delete(id);
      setDashboards((prev) => prev.filter((d) => d.id !== id));
      toast.success("Dashboard deleted");
    } catch (err) {
      toast.error("Failed to delete dashboard");
    }
  }

  // Get matching category icon and colors
  const getTemplateMeta = (category: string) => {
    switch (category.toLowerCase()) {
      case "sales":
        return {
          icon: TrendingUp,
          bg: "bg-amber-500/10 text-amber-500 border-amber-500/20",
          hover: "hover:border-amber-500/50 hover:bg-amber-500/5",
          accent: "amber",
        };
      case "marketing":
        return {
          icon: Sparkles,
          bg: "bg-purple-500/10 text-purple-500 border-purple-500/20",
          hover: "hover:border-purple-500/50 hover:bg-purple-500/5",
          accent: "purple",
        };
      case "finance":
        return {
          icon: Coins,
          bg: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
          hover: "hover:border-emerald-500/50 hover:bg-emerald-500/5",
          accent: "emerald",
        };
      case "hr":
        return {
          icon: Users,
          bg: "bg-blue-500/10 text-blue-500 border-blue-500/20",
          hover: "hover:border-blue-500/50 hover:bg-blue-500/5",
          accent: "blue",
        };
      case "operations":
        return {
          icon: Settings,
          bg: "bg-rose-500/10 text-rose-500 border-rose-500/20",
          hover: "hover:border-rose-500/50 hover:bg-rose-500/5",
          accent: "rose",
        };
      default:
        return {
          icon: Layout,
          bg: "bg-muted text-muted-foreground border-border",
          hover: "hover:border-primary/50 hover:bg-primary/5",
          accent: "primary",
        };
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Layout className="h-6 w-6 text-primary" /> Workspaces & Dashboards
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Build visualizations from your datasets or select from pre-engineered templates.
          </p>
        </div>
        {!showCreate && (
          <button
            onClick={() => {
              setShowCreate(true);
              setNewTitle("");
              setNewDescription("");
              setSelectedTemplateId("");
            }}
            className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/95 text-primary-foreground rounded-lg text-sm font-semibold transition-all shadow-md cursor-pointer"
          >
            <Plus className="h-4 w-4" /> Create Workspace
          </button>
        )}
      </div>

      {showCreate && (
        <div className="bg-card border border-border rounded-xl p-6 shadow-md space-y-6 animate-slide-up">
          <div className="flex items-center justify-between border-b border-border/50 pb-3">
            <h2 className="text-base font-bold text-foreground flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" /> Create New Workspace
            </h2>
            <button
              onClick={() => {
                setShowCreate(false);
              }}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Close
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Column: Form Parameters */}
            <div className="space-y-4 lg:col-span-1 border-r border-border/40 pr-0 lg:pr-6">
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Workspace Title
                </label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. Q2 Performance Overview"
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                />
              </div>

              {!selectedTemplateId && (
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Description (Optional)
                  </label>
                  <textarea
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    placeholder="Brief details about this dashboard..."
                    rows={3}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary resize-none"
                  />
                </div>
              )}

              {selectedTemplateId && (
                <div className="space-y-2.5 bg-background p-4 border border-border/60 rounded-lg animate-slide-up">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Database className="h-4.5 w-4.5 text-primary" /> Map Target Dataset
                  </label>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    This template generates dynamic SQL queries. Select which dataset we should profile and map to these template slots.
                  </p>
                  
                  {datasets.length === 0 ? (
                    <div className="text-xs text-red-500 py-1 font-medium">
                      ⚠️ No ready datasets found. Please upload a dataset first.
                    </div>
                  ) : (
                    <select
                      value={selectedDatasetId}
                      onChange={(e) => setSelectedDatasetId(e.target.value)}
                      className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                    >
                      {datasets.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name} ({d.row_count.toLocaleString()} rows)
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              <div className="pt-2 flex gap-3">
                <button
                  onClick={handleCreate}
                  disabled={creating || !newTitle.trim() || (selectedTemplateId !== "" && !selectedDatasetId)}
                  className="flex-1 py-2 bg-primary hover:bg-primary/95 text-primary-foreground font-semibold rounded-lg text-sm transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {creating ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Creating...
                    </>
                  ) : (
                    <>
                      Create Workspace <ArrowRight className="h-4.5 w-4.5" />
                    </>
                  )}
                </button>
                <button
                  onClick={() => {
                    setShowCreate(false);
                  }}
                  className="px-4 py-2 border border-border text-foreground bg-background hover:bg-muted/40 rounded-lg text-sm transition-colors cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>

            {/* Right Column: Template Grid Selection */}
            <div className="lg:col-span-2 space-y-3">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block">
                Select Layout Mode or Pre-Built Template
              </label>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-96 overflow-y-auto pr-1">
                {/* Blank Template */}
                <div
                  onClick={() => {
                    setSelectedTemplateId("");
                    if (newTitle === "") {
                      setNewTitle("");
                    }
                  }}
                  className={`border p-4 rounded-xl cursor-pointer text-left transition-all duration-200 relative overflow-hidden group ${
                    selectedTemplateId === ""
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "border-border/80 bg-background/50 hover:bg-muted/30"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-muted border border-border/80 text-muted-foreground">
                      <Layout className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-sm group-hover:text-primary transition-colors">Blank Canvas</h4>
                      <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                        Start with a completely empty dashboard. Add widgets, custom SQL cards, and labels from scratch.
                      </p>
                    </div>
                  </div>
                  {selectedTemplateId === "" && (
                    <div className="absolute top-2 right-2 text-primary">
                      <CheckCircle className="h-4 w-4 fill-primary text-background" />
                    </div>
                  )}
                </div>

                {/* Database templates */}
                {templates.map((temp) => {
                  const meta = getTemplateMeta(temp.category);
                  const IconComp = meta.icon;
                  const isSelected = selectedTemplateId === temp.id;
                  
                  return (
                    <div
                      key={temp.id}
                      onClick={() => {
                        setSelectedTemplateId(temp.id);
                        // Auto-fill template name if input is empty or was previously named a template
                        if (!newTitle.trim() || templates.some(t => t.name === newTitle.trim()) || newTitle.trim() === "Blank Canvas") {
                          setNewTitle(temp.name);
                        }
                      }}
                      className={`border p-4 rounded-xl cursor-pointer text-left transition-all duration-200 relative overflow-hidden group ${
                        isSelected
                          ? "border-primary bg-primary/5 ring-1 ring-primary"
                          : `border-border/80 bg-background/50 ${meta.hover}`
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`p-2 rounded-lg border ${meta.bg}`}>
                          <IconComp className="w-5 h-5" />
                        </div>
                        <div>
                          <h4 className="font-semibold text-sm group-hover:text-primary transition-colors flex items-center gap-1.5">
                            {temp.name}
                          </h4>
                          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                            {temp.description}
                          </p>
                        </div>
                      </div>
                      {isSelected && (
                        <div className="absolute top-2 right-2 text-primary">
                          <CheckCircle className="h-4 w-4 fill-primary text-background" />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Existing Workspaces List */}
      <div className="space-y-4">
        <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Existing Workspaces ({dashboards.length})
        </h2>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array(3)
              .fill(0)
              .map((_, i) => (
                <div
                  key={i}
                  className="h-36 bg-card border border-border rounded-xl animate-pulse"
                />
              ))}
          </div>
        ) : dashboards.length === 0 ? (
          <div className="text-center py-16 bg-card border border-border/80 rounded-xl border-dashed">
            <Layout className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
            <h3 className="text-sm font-semibold text-foreground/80">No active workspaces</h3>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
              Create a workspace to start exploring datasets, creating charts, and scheduling automated PDF email reports.
            </p>
            <button
              onClick={() => setShowCreate(true)}
              className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:bg-primary/95 transition-all cursor-pointer"
            >
              Get Started
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {dashboards.map((d) => (
              <div
                key={d.id}
                className="bg-card border border-border/80 rounded-xl p-5 hover:border-primary/40 hover:shadow-sm transition-all duration-200 group flex flex-col justify-between"
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-sm text-foreground truncate group-hover:text-primary transition-colors">
                      {d.title}
                    </h3>
                    {d.is_default && (
                      <span className="shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-primary/10 text-primary border border-primary/20">
                        Default
                      </span>
                    )}
                  </div>
                  {d.description ? (
                    <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                      {d.description}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground/50 italic">
                      No description provided
                    </p>
                  )}
                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/75 pt-1">
                    <Calendar className="h-3.5 w-3.5" />
                    <span>Created {new Date(d.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                  </div>
                </div>

                <div className="flex gap-2.5 mt-5 pt-3 border-t border-border/50">
                  <button
                    onClick={() => router.push(`/dashboards/${d.id}`)}
                    className="flex-1 px-3 py-1.5 text-xs rounded-lg bg-primary/10 hover:bg-primary/20 text-primary font-semibold transition-all cursor-pointer text-center"
                  >
                    Open Workspace
                  </button>
                  <button
                    onClick={() => handleDelete(d.id, d.title)}
                    className="px-2.5 py-1.5 text-xs rounded-lg border border-border hover:bg-red-500/5 hover:border-red-500/30 text-muted-foreground hover:text-red-500 transition-all cursor-pointer"
                    title="Delete Workspace"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
