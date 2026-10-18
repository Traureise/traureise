/** A pie (donut) chart as inline SVG: no chart library, no requests. Slices start at 12 o'clock. */
export function PieChart({ slices, label }: { slices: { value: number; color: string; label: string }[]; label: string }) {
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  const r = 15.9155; // circumference 100, so dash lengths are percentages
  let offset = 25;
  return (
    <svg viewBox="0 0 42 42" className="size-40 shrink-0" role="img" aria-label={label}>
      <circle cx="21" cy="21" r={r} fill="none" stroke="var(--color-border)" strokeWidth="7" />
      {total > 0 &&
        slices
          .filter((s) => s.value > 0)
          .map((s) => {
            const share = (s.value / total) * 100;
            const circle = (
              <circle key={s.label} cx="21" cy="21" r={r} fill="none" stroke={s.color} strokeWidth="7" strokeDasharray={`${share} ${100 - share}`} strokeDashoffset={offset}>
                <title>{s.label}</title>
              </circle>
            );
            offset -= share;
            return circle;
          })}
    </svg>
  );
}
