"use client";
import { useState } from "react";
import { AgentResponse } from "@/types";
import { cn, getAssistantIcon, getConfidenceBadgeClass } from "@/lib/utils";
import Link from "next/link";
import { AlertTriangle, CheckCircle, LayoutDashboard, Target, TrendingUp, XCircle, HelpCircle, Sparkles, Smile, BarChart2, Heart, MessageSquare, Play, Code, Copy, Check, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { dataApi } from "@/lib/api";
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
  Legend
} from "recharts";

function parseLine(line: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let current = line;
  
  // Regex to find **bold** and `code`
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

function SQLBlockContainer({ initialSql, datasetTable }: { initialSql: string; datasetTable?: string }) {
  const [sql, setSql] = useState(initialSql);
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<{ columns: string[]; rows: any[] } | null>(null);
  const [error, setError] = useState<{ message: string; explanation?: string; suggestion?: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(sql);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRun = async () => {
    setIsLoading(true);
    setError(null);
    setResults(null);
    try {
      const res = await dataApi.explore({
        sql,
        dataset_table: datasetTable,
        page: 1,
        page_size: 15,
      });
      setResults({
        columns: res.columns || [],
        rows: res.rows || [],
      });
      toast.success("Query executed successfully!");
    } catch (err: any) {
      console.error(err);
      const detail = err.response?.data?.detail;
      if (typeof detail === "object" && detail !== null) {
        setError({
          message: detail.error || "Failed to execute query",
          explanation: detail.explanation,
          suggestion: detail.suggestion,
        });
      } else {
        setError({
          message: err.message || "Failed to execute query",
        });
      }
      toast.error("Query failed");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="my-4 overflow-hidden rounded-xl border border-border bg-muted/30 shadow-sm">
      {/* Editor Header */}
      <div className="flex items-center justify-between border-b border-border bg-muted/60 px-4 py-2 text-xs font-mono text-muted-foreground font-sans">
        <div className="flex items-center gap-2">
          <Code className="h-3.5 w-3.5 text-primary" />
          <span>Interactive SQL Query</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-foreground"
            onClick={handleCopy}
            title="Copy SQL"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[10px]"
            onClick={() => setIsEditing(!isEditing)}
          >
            {isEditing ? "View Code" : "Edit Code"}
          </Button>
          <Button
            variant="default"
            size="sm"
            className="h-6 px-2.5 bg-primary hover:bg-primary/95 text-primary-foreground font-sans font-semibold gap-1 text-[11px]"
            onClick={handleRun}
            disabled={isLoading}
          >
            <Play className="h-3 w-3 fill-current" />
            {isLoading ? "Running..." : "Run"}
          </Button>
        </div>
      </div>

      {/* Code Textarea/Pre */}
      <div className="p-3 bg-slate-950 dark:bg-slate-900/60 font-mono text-xs">
        {isEditing ? (
          <textarea
            value={sql}
            onChange={(e) => setSql(e.target.value)}
            className="w-full min-h-[100px] bg-transparent text-slate-100 outline-none border-0 resize-y p-0 focus:ring-0 leading-relaxed font-mono"
            placeholder="Write your SQL query..."
          />
        ) : (
          <pre className="text-slate-100 overflow-x-auto whitespace-pre-wrap leading-relaxed font-mono">
            <code>{sql}</code>
          </pre>
        )}
      </div>

      {/* Error & Suggestions Banner */}
      {error && (
        <div className="border-t border-red-500/20 bg-red-500/5 p-4 text-xs font-sans">
          <div className="flex items-start gap-2 text-red-600 dark:text-red-400">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-semibold mb-1">Query Error</p>
              <p className="font-mono text-[11px] opacity-90">{error.message}</p>
            </div>
          </div>
          {error.explanation && (
            <div className="mt-3 pl-6 border-l border-red-500/10 text-muted-foreground font-sans">
              <span className="font-semibold text-foreground">Explanation: </span>
              {error.explanation}
            </div>
          )}
          {error.suggestion && (
            <div className="mt-3 pl-6 flex flex-wrap items-center gap-2 font-sans animate-fade-in">
              <span className="text-muted-foreground">Suggested Fix:</span>
              <code className="bg-background px-1.5 py-0.5 rounded border border-border font-mono text-[10px] text-primary">
                {error.suggestion}
              </code>
              <Button
                variant="outline"
                size="sm"
                className="h-5 px-1.5 text-[9px] gap-1 hover:bg-primary/5 hover:text-primary"
                onClick={() => {
                  setSql(error.suggestion!);
                  setError(null);
                }}
              >
                <Sparkles className="h-2.5 w-2.5" />
                Apply Fix
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Query Results */}
      {results && (
        <div className="border-t border-border bg-card font-sans">
          <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/20 text-xs font-semibold text-muted-foreground">
            <span>Result Preview ({results.rows.length} rows)</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-5 text-[10px]"
              onClick={() => setResults(null)}
            >
              Clear
            </Button>
          </div>
          {results.rows.length > 0 ? (
            <div className="max-h-60 overflow-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-muted/40 text-muted-foreground border-b border-border font-semibold">
                    {results.columns.map((col) => (
                      <th key={col} className="px-3 py-2 whitespace-nowrap">{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {results.rows.map((row, rIdx) => (
                    <tr key={rIdx} className="hover:bg-muted/10">
                      {results.columns.map((col) => (
                        <td key={col} className="px-3 py-1.5 max-w-[200px] truncate font-mono text-[11px] text-muted-foreground">
                          {row[col] !== null && row[col] !== undefined ? String(row[col]) : "-"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-4 text-center text-xs text-muted-foreground font-sans">
              Query returned no rows.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function renderMarkdown(text: string, datasetTable?: string): React.ReactNode {
  if (!text) return null;
  
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let currentList: React.ReactNode[] = [];
  let inList = false;
  
  let inCodeBlock = false;
  let codeBlockLines: string[] = [];
  let codeBlockLang = "";
  
  const flushList = (key: number) => {
    if (currentList.length > 0) {
      elements.push(
        <ul key={`list-${key}`} className="list-disc pl-5 mb-4 space-y-1 text-sm text-muted-foreground font-sans">
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
    
    // Check for code blocks
    if (trimmed.startsWith("```")) {
      flushList(i);
      if (inCodeBlock) {
        // Leaving code block
        inCodeBlock = false;
        const codeContent = codeBlockLines.join("\n");
        if (codeBlockLang === "sql") {
          elements.push(
            <SQLBlockContainer key={`sql-${i}`} initialSql={codeContent} datasetTable={datasetTable} />
          );
        } else {
          elements.push(
            <pre key={`code-${i}`} className="bg-muted p-4 rounded-lg text-xs font-mono border border-border/40 overflow-x-auto my-3 font-mono">
              <code>{codeContent}</code>
            </pre>
          );
        }
        codeBlockLines = [];
        codeBlockLang = "";
      } else {
        // Entering code block
        inCodeBlock = true;
        codeBlockLang = trimmed.substring(3).toLowerCase();
      }
      continue;
    }
    
    if (inCodeBlock) {
      codeBlockLines.push(line);
      continue;
    }
    
    // 1. Headers
    if (trimmed.startsWith("# ")) {
      flushList(i);
      const title = trimmed.substring(2);
      
      let icon = null;
      const lowerTitle = title.toLowerCase();
      if (lowerTitle.includes("executive")) {
        icon = <Sparkles className="w-4 h-4 text-amber-500 animate-pulse" />;
      } else if (lowerTitle.includes("overview")) {
        icon = <LayoutDashboard className="w-4 h-4 text-blue-500" />;
      } else if (lowerTitle.includes("insights")) {
        icon = <TrendingUp className="w-4 h-4 text-indigo-500" />;
      } else if (lowerTitle.includes("observations")) {
        icon = <Target className="w-4 h-4 text-red-500" />;
      } else if (lowerTitle.includes("sentiment")) {
        icon = <Heart className="w-4 h-4 text-rose-500" />;
      } else if (lowerTitle.includes("visualization")) {
        icon = <BarChart2 className="w-4 h-4 text-violet-500" />;
      } else if (lowerTitle.includes("kpi")) {
        icon = <Target className="w-4 h-4 text-emerald-500" />;
      } else if (lowerTitle.includes("recommendation")) {
        icon = <CheckCircle className="w-4 h-4 text-green-500" />;
      } else if (lowerTitle.includes("predictive")) {
        icon = <TrendingUp className="w-4 h-4 text-cyan-500" />;
      } else if (lowerTitle.includes("conclusion")) {
        icon = <CheckCircle className="w-4 h-4 text-sky-500" />;
      } else {
        icon = <Sparkles className="w-4 h-4 text-primary" />;
      }
      
      elements.push(
        <div key={`h1-${i}`} className="flex items-center gap-2 mt-6 mb-3 border-b border-border/50 pb-1.5 first:mt-0 font-sans">
          {icon}
          <h2 className="text-sm font-bold text-foreground tracking-tight uppercase">{title}</h2>
        </div>
      );
    } else if (trimmed.startsWith("## ")) {
      flushList(i);
      elements.push(
        <h3 key={`h2-${i}`} className="text-xs font-bold text-foreground/80 mt-4 mb-2 font-sans">
          {parseLine(trimmed.substring(3))}
        </h3>
      );
    } else if (trimmed.startsWith("### ")) {
      flushList(i);
      elements.push(
        <h4 key={`h3-${i}`} className="text-xs font-semibold text-muted-foreground mt-3 mb-1 font-sans">
          {parseLine(trimmed.substring(4))}
        </h4>
      );
    } 
    // 2. Bullet list items
    else if (trimmed.startsWith("* ") || trimmed.startsWith("- ")) {
      inList = true;
      const content = trimmed.substring(2);
      currentList.push(
        <li key={`li-${i}-${currentList.length}`} className="leading-relaxed font-sans">
          {parseLine(content)}
        </li>
      );
    } 
    // 3. Numbered list items
    else if (/^\d+\.\s/.test(trimmed)) {
      flushList(i);
      const match = trimmed.match(/^(\d+)\.\s(.*)/);
      if (match) {
        elements.push(
          <div key={`num-${i}`} className="flex items-start gap-2 mb-2 text-sm font-sans">
            <span className="font-semibold text-primary">{match[1]}.</span>
            <div className="flex-1 text-muted-foreground">{parseLine(match[2])}</div>
          </div>
        );
      }
    }
    // 4. Blank lines
    else if (trimmed === "") {
      flushList(i);
    } 
    // 5. Paragraphs
    else {
      if (inList) {
        flushList(i);
      }
      elements.push(
        <p key={`p-${i}`} className="text-sm text-muted-foreground leading-relaxed mb-2.5 font-sans">
          {parseLine(line)}
        </p>
      );
    }
  }
  
  flushList(lines.length);
  
  return <div className="space-y-1">{elements}</div>;
}

interface AnalysisResponseCardProps {
  response: AgentResponse;
  agentName: string;
  datasetTable?: string;
}

export function AnalysisResponseCard({ response, agentName, datasetTable }: AnalysisResponseCardProps) {
  return (
    <div className="space-y-4 animate-slide-up">
      {/* Executive Summary */}
      <div className="bg-card border border-border/60 rounded-xl p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-4 pb-2 border-b border-border/40">
          <span className="text-xs font-bold">{getAssistantIcon(agentName)}</span>
          <span className="text-sm font-semibold text-primary capitalize">{agentName.replace("_", " ")} Assistant</span>
          <Badge className={cn("ml-auto text-xs", getConfidenceBadgeClass(response.confidence_level ?? "high"))}>
            {response.confidence_level ?? "high"} confidence
          </Badge>
        </div>
        {renderMarkdown(response.executive_summary, datasetTable)}
      </div>

      {response.dashboard && (
        <Link
          href={`/dashboards/${response.dashboard.id}`}
          className="flex items-center justify-between rounded-xl border border-primary/25 bg-primary/5 p-4 text-sm hover:bg-primary/10"
        >
          <span className="flex items-center gap-2 font-medium text-primary">
            <LayoutDashboard className="h-4 w-4" />
            Open generated dashboard
          </span>
          <span className="text-xs text-muted-foreground">{response.dashboard.widgets_created} visuals</span>
        </Link>
      )}

      {/* Dynamic Visualizations / Charts from ML */}
      {response.visualizations && response.visualizations.length > 0 && (
        <div className="space-y-4">
          {response.visualizations.map((viz, idx) => (
            <Card key={idx} className="overflow-hidden border border-border/40 bg-card/50 backdrop-blur-sm shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-foreground/90">{viz.title}</CardTitle>
              </CardHeader>
              <CardContent className="h-64 pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  {viz.type === "line" ? (
                    <LineChart data={viz.data as any} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted/30" />
                      <XAxis dataKey={viz.x_key} tick={{ fontSize: 9 }} stroke="currentColor" className="text-muted-foreground" />
                      <YAxis tick={{ fontSize: 9 }} stroke="currentColor" className="text-muted-foreground" />
                      <Tooltip contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))", fontSize: 10 }} />
                      <Legend wrapperStyle={{ fontSize: 10 }} />
                      {viz.y_keys?.map((yKey) => (
                        <Line
                          key={yKey}
                          type="monotone"
                          dataKey={yKey}
                          stroke={yKey === "Forecast" ? "#a855f7" : yKey === "Anomaly" ? "#ef4444" : "#3b82f6"}
                          strokeDasharray={yKey === "Forecast" ? "5 5" : undefined}
                          dot={yKey === "Anomaly" ? { r: 5, fill: "#ef4444", stroke: "#fff", strokeWidth: 1.5 } : yKey === "Forecast" ? false : { r: 1.5 }}
                          strokeWidth={2}
                        />
                      ))}
                    </LineChart>
                  ) : (
                    <BarChart data={viz.data as any} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted/30" />
                      <XAxis dataKey={viz.x_key} tick={{ fontSize: 9 }} stroke="currentColor" className="text-muted-foreground" />
                      <YAxis tick={{ fontSize: 9 }} stroke="currentColor" className="text-muted-foreground" />
                      <Tooltip contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))", fontSize: 10 }} />
                      <Legend wrapperStyle={{ fontSize: 10 }} />
                      {viz.y_keys?.map((yKey) => (
                        <Bar key={yKey} dataKey={yKey} fill="#3b82f6" radius={[4, 4, 0, 0]} />
                      ))}
                    </BarChart>
                  )}
                </ResponsiveContainer>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {response.insights?.length ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-blue-500" /> Analysis
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1.5">
              {response.insights.map((f, i) => (
                <li key={i} className="text-sm flex items-start gap-2">
                  <span className="mt-0.5 w-5 h-5 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
                    {i + 1}
                  </span>
                  {f}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {/* Key Findings */}
      {response.key_findings?.length ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-blue-500" /> Key Findings
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1.5">
              {response.key_findings.map((f, i) => (
                <li key={i} className="text-sm flex items-start gap-2">
                  <span className="mt-0.5 w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 flex items-center justify-center text-xs font-bold flex-shrink-0">
                    {i + 1}
                  </span>
                  {f}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {/* Recommendations */}
      {response.recommendations?.length ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Target className="w-4 h-4 text-green-500" /> Recommendations
              {response.requires_approval && (
                <Badge variant="warning" className="ml-2">Needs Approval</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1.5">
              {response.recommendations.map((r, i) => (
                <li key={i} className="text-sm flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                  {r}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {/* Risks & Missing Data */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {response.risks?.length ? (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-orange-500" /> Risks
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1">
                {response.risks.map((r, i) => (
                  <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                    <XCircle className="w-3 h-3 text-orange-400 mt-0.5 flex-shrink-0" /> {r}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : null}
        {response.missing_data?.length ? (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs flex items-center gap-1.5">
                <HelpCircle className="w-3.5 h-3.5 text-yellow-500" /> Missing Data
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1">
                {response.missing_data.map((m, i) => (
                  <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 mt-1.5 flex-shrink-0" /> {m}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : null}
      </div>

      {/* Next Actions */}
      {response.next_actions?.length ? (
        <div className="bg-muted/50 rounded-xl p-4">
          <p className="text-xs font-semibold text-muted-foreground mb-2">NEXT ACTIONS</p>
          <ol className="space-y-1">
            {response.next_actions.map((a, i) => (
              <li key={i} className="text-sm flex items-start gap-2">
                <span className="font-mono text-xs text-muted-foreground mt-0.5">{i + 1}.</span> {a}
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </div>
  );
}
