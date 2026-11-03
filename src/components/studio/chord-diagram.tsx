import { guitarShape } from "@/lib/audio/chord-shapes";

/** Small SVG chord box: 6 strings, 5 frets, dots, open/muted markers, base fret. */
export function ChordDiagram({ root, suffix, label, active = false }: { root: number; suffix: string; label: string; active?: boolean }) {
  const shape = guitarShape(root, suffix);
  if (!shape) {
    return (
      <figure className="flex w-[84px] shrink-0 flex-col items-center">
        <div className="grid h-[104px] w-full place-items-center rounded-md bg-surface-2 text-sm text-muted">N.C.</div>
        <figcaption className="mt-1 text-sm font-semibold">{label}</figcaption>
      </figure>
    );
  }
  const fretted = shape.frets.filter((f) => f > 0);
  const min = fretted.length ? Math.min(...fretted) : 1;
  const max = fretted.length ? Math.max(...fretted) : 1;
  const start = max <= 4 ? 1 : min;
  const x = (s: number) => 12 + s * 12;
  const y = (f: number) => 18 + (f - start + 0.5) * 16;
  const stroke = active ? "var(--color-brass)" : "var(--color-muted)";
  return (
    <figure className="flex w-[84px] shrink-0 flex-col items-center">
      <svg viewBox="0 0 84 104" className="h-[104px] w-[84px]" role="img" aria-label={`คอร์ด ${label}`}>
        {start === 1 ? <rect x={12} y={15} width={60} height={3} fill={stroke} /> : <text x={2} y={30} fontSize="9" fill="var(--color-muted)">{start}</text>}
        {Array.from({ length: 6 }, (_, f) => (
          <line key={`f${f}`} x1={12} x2={72} y1={18 + f * 16} y2={18 + f * 16} stroke={stroke} strokeWidth="0.8" />
        ))}
        {Array.from({ length: 6 }, (_, s) => (
          <line key={`s${s}`} x1={x(s)} x2={x(s)} y1={18} y2={98} stroke={stroke} strokeWidth="0.8" />
        ))}
        {shape.barre != null && shape.barre >= start ? (
          <rect x={x(0) - 4} y={y(shape.barre) - 4} width={x(5) - x(0) + 8} height={8} rx={4} fill="var(--color-fg)" opacity="0.85" />
        ) : null}
        {shape.frets.map((f, s) =>
          f < 0 ? (
            <text key={s} x={x(s)} y={11} fontSize="9" textAnchor="middle" fill="var(--color-muted)">
              ×
            </text>
          ) : f === 0 ? (
            <circle key={s} cx={x(s)} cy={8} r={3} fill="none" stroke="var(--color-muted)" />
          ) : (
            <circle key={s} cx={x(s)} cy={y(f)} r={4.5} fill={active ? "var(--color-brass)" : "var(--color-fg)"} />
          ),
        )}
      </svg>
      <figcaption className={`text-sm font-semibold ${active ? "text-brass" : ""}`}>{label}</figcaption>
    </figure>
  );
}
