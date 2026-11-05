import type { AvatarLook } from "@/lib/avatars";

/**
 * Character drawn in a 120×200 box (feet at y≈190). Use inside an <svg>,
 * positioned with a transform, or standalone via <AvatarSvg>.
 */
export function AvatarFigure({ look, bounce = false }: { look: AvatarLook; bounce?: boolean }) {
  return (
    <g className={bounce ? "avatar-bounce" : undefined}>
      <ellipse cx="60" cy="193" rx="36" ry="7" fill="rgba(0,0,0,0.55)" />
      <rect x="44" y="130" width="13" height="52" rx="5" fill={look.pants} stroke="#000" strokeWidth="2" />
      <rect x="63" y="130" width="13" height="52" rx="5" fill={look.pants} stroke="#000" strokeWidth="2" />
      <rect x="39" y="178" width="20" height="10" rx="4" fill="#111" />
      <rect x="61" y="178" width="20" height="10" rx="4" fill="#111" />
      <rect x="26" y="84" width="12" height="44" rx="6" fill={look.shirt} stroke="#000" strokeWidth="2" />
      <rect x="82" y="84" width="12" height="44" rx="6" fill={look.shirt} stroke="#000" strokeWidth="2" />
      <rect x="35" y="78" width="50" height="60" rx="14" fill={look.shirt} stroke="#000" strokeWidth="2.5" />
      <path d="M48 96 L60 112 L72 96" fill="none" stroke="#000" strokeWidth="2" opacity="0.45" />
      <rect x="54" y="70" width="12" height="12" fill={look.skin} />
      <circle cx="60" cy="52" r="24" fill={look.skin} stroke="#000" strokeWidth="2.5" />
      <path
        d="M34 52 C32 26 50 16 62 19 C78 17 92 30 86 54 L80 41 L74 49 L68 36 L60 47 L52 34 L46 47 L40 38 Z"
        fill={look.hair}
        stroke="#000"
        strokeWidth="2"
      />
      <circle cx="52" cy="55" r="3" fill="#111" />
      <circle cx="68" cy="55" r="3" fill="#111" />
      <path d="M53 64 Q60 70 67 64" fill="none" stroke="#111" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="32" cy="128" r="6" fill={look.skin} stroke="#000" strokeWidth="1.5" />
      <circle cx="88" cy="128" r="6" fill={look.skin} stroke="#000" strokeWidth="1.5" />
      {look.inst === "guitar" ? (
        <g>
          <rect x="66" y="98" width="46" height="7" rx="2" fill="#6b4422" stroke="#000" strokeWidth="2" transform="rotate(-28 66 101)" />
          <path d="M52 112 C36 108 26 120 32 132 C36 141 48 143 56 136 C63 143 76 141 78 132 C80 122 70 114 62 116 Z" fill={look.gear} stroke="#000" strokeWidth="2.5" />
          <circle cx="54" cy="128" r="5" fill="#111" />
        </g>
      ) : null}
      {look.inst === "bass" ? (
        <g>
          <rect x="62" y="92" width="62" height="7" rx="2" fill="#3b2614" stroke="#000" strokeWidth="2" transform="rotate(-32 62 95)" />
          <path d="M50 112 C32 108 24 122 30 134 C35 143 48 145 56 138 C64 144 78 142 80 132 C82 121 70 113 60 116 Z" fill={look.gear} stroke="#000" strokeWidth="2.5" />
          <rect x="44" y="124" width="16" height="4" rx="1" fill="#111" />
        </g>
      ) : null}
      {look.inst === "mic" ? (
        <g>
          <line x1="100" y1="64" x2="100" y2="190" stroke="#c9ced6" strokeWidth="3" />
          <line x1="100" y1="64" x2="82" y2="62" stroke="#c9ced6" strokeWidth="3" />
          <rect x="74" y="54" width="11" height="17" rx="5.5" fill="#e5e7eb" stroke="#000" strokeWidth="2" />
        </g>
      ) : null}
      {look.inst === "sticks" ? (
        <g>
          <line x1="30" y1="128" x2="14" y2="96" stroke="#f1d9a8" strokeWidth="4" strokeLinecap="round" />
          <line x1="90" y1="128" x2="106" y2="96" stroke="#f1d9a8" strokeWidth="4" strokeLinecap="round" />
        </g>
      ) : null}
    </g>
  );
}

export function AvatarSvg({ look, width, label }: { look: AvatarLook; width: number; label?: string }) {
  return (
    <svg viewBox="0 0 120 200" width={width} height={Math.round((width * 200) / 120)} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <AvatarFigure look={look} />
    </svg>
  );
}

/** Head-and-shoulders badge for lists and chips. */
export function AvatarHead({ look, size = 40 }: { look: AvatarLook; size?: number }) {
  return (
    <svg viewBox="22 14 76 76" width={size} height={size} aria-hidden="true">
      <rect x="35" y="78" width="50" height="40" rx="14" fill={look.shirt} stroke="#000" strokeWidth="3" />
      <circle cx="60" cy="52" r="24" fill={look.skin} stroke="#000" strokeWidth="3" />
      <path d="M34 52 C32 26 50 16 62 19 C78 17 92 30 86 54 L80 41 L74 49 L68 36 L60 47 L52 34 L46 47 L40 38 Z" fill={look.hair} stroke="#000" strokeWidth="2.5" />
      <circle cx="52" cy="55" r="3" fill="#111" />
      <circle cx="68" cy="55" r="3" fill="#111" />
    </svg>
  );
}
