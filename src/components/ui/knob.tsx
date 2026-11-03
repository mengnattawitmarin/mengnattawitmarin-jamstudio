import { useRef, type KeyboardEvent, type PointerEvent } from "react";

/**
 * Rotary knob: drag up/down (or left/right), mouse wheel, or arrow keys.
 * Sweep is 270° like a real pot. Accessible as an ARIA slider.
 */
export function Knob({
  value,
  min = 0,
  max = 1,
  step,
  label,
  display,
  size = 44,
  variant = "black",
  onChange,
}: {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  label: string;
  display?: string;
  size?: number;
  variant?: "black" | "gold" | "chrome";
  onChange: (value: number) => void;
}) {
  const drag = useRef<{ y: number; x: number; start: number } | null>(null);
  const span = max - min;
  const ratio = span === 0 ? 0 : (value - min) / span;
  const angle = -135 + ratio * 270;
  const fine = step ?? span / 100;

  const clampSnap = (next: number) => {
    const snapped = step ? Math.round((next - min) / step) * step + min : next;
    return Math.min(max, Math.max(min, snapped));
  };

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
    drag.current = { y: event.clientY, x: event.clientX, start: value };
  }
  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const state = drag.current;
    if (!state) return;
    const delta = (state.y - event.clientY + (event.clientX - state.x)) / 160;
    onChange(clampSnap(state.start + delta * span));
  }
  function onPointerUp() {
    drag.current = null;
  }
  function onKey(event: KeyboardEvent<HTMLDivElement>) {
    const big = event.shiftKey ? 10 : 1;
    if (event.key === "ArrowUp" || event.key === "ArrowRight") onChange(clampSnap(value + fine * big));
    else if (event.key === "ArrowDown" || event.key === "ArrowLeft") onChange(clampSnap(value - fine * big));
    else if (event.key === "Home") onChange(min);
    else if (event.key === "End") onChange(max);
    else return;
    event.preventDefault();
  }

  const capClass = variant === "gold" ? "knob-cap gold" : "knob-cap";
  const tick = variant === "gold" ? "#3a2a08" : "#f4f4f4";

  return (
    <div className="flex select-none flex-col items-center gap-1">
      <div
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={Number(value.toFixed(3))}
        aria-valuetext={display}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKey}
        onWheel={(event) => onChange(clampSnap(value - Math.sign(event.deltaY) * fine * 2))}
        onDoubleClick={() => onChange(clampSnap(min + span / 2))}
        className="relative touch-none rounded-full"
        style={{ width: size, height: size }}
      >
        <svg viewBox="0 0 48 48" className="absolute inset-0" aria-hidden="true">
          <circle cx="24" cy="24" r="22" fill="none" stroke="rgb(255 255 255 / 0.08)" strokeWidth="2" />
          <path
            d={arcPath(24, 24, 22, -135, angle)}
            fill="none"
            stroke="var(--color-brass)"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
        <div className={`absolute inset-[5px] rounded-full ${capClass}`} style={{ transform: `rotate(${angle}deg)` }}>
          <span className="absolute left-1/2 top-[3px] h-[35%] w-[2.5px] -translate-x-1/2 rounded-full" style={{ background: tick }} />
        </div>
      </div>
      <span className="max-w-20 truncate text-center text-[11px] font-medium leading-tight text-muted">{label}</span>
      {display != null ? <span className="text-[11px] tabular-nums leading-none text-fg">{display}</span> : null}
    </div>
  );
}

function arcPath(cx: number, cy: number, r: number, from: number, to: number): string {
  if (to <= from + 0.5) return "";
  const rad = (deg: number) => ((deg - 90) * Math.PI) / 180;
  const x1 = cx + r * Math.cos(rad(from));
  const y1 = cy + r * Math.sin(rad(from));
  const x2 = cx + r * Math.cos(rad(to));
  const y2 = cy + r * Math.sin(rad(to));
  const large = to - from > 180 ? 1 : 0;
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}
