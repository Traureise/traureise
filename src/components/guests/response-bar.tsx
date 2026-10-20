import { cn } from "@/lib/utils";

type Part = { key: "coming" | "notComing" | "open"; label: string; value: number };

/**
 * Where the answers stand, by person: one bar whose parts are as wide as their share. Open answers are
 * hatched, so the bar reads as filling up as guests reply. The numbers beside it are the exact counts.
 */
export function ResponseBar({ parts, label }: { parts: Part[]; label: string }) {
  const total = parts.reduce((sum, p) => sum + p.value, 0);
  return (
    <div className="space-y-4">
      <dl className="flex flex-wrap items-end gap-x-10 gap-y-3">
        {parts.map((p) => (
          <div key={p.key} className="flex flex-row-reverse items-baseline justify-end gap-2">
            <dt className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <span className={cn("size-2.5 rounded-full", SWATCH[p.key])} aria-hidden />
              {p.label}
            </dt>
            <dd className={cn("font-heading text-5xl leading-none font-medium tabular-nums", p.key === "coming" ? "text-primary" : "text-foreground/70")} data-testid={`count-${p.key}`}>
              {p.value}
            </dd>
          </div>
        ))}
      </dl>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted" role="img" aria-label={label}>
        {total > 0 &&
          parts
            .filter((p) => p.value > 0)
            .map((p) => <span key={p.key} className={cn("h-full", SEGMENT[p.key])} style={{ width: `${(p.value / total) * 100}%` }} />)}
      </div>
    </div>
  );
}

const SWATCH = { coming: "bg-primary", notComing: "bg-primary/35", open: "border border-primary/40 bg-[repeating-linear-gradient(135deg,var(--color-primary)_0_1px,transparent_1px_4px)] opacity-60" };
const SEGMENT = {
  coming: "bg-primary",
  notComing: "bg-primary/35",
  open: "bg-[repeating-linear-gradient(135deg,color-mix(in_srgb,var(--color-primary)_30%,transparent)_0_2px,transparent_2px_7px)]",
};
