"use client";
import { useState } from "react";

interface Props {
  onApply: (from: string, to: string) => void;
  onClear: () => void;
}

const PRESETS = [
  { label: "Last 7d", days: 7 },
  { label: "Last 30d", days: 30 },
  { label: "Last 90d", days: 90 },
  { label: "This year", days: 365 },
];

function toISO(d: Date) {
  return d.toISOString().split("T")[0];
}

export function DateRangeFilter({ onApply, onClear }: Props) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  function applyPreset(days: number) {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - days);
    const f = toISO(start);
    const t = toISO(end);
    setFrom(f);
    setTo(t);
    onApply(f, t);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {PRESETS.map((p) => (
        <button
          key={p.days}
          onClick={() => applyPreset(p.days)}
          className="px-2 py-1 text-xs rounded bg-muted hover:bg-muted/80 text-muted-foreground transition-colors"
        >
          {p.label}
        </button>
      ))}
      <input
        type="date"
        value={from}
        onChange={(e) => setFrom(e.target.value)}
        className="text-xs bg-background border border-border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary/50"
      />
      <span className="text-xs text-muted-foreground">—</span>
      <input
        type="date"
        value={to}
        onChange={(e) => setTo(e.target.value)}
        className="text-xs bg-background border border-border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary/50"
      />
      <button
        onClick={() => from && to && onApply(from, to)}
        disabled={!from || !to}
        className="px-2 py-1 text-xs rounded bg-primary text-primary-foreground disabled:opacity-50 hover:bg-primary/90 transition-colors"
      >
        Apply
      </button>
      <button
        onClick={() => { setFrom(""); setTo(""); onClear(); }}
        className="px-2 py-1 text-xs rounded bg-muted text-muted-foreground hover:bg-muted/80 transition-colors"
      >
        Clear
      </button>
    </div>
  );
}
