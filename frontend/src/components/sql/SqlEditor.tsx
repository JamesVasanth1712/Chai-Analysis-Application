import { useState, useEffect, useRef, useMemo } from "react";
import { 
  Play, 
  Sparkles, 
  BookMarked, 
  History, 
  HelpCircle, 
  Plus, 
  X, 
  ChevronRight, 
  WandSparkles, 
  Check, 
  FileText,
  AlertCircle,
  HelpCircleIcon,
  Loader2,
  Trash2
} from "lucide-react";
import { dataApi } from "@/lib/api";
import toast from "react-hot-toast";

interface ColumnInfo {
  name: string;
  type: string;
}

interface TableNode {
  id: string;
  name: string;
  sanitized_name: string;
  table_name: string;
  columns: ColumnInfo[];
}

interface SqlEditorProps {
  tables: TableNode[];
  onExecute: (sql: string) => void;
  loading: boolean;
  externalSql?: { sql: string; timestamp: number } | null;
  error?: string | null;
}

interface Tab {
  id: string;
  title: string;
  sql: string;
}

interface SavedQuery {
  id: string;
  title: string;
  sql: string;
}

interface HistoryItem {
  id: string;
  sql: string;
  timestamp: string;
  durationMs: number;
  status: "success" | "error";
  rowsCount?: number;
}

const SQL_KEYWORDS = [
  "SELECT", "FROM", "WHERE", "GROUP BY", "ORDER BY", "LIMIT", "JOIN", "ON",
  "LEFT JOIN", "INNER JOIN", "RIGHT JOIN", "COUNT", "SUM", "AVG", "MIN", "MAX",
  "CASE", "WHEN", "THEN", "ELSE", "END", "AS", "UNION", "AND", "OR", "IN",
  "LIKE", "HAVING", "DISTINCT", "COALESCE", "CAST"
];

function highlightSql(sql: string) {
  if (!sql) return "";
  
  let html = sql
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
    
  const tokens: { placeholder: string; html: string }[] = [];
  let tokenCounter = 0;

  const addToken = (rawHtml: string, type: string) => {
    const placeholder = `__SQL_TOKEN_${type}_${tokenCounter++}__`;
    tokens.push({ placeholder, html: rawHtml });
    return placeholder;
  };

  // 1. Multi-line comments: /* ... */
  html = html.replace(/\/\*[\s\S]*?\*\//g, (match) => {
    return addToken(`<span style="color: #64748b; font-style: italic;">${match}</span>`, "COMMENT");
  });

  // 2. Single-line comments: -- ...
  html = html.replace(/--.*/g, (match) => {
    return addToken(`<span style="color: #64748b; font-style: italic;">${match}</span>`, "COMMENT");
  });

  // 3. Strings: '...' or "..."
  html = html.replace(/(['"])(?:(?!\1|\\).|\\.)*\1/g, (match) => {
    return addToken(`<span style="color: #eab308; font-weight: 500;">${match}</span>`, "STRING");
  });

  // 4. Numbers
  html = html.replace(/\b(\d+(?:\.\d+)?)\b/g, '<span style="color: #22c55e; font-weight: bold;">$1</span>');

  // 5. Database tables ds_xxx
  html = html.replace(/\b(ds_[0-9a-fA-F_]+)\b/gi, '<span style="color: #06b6d4; font-weight: 600;">$1</span>');

  // 6. Public schema
  html = html.replace(/\b(public)\b/gi, '<span style="color: #38bdf8; font-weight: 600;">$1</span>');

  // 7. Constants
  const constants = ["TRUE", "FALSE", "NULL"];
  const constRegex = new RegExp(`\\b(${constants.join("|")})\\b`, "gi");
  html = html.replace(constRegex, (match) => {
    return `<span style="color: #f97316; font-weight: bold;">${match.toUpperCase()}</span>`;
  });

  // 8. Data types
  const types = [
    "INT", "INTEGER", "VARCHAR", "TEXT", "TIMESTAMP", "BOOLEAN", "NUMERIC", "FLOAT", 
    "DATE", "DOUBLE", "PRECISION", "REAL", "BIGINT", "SMALLINT", "SERIAL", "JSON", "JSONB"
  ];
  const typeRegex = new RegExp(`\\b(${types.join("|")})\\b`, "gi");
  html = html.replace(typeRegex, (match) => {
    return `<span style="color: #0d9488; font-weight: 600;">${match.toUpperCase()}</span>`;
  });

  // 9. Functions
  const functions = [
    "COUNT", "SUM", "AVG", "MIN", "MAX", "COALESCE", "CAST", "LOWER", "UPPER", 
    "TRIM", "SUBSTRING", "NOW", "CONCAT", "DATE_TRUNC", "EXTRACT", "POSITION"
  ];
  const funcRegex = new RegExp(`\\b(${functions.join("|")})\\b`, "gi");
  html = html.replace(funcRegex, (match) => {
    return `<span style="color: #d946ef; font-weight: 600;">${match.toUpperCase()}</span>`;
  });

  // 10. SQL Keywords
  const keywords = [
    "SELECT", "FROM", "WHERE", "GROUP BY", "ORDER BY", "LIMIT", "JOIN", "ON",
    "LEFT JOIN", "INNER JOIN", "RIGHT JOIN", "FULL JOIN", "CROSS JOIN", "OUTER JOIN",
    "CASE", "WHEN", "THEN", "ELSE", "END", "AS", "UNION ALL", "UNION", "AND", "OR", "IN",
    "LIKE", "ILIKE", "HAVING", "DISTINCT", "FILTER", "DESC", "ASC", "OFFSET", "USING",
    "CREATE", "TABLE", "DROP", "ALTER", "INSERT", "INTO", "VALUES", "UPDATE", "SET", 
    "DELETE", "TRUNCATE", "EXISTS", "BETWEEN", "NOT", "IS", "WITH"
  ];
  
  keywords.sort((a, b) => b.length - a.length);
  const kwRegex = new RegExp(`\\b(${keywords.map(k => k.replace(/ /g, "\\s+")).join("|")})\\b`, "gi");
  html = html.replace(kwRegex, (match) => {
    const upper = match.toUpperCase().replace(/\s+/g, " ");
    return `<span style="color: #f43f5e; font-weight: bold;">${upper}</span>`;
  });

  // 11. Restore tokens
  for (let i = tokens.length - 1; i >= 0; i--) {
    const token = tokens[i];
    html = html.replace(token.placeholder, token.html);
  }

  // Prevent line collapse
  if (html.endsWith("\n")) {
    html += " ";
  }
  
  return html;
}

export function SqlEditor({ tables, onExecute, loading, externalSql, error }: SqlEditorProps) {
  const [tabs, setTabs] = useState<Tab[]>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("chai_sql_editor_tabs");
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed.map(t => t.sql === "SELECT * FROM dataset LIMIT 100"
              ? { ...t, sql: "SELECT 1 AS id, 'Welcome to SQL Workspace' AS message;" }
              : t
            );
          }
        } catch (e) {
          console.error("Failed to parse saved SQL tabs", e);
        }
      }
    }
    return [{ id: "tab-1", title: "Query 1", sql: "SELECT 1 AS id, 'Welcome to SQL Workspace' AS message;" }];
  });

  const [activeTabId, setActiveTabId] = useState<string>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("chai_sql_editor_active_tab_id");
      if (saved) return saved;
    }
    return "tab-1";
  });

  const [savedQueries, setSavedQueries] = useState<SavedQuery[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [showSaved, setShowSaved] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    localStorage.setItem("chai_sql_editor_tabs", JSON.stringify(tabs));
  }, [tabs]);

  useEffect(() => {
    localStorage.setItem("chai_sql_editor_active_tab_id", activeTabId);
  }, [activeTabId]);

  // Local storage load for history & saved queries
  useEffect(() => {
    const saved = localStorage.getItem("chai_saved_queries");
    if (saved) setSavedQueries(JSON.parse(saved));
    const hist = localStorage.getItem("chai_query_history");
    if (hist) setHistory(JSON.parse(hist));
  }, []);
  
  // AI Generate States
  const [showAiGen, setShowAiGen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  
  // AI Explain States
  const [explaining, setExplaining] = useState(false);
  const [explanation, setExplanation] = useState("");

  // AI Debug States
  const [debugging, setDebugging] = useState(false);

  // Auto-complete States
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [activeSuggestionIdx, setActiveSuggestionIdx] = useState(0);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [wordToComplete, setWordToComplete] = useState("");
  const [suggestionPos, setSuggestionPos] = useState({ top: 0, left: 0 });

  const highlightRef = useRef<HTMLPreElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const activeTab = tabs.find(t => t.id === activeTabId) || tabs[0];

  const highlightedCode = useMemo(() => {
    return highlightSql(activeTab.sql);
  }, [activeTab.sql]);

  const handleScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
    if (highlightRef.current) {
      highlightRef.current.scrollTop = e.currentTarget.scrollTop;
      highlightRef.current.scrollLeft = e.currentTarget.scrollLeft;
    }
  };

  useEffect(() => {
    if (highlightRef.current && textareaRef.current) {
      highlightRef.current.scrollTop = textareaRef.current.scrollTop;
      highlightRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
  }, [activeTab.sql]);

  // Local storage load for history & saved queries
  useEffect(() => {
    const saved = localStorage.getItem("chai_saved_queries");
    if (saved) setSavedQueries(JSON.parse(saved));
    const hist = localStorage.getItem("chai_query_history");
    if (hist) setHistory(JSON.parse(hist));
  }, []);

  const updateSql = (val: string) => {
    setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, sql: val } : t));
  };

  useEffect(() => {
    if (externalSql) {
      updateSql(externalSql.sql);
    }
  }, [externalSql]);

  useEffect(() => {
    if (tables.length > 0 && tabs.length === 1 && (tabs[0].sql === "SELECT * FROM dataset LIMIT 100" || tabs[0].sql === "SELECT 1 AS id, 'Welcome to SQL Workspace' AS message;")) {
      setTabs([{ id: "tab-1", title: "Query 1", sql: `SELECT * FROM ${tables[0].sanitized_name} LIMIT 100;` }]);
    }
  }, [tables]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // 1. Run Query: Ctrl+Enter
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      runActiveQuery();
      return;
    }

    // 2. Auto-complete navigation
    if (showSuggestions && suggestions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveSuggestionIdx(prev => (prev + 1) % suggestions.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveSuggestionIdx(prev => (prev - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        insertSuggestion(suggestions[activeSuggestionIdx]);
        return;
      }
      if (e.key === "Escape") {
        setShowSuggestions(false);
        return;
      }
    }
  };

  const runActiveQuery = () => {
    if (!activeTab.sql.trim()) return;

    let sqlToExecute = activeTab.sql;
    if (textareaRef.current) {
      const start = textareaRef.current.selectionStart;
      const end = textareaRef.current.selectionEnd;
      const selectedText = activeTab.sql.substring(start, end).trim();
      if (selectedText) {
        sqlToExecute = selectedText;
      }
    }
    
    const startTime = performance.now();
    onExecute(sqlToExecute);

    // Save to history list
    const newHistory: HistoryItem = {
      id: Math.random().toString(),
      sql: sqlToExecute,
      timestamp: new Date().toLocaleTimeString(),
      durationMs: 0, // updated on completion in page
      status: "success"
    };

    // Calculate execution time (rough simulation since API is async)
    setTimeout(() => {
      const endTime = performance.now();
      newHistory.durationMs = Math.round(endTime - startTime);
      setHistory(prev => {
        const next = [newHistory, ...prev].slice(0, 50);
        localStorage.setItem("chai_query_history", JSON.stringify(next));
        return next;
      });
    }, 800);
  };

  // Autocomplete calculation
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    updateSql(text);

    const cursor = e.target.selectionStart;
    const beforeCursor = text.substring(0, cursor);
    const lastWordMatch = beforeCursor.match(/[\w_]+$/);

    if (lastWordMatch) {
      const word = lastWordMatch[0];
      setWordToComplete(word);

      // Build autocompletion dictionary: SQL words + tables + columns
      const dict = [
        ...SQL_KEYWORDS,
        ...tables.map(t => t.sanitized_name),
        ...tables.flatMap(t => t.columns.map(c => c.name))
      ];

      const matches = Array.from(new Set(
        dict.filter(item => item.toUpperCase().startsWith(word.toUpperCase()) && item.toUpperCase() !== word.toUpperCase())
      )).slice(0, 8);

      if (matches.length > 0) {
        setSuggestions(matches);
        setActiveSuggestionIdx(0);
        setShowSuggestions(true);
        
        // Calculate coords (simplified top/left styling overlay)
        const lines = beforeCursor.split("\n");
        const currLineIdx = lines.length;
        const colIdx = lines[lines.length - 1].length;
        setSuggestionPos({
          top: currLineIdx * 15 + 40,
          left: colIdx * 7.5 + 40
        });
      } else {
        setShowSuggestions(false);
      }
    } else {
      setShowSuggestions(false);
    }
  };

  const insertSuggestion = (suggestion: string) => {
    if (!textareaRef.current) return;
    const txt = activeTab.sql;
    const cursor = textareaRef.current.selectionStart;
    const beforeCursor = txt.substring(0, cursor);
    const afterCursor = txt.substring(cursor);
    const wordLen = wordToComplete.length;

    const newTxt = beforeCursor.substring(0, beforeCursor.length - wordLen) + suggestion + afterCursor;
    updateSql(newTxt);
    setShowSuggestions(false);

    // Reset cursor position
    setTimeout(() => {
      if (textareaRef.current) {
        const newCursor = cursor - wordLen + suggestion.length;
        textareaRef.current.setSelectionRange(newCursor, newCursor);
        textareaRef.current.focus();
      }
    }, 10);
  };

  // Add new query tab
  const addTab = () => {
    const id = `tab-${Math.random()}`;
    const num = tabs.length + 1;
    setTabs(prev => [...prev, { id, title: `Query ${num}`, sql: "SELECT 1 AS id, 'Welcome to SQL Workspace' AS message;" }]);
    setActiveTabId(id);
  };

  // Close tab
  const closeTab = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (tabs.length === 1) return;
    const idx = tabs.findIndex(t => t.id === id);
    const nextTabs = tabs.filter(t => t.id !== id);
    setTabs(nextTabs);
    if (activeTabId === id) {
      setActiveTabId(nextTabs[Math.max(0, idx - 1)].id);
    }
  };

  // Save active SQL
  const handleSaveQuery = () => {
    const title = prompt("Enter a title for this saved query:", activeTab.title);
    if (!title) return;
    const newItem = { id: Math.random().toString(), title, sql: activeTab.sql };
    setSavedQueries(prev => {
      const next = [...prev, newItem];
      localStorage.setItem("chai_saved_queries", JSON.stringify(next));
      return next;
    });
    toast.success("Query saved successfully");
  };

  const deleteSavedQuery = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSavedQueries(prev => {
      const next = prev.filter(q => q.id !== id);
      localStorage.setItem("chai_saved_queries", JSON.stringify(next));
      return next;
    });
  };

  // Formatter: convert lowercase keywords to upper
  const formatSql = () => {
    let sql = activeTab.sql;
    SQL_KEYWORDS.forEach(kw => {
      const regex = new RegExp(`\\b${kw}\\b`, "gi");
      sql = sql.replace(regex, kw);
    });
    // Fix spaces around commas and lines
    sql = sql.replace(/\s*,\s*/g, ", ").trim();
    updateSql(sql);
    toast.success("Query formatted (Keywords Uppercased)");
  };

  // AI query generator call
  const triggerAiGen = async () => {
    if (!aiPrompt.trim()) return;
    setGenerating(true);
    try {
      const res = await dataApi.aiGenerate(aiPrompt);
      updateSql(res.sql);
      toast.success("SQL Query generated by AI!");
      setShowAiGen(false);
      setAiPrompt("");
    } catch (e: any) {
      toast.error(e.response?.data?.detail || e.message || "Failed to generate SQL");
    } finally {
      setGenerating(false);
    }
  };

  // AI query explainer call
  const triggerAiExplain = async () => {
    if (!activeTab.sql.trim()) return;
    setExplaining(true);
    setExplanation("");
    try {
      const res = await dataApi.aiExplain(activeTab.sql);
      setExplanation(res.explanation);
    } catch (e: any) {
      toast.error(e.message || "Failed to generate query explanation");
    } finally {
      setExplaining(false);
    }
  };

  // AI query debugger call
  const triggerAiDebug = async (errorMsg: string) => {
    if (!activeTab.sql.trim()) return;
    setDebugging(true);
    try {
      const res = await dataApi.aiDebug(activeTab.sql, errorMsg);
      updateSql(res.sql);
      toast.success("SQL Debugged & Repaired by AI!");
    } catch (e: any) {
      toast.error(e.message || "AI was unable to resolve this query error");
    } finally {
      setDebugging(false);
    }
  };

  // Generate lines count list
  const lines = activeTab.sql.split("\n");

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-300 font-sans border-b border-slate-700 relative select-none">
      {/* Tabs Row */}
      <div className="flex items-center justify-between bg-slate-900 border-b border-slate-800 text-[11px] px-1 flex-shrink-0">
        <div className="flex items-center gap-0.5 overflow-x-auto min-w-0 pr-4 py-1">
          {tabs.map(tab => (
            <div
              key={tab.id}
              onClick={() => setActiveTabId(tab.id)}
              className={`h-7 px-3 flex items-center gap-1.5 border-r border-slate-800 cursor-pointer rounded-t transition-colors ${
                activeTabId === tab.id 
                  ? "bg-slate-950 text-slate-100 font-bold border-t-2 border-t-cyan-400" 
                  : "text-slate-400 hover:bg-slate-850 hover:text-slate-200"
              }`}
            >
              <FileText className="h-3 w-3 text-slate-500 shrink-0" />
              <span className="truncate max-w-[80px]">{tab.title}</span>
              {tabs.length > 1 && (
                <button 
                  onClick={(e) => closeTab(tab.id, e)}
                  className="hover:text-red-500 p-0.5 rounded hover:bg-slate-800"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              )}
            </div>
          ))}
          <button 
            onClick={addTab}
            className="p-1 hover:bg-slate-800 text-slate-400 hover:text-white rounded ml-1"
            title="Open New SQL Sheet"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Panel controls */}
        <div className="flex items-center gap-1 px-2 shrink-0">
          <button
            onClick={() => { setShowSaved(!showSaved); setShowHistory(false); }}
            className={`px-2 py-0.5 rounded flex items-center gap-1 hover:text-white hover:bg-slate-800 ${showSaved ? "bg-slate-800 text-cyan-400" : "text-slate-400"}`}
          >
            <BookMarked className="h-3.5 w-3.5" />
            <span>Bookmarks</span>
          </button>
          <button
            onClick={() => { setShowHistory(!showHistory); setShowSaved(false); }}
            className={`px-2 py-0.5 rounded flex items-center gap-1 hover:text-white hover:bg-slate-800 ${showHistory ? "bg-slate-800 text-cyan-400" : "text-slate-400"}`}
          >
            <History className="h-3.5 w-3.5" />
            <span>History</span>
          </button>
        </div>
      </div>

      {/* Editor Toolbar */}
      <div className="p-2 bg-slate-950 border-b border-slate-850 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-1">
          {/* Connection Label */}
          <div className="flex items-center gap-1 text-[10px] text-slate-500 font-mono bg-slate-900 border border-slate-800 px-2 py-1 rounded select-none mr-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span>DB: postgres@localhost</span>
          </div>

          <button
            onClick={runActiveQuery}
            disabled={loading || !activeTab.sql.trim()}
            className="h-7 px-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded text-[11px] font-bold flex items-center gap-1 transition-colors"
            title="Execute Query (Ctrl+Enter)"
          >
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3 fill-white" />}
            <span>Run</span>
          </button>

          <button
            onClick={formatSql}
            className="h-7 px-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-[11px] flex items-center gap-1 transition-colors"
            title="Uppercase SQL keywords"
          >
            <span>Format SQL</span>
          </button>

          <button
            onClick={handleSaveQuery}
            className="h-7 px-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-[11px] flex items-center gap-1 transition-colors"
            title="Add SQL to bookmarks"
          >
            <span>Bookmark</span>
          </button>

          <div className="w-px h-5 bg-slate-800 mx-1" />

          {/* AI Helper Actions */}
          <button
            onClick={() => setShowAiGen(true)}
            className="h-7 px-2.5 bg-[#118d95] hover:bg-[#0e747b] text-white rounded text-[11px] font-bold flex items-center gap-1 transition-colors"
            title="Generate SQL using natural language prompt"
          >
            <Sparkles className="h-3 w-3" />
            <span>AI Generate</span>
          </button>

          <button
            onClick={triggerAiExplain}
            disabled={explaining || !activeTab.sql.trim()}
            className="h-7 px-2.5 bg-indigo-700 hover:bg-indigo-600 disabled:opacity-50 text-white rounded text-[11px] font-bold flex items-center gap-1 transition-colors"
            title="Explain SQL query in natural English"
          >
            {explaining ? <Loader2 className="h-3 w-3 animate-spin" /> : <WandSparkles className="h-3 w-3" />}
            <span>AI Explain</span>
          </button>

          {error && (
            <button
              onClick={() => triggerAiDebug(error)}
              disabled={debugging}
              className="h-7 px-2.5 bg-red-700 hover:bg-red-650 disabled:opacity-50 text-white rounded text-[11px] font-bold flex items-center gap-1 transition-colors animate-pulse"
              title="AI Debug/Fix query error"
            >
              {debugging ? <Loader2 className="h-3 w-3 animate-spin animate-infinite-scroll" /> : <AlertCircle className="h-3.5 w-3.5" />}
              <span>AI Debug & Fix</span>
            </button>
          )}
        </div>

        <div className="text-[10px] text-slate-500 font-mono">
          Ctrl+Enter to Execute
        </div>
      </div>

      {/* Editor Main Work Area */}
      <div className="flex-1 flex min-h-0 relative">
        {/* Line Numbers Column */}
        <div className="w-9 bg-slate-900 border-r border-slate-850 py-3 text-right pr-2 text-slate-600 font-mono select-none text-[12px] leading-[20px]">
          {lines.map((_, i) => (
            <div key={i}>{i + 1}</div>
          ))}
        </div>

        {/* Textarea Code Block with Syntax Highlighting Overlay */}
        <div className="flex-1 relative overflow-hidden bg-slate-950 font-mono text-[12.5px] leading-[22px]">
          {/* Scrollable Highlighted Pre Element */}
          <pre
            ref={highlightRef}
            className="absolute inset-0 w-full h-full bg-slate-950 font-mono text-[12.5px] leading-[22px] p-3 overflow-auto whitespace-pre select-none pointer-events-none text-slate-200 border-none outline-none focus:ring-0 focus:border-transparent"
            dangerouslySetInnerHTML={{ __html: highlightedCode }}
          />

          {/* Main transparent Textarea */}
          <textarea
            ref={textareaRef}
            value={activeTab.sql}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onScroll={handleScroll}
            style={{
              color: "transparent",
              WebkitTextFillColor: "transparent",
              caretColor: "white",
            }}
            className="absolute inset-0 w-full h-full bg-transparent text-transparent caret-white outline-none p-3 font-mono text-[12.5px] leading-[22px] resize-none overflow-auto whitespace-pre select-text border-none focus:ring-0 focus:border-transparent"
            placeholder="SELECT * FROM table_name LIMIT 100;"
            autoFocus
          />

          {/* Floating Suggestion Menu */}
          {showSuggestions && suggestions.length > 0 && (
            <div 
              className="absolute bg-slate-900 border border-slate-700 rounded shadow-2xl z-40 max-w-xs overflow-hidden font-mono text-[11px] w-64"
              style={{
                top: `${suggestionPos.top}px`,
                left: `${suggestionPos.left}px`
              }}
            >
              <div className="bg-slate-950 p-1 px-2 border-b border-slate-800 text-slate-500 text-[9px] uppercase font-bold flex justify-between items-center">
                <span>SQL Suggestions</span>
                <span>Enter/Tab</span>
              </div>
              <div className="max-h-40 overflow-y-auto">
                {suggestions.map((item, idx) => (
                  <div
                    key={item}
                    onClick={() => insertSuggestion(item)}
                    className={`p-1.5 px-3 cursor-pointer flex justify-between items-center transition-colors ${
                      idx === activeSuggestionIdx ? "bg-cyan-500 text-black font-bold" : "hover:bg-slate-800 text-slate-300"
                    }`}
                  >
                    <span>{item}</span>
                    <span className="text-[9px] opacity-60">
                      {SQL_KEYWORDS.includes(item) ? "Keyword" : tables.some(t => t.sanitized_name === item) ? "Table" : "Field"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Floating Side Drawer: Saved Queries / Bookmarks */}
      {showSaved && (
        <div className="absolute right-0 top-0 bottom-0 w-80 bg-slate-900 border-l border-slate-700 z-30 shadow-2xl flex flex-col">
          <div className="p-3 border-b border-slate-700 bg-slate-950 flex items-center justify-between">
            <span className="font-bold text-slate-200 flex items-center gap-1.5">
              <BookMarked className="h-3.5 w-3.5 text-cyan-400" />
              SAVED QUERY BOOKMARKS
            </span>
            <button onClick={() => setShowSaved(false)} className="text-slate-400 hover:text-white p-1 rounded hover:bg-slate-800">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-2.5 space-y-1.5">
            {savedQueries.map(q => (
              <div
                key={q.id}
                onClick={() => { updateSql(q.sql); setShowSaved(false); }}
                className="p-2 border border-slate-800 bg-slate-950 rounded hover:border-cyan-500 cursor-pointer group flex flex-col gap-1 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-300 text-[11px] truncate w-56">{q.title}</span>
                  <button 
                    onClick={(e) => deleteSavedQuery(q.id, e)}
                    className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-slate-800 text-slate-400 hover:text-red-500 rounded transition-opacity"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
                <code className="text-[10px] text-slate-500 font-mono block truncate">{q.sql}</code>
              </div>
            ))}
            {savedQueries.length === 0 && (
              <div className="text-center text-slate-500 text-xs py-10">No queries bookmarked yet. Click "Bookmark" above.</div>
            )}
          </div>
        </div>
      )}

      {/* Floating Side Drawer: Execution History */}
      {showHistory && (
        <div className="absolute right-0 top-0 bottom-0 w-80 bg-slate-900 border-l border-slate-700 z-30 shadow-2xl flex flex-col">
          <div className="p-3 border-b border-slate-700 bg-slate-950 flex items-center justify-between">
            <span className="font-bold text-slate-200 flex items-center gap-1.5">
              <History className="h-3.5 w-3.5 text-cyan-400" />
              QUERY EXECUTION HISTORY
            </span>
            <button onClick={() => setShowHistory(false)} className="text-slate-400 hover:text-white p-1 rounded hover:bg-slate-800">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-2.5 space-y-1.5">
            {history.map(item => (
              <div
                key={item.id}
                onClick={() => { updateSql(item.sql); setShowHistory(false); }}
                className="p-2 border border-slate-800 bg-slate-950 rounded hover:border-cyan-500 cursor-pointer flex flex-col gap-1 transition-colors"
              >
                <div className="flex justify-between text-[9px] text-slate-500">
                  <span>{item.timestamp}</span>
                  <span className="font-mono">{item.durationMs}ms</span>
                </div>
                <code className="text-[10px] text-slate-300 font-mono block truncate">{item.sql}</code>
              </div>
            ))}
            {history.length === 0 && (
              <div className="text-center text-slate-500 text-xs py-10">No execution records found.</div>
            )}
          </div>
        </div>
      )}

      {/* AI Generate Prompt Popup Modal */}
      {showAiGen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-lg shadow-2xl flex flex-col">
            <div className="p-4 border-b border-slate-700 bg-slate-950 rounded-t-xl flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-200 flex items-center gap-1.5">
                <Sparkles className="h-4 w-4 text-cyan-400" />
                AI-Powered SQL Generator
              </h3>
              <button onClick={() => setShowAiGen(false)} className="text-slate-400 hover:text-white p-1 rounded hover:bg-slate-800">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <span className="text-[11px] text-slate-400 leading-normal">
                Describe the query you want in plain English. The AI will inspect your active virtual schemas and build an optimized read-only PostgreSQL SELECT statement.
              </span>
              <textarea
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder="e.g. Show me the top 10 products by total helpful feedback count..."
                rows={3}
                className="w-full bg-slate-950 border border-slate-700 text-slate-200 p-2.5 rounded-lg text-xs outline-none focus:border-cyan-500"
              />
            </div>
            <div className="p-3 border-t border-slate-700 bg-slate-950 rounded-b-xl flex justify-end gap-2">
              <button 
                onClick={() => setShowAiGen(false)}
                className="px-3 py-1.5 bg-slate-800 text-slate-300 hover:text-white rounded text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={triggerAiGen}
                disabled={generating || !aiPrompt.trim()}
                className="px-4 py-1.5 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white rounded text-xs font-bold flex items-center gap-1"
              >
                {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                Generate SQL
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI Explanation Pane (Fixed overlay overlay at the bottom if active) */}
      {explanation && (
        <div className="absolute left-4 right-4 bottom-4 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-4 z-20 max-h-48 overflow-y-auto flex flex-col">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-2 flex-shrink-0">
            <span className="font-bold text-slate-200 text-[11px] flex items-center gap-1.5">
              <WandSparkles className="h-3.5 w-3.5 text-cyan-400" />
              AI QUERY EXPLANATION
            </span>
            <button onClick={() => setExplanation("")} className="text-slate-400 hover:text-white p-0.5 rounded hover:bg-slate-800">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="flex-1 text-[11px] text-slate-300 font-sans leading-relaxed whitespace-pre-wrap">
            {explanation}
          </div>
        </div>
      )}
    </div>
  );
}
