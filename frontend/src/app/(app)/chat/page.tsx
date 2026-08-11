"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Paperclip, Send, Sparkles, LayoutDashboard } from "lucide-react";
import toast from "react-hot-toast";
import { AnalysisResponseCard } from "@/components/analysis/AnalysisResponseCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { chatApi, datasetsApi } from "@/lib/api";
import { cn, timeAgo } from "@/lib/utils";
import { AgentResponse, Message } from "@/types";

const SUGGESTED_PROMPTS = [
  "How many rows and columns are in this dataset?",
  "Summarize the most important numeric fields",
  "Which categories have the highest totals?",
  "Find missing values and data quality issues",
  "Create charts from this uploaded data",
  "Generate a dashboard from this dataset",
];

const COMMANDS = [
  { name: "/dashboard", desc: "Generate a visual dashboard", action: "Generate a dashboard from this dataset" },
  { name: "/forecast", desc: "Predict future metric trends", action: "Forecast the primary metric for the next 30 days" },
  { name: "/anomalies", desc: "Find abnormal data spikes", action: "Detect anomaly patterns and spikes in numeric columns" },
  { name: "/segments", desc: "Cluster data into segments", action: "Segment and cluster this dataset rows using KMeans" },
  { name: "/clean", desc: "Profile data quality issues", action: "Find missing values and data quality issues" },
];

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [uploadingDataset, setUploadingDataset] = useState(false);
  const [uploadedDataset, setUploadedDataset] = useState<{ id: string; name: string; table_name: string } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async (text?: string) => {
    const query = text ?? input.trim();
    if (!query || isLoading) return;

    let displayQuery = query;
    let backendQuery = query;

    if (query.startsWith("/")) {
      const lower = query.toLowerCase();
      if (lower.startsWith("/dashboard")) {
        displayQuery = "Generate dashboard from dataset";
        backendQuery = "Generate a dashboard from this dataset";
      } else if (lower.startsWith("/forecast")) {
        displayQuery = "Forecast future metric values";
        backendQuery = "Forecast the primary metric for the next 30 days";
      } else if (lower.startsWith("/anomalies") || lower.startsWith("/anomaly")) {
        displayQuery = "Detect anomalies in numeric metrics";
        backendQuery = "Detect anomaly patterns and spikes in numeric columns";
      } else if (lower.startsWith("/segments") || lower.startsWith("/cluster")) {
        displayQuery = "Cluster dataset rows (K-Means)";
        backendQuery = "Segment and cluster this dataset rows using KMeans";
      } else if (lower.startsWith("/clean")) {
        displayQuery = "Scan dataset quality and clean it";
        backendQuery = "Find missing values and data quality issues";
      }
    }

    setInput("");
    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role: "user", content: displayQuery, created_at: new Date().toISOString() },
    ]);
    setIsLoading(true);

    try {
      const result = await chatApi.send(
        backendQuery,
        conversationId,
        uploadedDataset ? { dataset_id: uploadedDataset.id, dataset_name: uploadedDataset.name } : undefined
      );
      if (!conversationId) setConversationId(result.conversation_id);

      setMessages((prev) => [
        ...prev,
        {
          id: result.message_id,
          role: "assistant",
          content: result.response?.executive_summary ?? "",
          agent_used: "analysis",
          structured_response: result.response as AgentResponse,
          created_at: new Date().toISOString(),
        },
      ]);
    } catch (err: unknown) {
      const error = err as { response?: { data?: { detail?: string } }; message?: string };
      toast.error(error.response?.data?.detail || error.message || "Failed to analyze data");
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  };

  const uploadDataset = async (file?: File) => {
    if (!file || uploadingDataset) return;
    setUploadingDataset(true);
    try {
      const dataset = await datasetsApi.upload(file);
      setUploadedDataset({ id: dataset.id, name: dataset.name, table_name: dataset.table_name });
      toast.success(`Uploaded ${dataset.name}`);
      setInput(`Analyze the uploaded dataset "${dataset.name}"`);
    } catch (err: unknown) {
      const error = err as { response?: { data?: { detail?: string } }; message?: string };
      toast.error(error.response?.data?.detail || error.message || "Upload failed");
    } finally {
      setUploadingDataset(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
      inputRef.current?.focus();
    }
  };

  return (
    <div className="flex h-full max-h-[calc(100vh-4rem)] flex-col">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2">
        <Sparkles className="h-4 w-4 text-primary" />
        <span className="text-xs font-medium text-muted-foreground">Data analysis chat</span>
      </div>

      <div className="flex-1 space-y-6 overflow-y-auto px-4 py-6">
        {messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
              <Sparkles className="h-8 w-8 text-primary" />
            </div>
            <h2 className="mb-2 text-xl font-semibold">Ask Chai Analysis Application anything</h2>
            <p className="mb-6 max-w-sm text-sm text-muted-foreground">
              Upload CSV or Excel data, then ask for counts, summaries, insights, calculations, charts, or a complete dashboard.
            </p>
            <div className="grid w-full max-w-lg grid-cols-1 gap-2 sm:grid-cols-2">
              {SUGGESTED_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => sendMessage(prompt)}
                  className="rounded-lg border border-border px-3 py-2 text-left text-xs transition-colors hover:border-primary/30 hover:bg-accent"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={cn("flex gap-3", msg.role === "user" ? "justify-end" : "justify-start")}>
            {msg.role === "assistant" && (
              <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
                AI
              </div>
            )}
            <div className={cn("max-w-[80%]", msg.role === "user" ? "order-first" : "")}>
              {msg.role === "user" ? (
                <div className="rounded-2xl rounded-tr-sm bg-primary px-4 py-3 text-sm text-primary-foreground">
                  {msg.content}
                </div>
              ) : msg.structured_response ? (
                <AnalysisResponseCard response={msg.structured_response} agentName="analysis" datasetTable={uploadedDataset?.table_name} />
              ) : (
                <div className="rounded-2xl rounded-tl-sm bg-muted px-4 py-3 text-sm">{msg.content}</div>
              )}
              <p className="mt-1 px-1 text-xs text-muted-foreground">{timeAgo(msg.created_at)}</p>
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
              AI
            </div>
            <div className="rounded-2xl rounded-tl-sm bg-muted px-4 py-3">
              <div className="flex h-5 items-center gap-1">
                <div className="typing-dot h-2 w-2 rounded-full bg-muted-foreground/60" />
                <div className="typing-dot h-2 w-2 rounded-full bg-muted-foreground/60" />
                <div className="typing-dot h-2 w-2 rounded-full bg-muted-foreground/60" />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="border-t border-border px-4 py-4 relative">
        {/* Floating Command Dropdown */}
        {input.startsWith("/") && !input.includes(" ") && (
          <div className="absolute bottom-20 left-4 z-50 w-72 rounded-xl border border-border bg-popover p-1 shadow-lg animate-in slide-in-from-bottom-2 fade-in">
            <div className="px-2.5 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              Quick Commands
            </div>
            <div className="space-y-0.5">
              {COMMANDS.filter(c => c.name.startsWith(input.toLowerCase())).map((cmd) => (
                <button
                  key={cmd.name}
                  type="button"
                  className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-xs hover:bg-accent hover:text-accent-foreground"
                  onClick={() => {
                    setInput("");
                    sendMessage(cmd.action);
                  }}
                >
                  <span className="font-mono font-semibold text-primary">{cmd.name}</span>
                  <span className="text-muted-foreground text-[10px]">{cmd.desc}</span>
                </button>
              ))}
              {COMMANDS.filter(c => c.name.startsWith(input.toLowerCase())).length === 0 && (
                <div className="px-2.5 py-2 text-xs text-muted-foreground">
                  No matching commands found
                </div>
              )}
            </div>
          </div>
        )}

        {uploadedDataset && (
          <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
            <Paperclip className="h-3 w-3" />
            <span className="truncate">Attached dataset: {uploadedDataset.name}</span>
            <button type="button" onClick={() => setUploadedDataset(null)} className="text-primary hover:underline">
              Remove
            </button>
          </div>
        )}
        <div className="flex items-end gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            onChange={(event) => uploadDataset(event.target.files?.[0])}
          />
          <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0" disabled={uploadingDataset} onClick={() => fileInputRef.current?.click()}>
            {uploadingDataset ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
          </Button>

          {uploadedDataset && (
            <Button
              variant="outline"
              size="icon"
              className="h-10 w-10 shrink-0 text-primary border-primary/20 hover:bg-primary/5 hover:text-primary"
              onClick={() => sendMessage("Generate a dashboard from this dataset")}
              disabled={isLoading}
              title="Generate Dashboard"
            >
              <LayoutDashboard className="h-4 w-4" />
            </Button>
          )}

          <Input
            ref={inputRef}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                sendMessage();
              }
            }}
            placeholder="Ask about your uploaded data, or type / for commands..."
            disabled={isLoading}
            className="min-h-10 flex-1"
          />
          <Button onClick={() => sendMessage()} disabled={!input.trim() || isLoading} className="h-10 w-10 shrink-0" size="icon">
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
        <p className="mt-2 text-center text-xs text-muted-foreground">
          Chai Analysis Application computes dataset results locally and uses AI to explain them clearly.
        </p>
      </div>
    </div>
  );
}
