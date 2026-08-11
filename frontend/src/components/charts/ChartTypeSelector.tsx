"use client";

const TYPES = [
  { value: "bar", label: "Bar" },
  { value: "line", label: "Line" },
  { value: "area", label: "Area" },
  { value: "pie", label: "Pie" },
  { value: "table", label: "Table" },
] as const;

type ChartType = typeof TYPES[number]["value"];

interface Props {
  value: ChartType;
  onChange: (v: ChartType) => void;
}

export function ChartTypeSelector({ value, onChange }: Props) {
  return (
    <div className="flex gap-1 flex-wrap">
      {TYPES.map((t) => (
        <button
          key={t.value}
          onClick={() => onChange(t.value)}
          className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
            value === t.value
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:bg-muted/80"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
