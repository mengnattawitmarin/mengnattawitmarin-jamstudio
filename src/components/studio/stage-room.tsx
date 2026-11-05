import { useEffect, useRef, useState } from "react";
import { Camera, Box, UserRound } from "lucide-react";
import { AvatarFigure } from "@/components/studio/avatar-figure";
import type { AvatarLook } from "@/lib/avatars";

export type StageMember = {
  id: string;
  name: string;
  look: AvatarLook;
  /** 0..1 activity (mic level / notes). */
  level: number;
  me?: boolean;
  /** Latest chat line, shown as a speech bubble. */
  bubble?: string;
};

type Slot = { x: number; feet: number; scale: number };

// Scene is a 390×560 stage. Drummer stands on the riser; others fill the floor.
const ROOM_DRUM: Slot = { x: 195, feet: 392, scale: 0.5 };
const ROOM_FLOOR: Slot[] = [
  { x: 92, feet: 540, scale: 0.84 },
  { x: 205, feet: 552, scale: 0.92 },
  { x: 305, feet: 538, scale: 0.8 },
  { x: 140, feet: 492, scale: 0.66 },
  { x: 262, feet: 492, scale: 0.66 },
  { x: 60, feet: 470, scale: 0.6 },
];
const AR_DRUM: Slot = { x: 195, feet: 430, scale: 0.5 };
const AR_FLOOR: Slot[] = [
  { x: 120, feet: 486, scale: 0.62 },
  { x: 200, feet: 500, scale: 0.68 },
  { x: 278, feet: 486, scale: 0.6 },
  { x: 160, feet: 450, scale: 0.5 },
  { x: 245, feet: 450, scale: 0.5 },
  { x: 90, feet: 440, scale: 0.46 },
];

/** Place members: one drummer on the riser, everyone else on floor slots (me first). */
export function placeMembers(members: StageMember[], ar: boolean): { member: StageMember; slot: Slot }[] {
  const drum = ar ? AR_DRUM : ROOM_DRUM;
  const floor = ar ? AR_FLOOR : ROOM_FLOOR;
  const sorted = [...members].sort((a, b) => Number(!!b.me) - Number(!!a.me));
  const drummer = sorted.find((m) => m.look.inst === "sticks");
  const out: { member: StageMember; slot: Slot }[] = [];
  let i = 0;
  for (const member of sorted) {
    if (member === drummer) out.push({ member, slot: drum });
    else if (i < floor.length) out.push({ member, slot: floor[i++] });
  }
  // Back-to-front so nearer characters overlap farther ones.
  return out.sort((a, b) => a.slot.feet - b.slot.feet);
}

export function StageRoom({ members, onEditAvatar }: { members: StageMember[]; onEditAvatar?: () => void }) {
  const [mode, setMode] = useState<"3d" | "ar">("3d");
  const [camError, setCamError] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (mode !== "ar") return;
    let stream: MediaStream | null = null;
    let cancelled = false;
    setCamError("");
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false })
      .then((s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          void videoRef.current.play().catch(() => undefined);
        }
      })
      .catch(() => setCamError("เปิดกล้องไม่ได้ — อนุญาตการใช้กล้องแล้วลองใหม่ (แสดงพื้นจำลองแทน)"));
    if (!navigator.mediaDevices) setCamError("อุปกรณ์นี้ไม่รองรับกล้อง — แสดงพื้นจำลองแทน");
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [mode]);

  const ar = mode === "ar";
  const placed = placeMembers(members, ar);

  return (
    <section className="panel overflow-hidden p-0">
      <div className="flex flex-wrap items-center gap-2 border-b-2 border-line px-3 py-2">
        <h2 className="title-rock text-2xl">ห้องซ้อม {ar ? "AR" : "3D"}</h2>
        <div className="ml-auto flex rounded-lg border-2 border-line bg-surface-2 p-0.5" role="tablist" aria-label="มุมมองห้องซ้อม">
          <button
            type="button"
            role="tab"
            aria-selected={!ar}
            onClick={() => setMode("3d")}
            className={`inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-sm font-semibold ${!ar ? "bg-fg text-bg" : "text-muted"}`}
          >
            <Box className="size-4" aria-hidden="true" />
            3D
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={ar}
            onClick={() => setMode("ar")}
            className={`inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-sm font-semibold ${ar ? "bg-fg text-bg" : "text-muted"}`}
          >
            <Camera className="size-4" aria-hidden="true" />
            AR
          </button>
        </div>
        {onEditAvatar ? (
          <button type="button" onClick={onEditAvatar} className="inline-flex h-10 items-center gap-1.5 rounded-lg border-2 border-line bg-surface-2 px-3 text-sm font-semibold">
            <UserRound className="size-4" aria-hidden="true" />
            ตัวละคร
          </button>
        ) : null}
      </div>

      <div className="relative mx-auto" style={{ aspectRatio: "390 / 560", width: "min(100%, calc(76vh * 390 / 560))" }}>
        {ar ? (
          <>
            <video ref={videoRef} playsInline muted className="absolute inset-0 h-full w-full object-cover" />
            {camError ? <div className="absolute inset-0 bg-[linear-gradient(180deg,#3a3a42,#1d1d22_55%,#2b2b31)]" /> : null}
          </>
        ) : null}
        <svg viewBox="0 0 390 560" className="absolute inset-0 h-full w-full" preserveAspectRatio="xMidYMid meet" role="img" aria-label={`ห้องซ้อม มี ${members.length} คน`}>
          <defs>
            <filter id="neon" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="2.4" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <linearGradient id="floorG" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#2a2a30" />
              <stop offset="0.35" stopColor="#3b3b42" />
              <stop offset="1" stopColor="#24242a" />
            </linearGradient>
            <linearGradient id="screenG" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#0f1a33" />
              <stop offset="0.45" stopColor="#3a5a8a" />
              <stop offset="0.6" stopColor="#8aa8c8" />
              <stop offset="0.61" stopColor="#2a3346" />
              <stop offset="1" stopColor="#121722" />
            </linearGradient>
            <radialGradient id="glowRed" cx="0.5" cy="0.5" r="0.5">
              <stop offset="0" stopColor="rgba(255,59,92,0.35)" />
              <stop offset="1" stopColor="rgba(255,59,92,0)" />
            </radialGradient>
            <pattern id="mesh" width="8" height="8" patternUnits="userSpaceOnUse">
              <rect width="8" height="8" fill="#0d0d10" />
              <path d="M0 8 L8 0" stroke="rgba(255,255,255,0.07)" strokeWidth="1.2" />
              <path d="M-2 2 L2 -2 M6 10 L10 6" stroke="rgba(255,255,255,0.07)" strokeWidth="1.2" />
            </pattern>
            <pattern id="slats" width="9" height="9" patternUnits="userSpaceOnUse">
              <rect width="9" height="9" fill="#0b0b0e" />
              <rect x="6" width="3" height="9" fill="#18181d" />
            </pattern>
            <pattern id="arDots" width="16" height="16" patternUnits="userSpaceOnUse">
              <circle cx="8" cy="8" r="1.6" fill="rgba(45,226,230,0.95)" />
            </pattern>
            <radialGradient id="arFade" cx="0.5" cy="0.5" r="0.5">
              <stop offset="0.55" stopColor="#fff" />
              <stop offset="1" stopColor="#000" />
            </radialGradient>
            <mask id="arMask">
              <ellipse cx="195" cy="470" rx="190" ry="78" fill="url(#arFade)" />
            </mask>
          </defs>

          {!ar ? <RoomBackdrop /> : (
            <g>
              <rect x="0" y="380" width="390" height="180" fill="url(#arDots)" mask="url(#arMask)" opacity="0.85" />
              <ellipse cx="195" cy="478" rx="150" ry="40" fill="none" stroke="rgba(198,255,61,0.95)" strokeWidth="2.5" filter="url(#neon)" />
              <ellipse cx="195" cy="480" rx="120" ry="28" fill="rgba(0,0,0,0.25)" />
            </g>
          )}

          {placed.map(({ member, slot }) => {
            const w = 120 * slot.scale;
            const h = 200 * slot.scale;
            const x = slot.x - w / 2;
            const y = slot.feet - h;
            const tagW = Math.max(54, member.name.length * 7 + 34);
            const bubble = member.bubble ? (member.bubble.length > 22 ? `${member.bubble.slice(0, 21)}…` : member.bubble) : "";
            const bubbleW = Math.min(170, Math.max(60, bubble.length * 6.4 + 20));
            return (
              <g key={member.id}>
                <g transform={`translate(${x} ${y}) scale(${slot.scale})`}>
                  <AvatarFigure look={member.look} bounce={member.level > 0.25} />
                </g>
                <g transform={`translate(${slot.x - tagW / 2} ${y - 20})`}>
                  <rect width={tagW} height="17" rx="8.5" fill="rgba(8,8,10,0.8)" stroke={member.me ? "#ff3b5c" : "rgba(255,255,255,0.22)"} />
                  <circle cx="9" cy="8.5" r="5" fill={member.look.shirt} stroke="#000" />
                  <text x="18" y="12.5" fontSize="9.5" fontWeight="600" fill="#f5f5f7" fontFamily="Kanit, sans-serif">
                    {member.me ? `${member.name} (คุณ)` : member.name}
                  </text>
                  {[0, 1, 2].map((bar) => (
                    <rect key={bar} x={tagW - 16 + bar * 4} y={12 - (bar + 1) * 2.6} width="2.6" height={(bar + 1) * 2.6} rx="0.6" fill={member.level > 0.12 + bar * 0.25 ? "#4ade80" : "#3a3a40"} />
                  ))}
                </g>
                {bubble ? (
                  <g transform={`translate(${Math.min(390 - bubbleW - 4, slot.x + w * 0.2)} ${y - 46})`}>
                    <rect width={bubbleW} height="22" rx="10" fill="rgba(245,245,247,0.96)" />
                    <path d="M8 21 L4 28 L16 21 Z" fill="rgba(245,245,247,0.96)" />
                    <text x="10" y="15" fontSize="10.5" fill="#111" fontFamily="Kanit, sans-serif">
                      {bubble}
                    </text>
                  </g>
                ) : null}
              </g>
            );
          })}

          {ar ? (
            <g>
              <rect x="70" y="14" width="250" height="26" rx="13" fill="rgba(8,8,10,0.72)" />
              <circle cx="88" cy="27" r="7" fill="#c6ff3d" />
              <path d="M84.5 27 l2.5 2.5 l4.5 -5" stroke="#0b0a0f" strokeWidth="1.8" fill="none" />
              <text x="102" y="31" fontSize="10.5" fontWeight="600" fill="#f5f5f7" fontFamily="Kanit, sans-serif">
                วางวงบนพื้นแล้ว · ส่องกล้องไปที่พื้นห้อง
              </text>
            </g>
          ) : null}
        </svg>
      </div>
      {ar && camError ? <p className="px-3 py-2 text-xs text-muted">{camError}</p> : null}
      {ar ? <p className="px-3 pb-3 text-[11px] text-muted">โหมด AR ใช้ภาพจากกล้องหลัง ตัวละครวางทับบนพื้นจำลอง (ยังไม่จับพื้นจริงแบบ 3D)</p> : null}
    </section>
  );
}

function RoomBackdrop() {
  return (
    <g>
      <rect width="390" height="560" fill="#08080a" />
      <polygon points="0,0 390,0 340,150 50,150" fill="#111115" />
      <polygon points="92,52 298,52 280,130 110,130" fill="#1a1a21" />
      <text x="195" y="96" textAnchor="middle" fontSize="32" fill="#fff" fontFamily="'Permanent Marker', cursive" filter="url(#neon)">
        AR
      </text>
      <text x="195" y="116" textAnchor="middle" fontSize="11" letterSpacing="3" fill="#e5e5ea" fontFamily="'Bebas Neue', sans-serif">
        KAKUN REHEARSAL ROOM
      </text>
      <polygon points="0,0 50,150 50,420 0,560" fill="#15151a" />
      <polygon points="390,0 340,150 340,420 390,560" fill="#15151a" />
      <rect x="50" y="150" width="290" height="270" fill="#141418" />

      <rect x="54" y="168" width="88" height="196" rx="4" fill="url(#mesh)" stroke="rgba(255,59,92,0.4)" />
      <path d="M86 190 l3 -10 l5 6 l4 -8 l4 8 l5 -6 l3 10 z" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinejoin="round" filter="url(#neon)" />
      {["GOOD", "BAND", "GREAT", "PEOPLE"].map((word, i) => (
        <text key={word} x="98" y={214 + i * 18} textAnchor="middle" fontSize="15" fill="#fff" fontFamily="'Permanent Marker', cursive" filter="url(#neon)">
          {word}
        </text>
      ))}
      <rect x="248" y="168" width="88" height="196" fill="url(#slats)" />

      <rect x="150" y="176" width="140" height="104" rx="4" fill="url(#screenG)" stroke="#26262e" strokeWidth="2" />
      <polygon points="150,250 167,232 180,242 200,220 215,240 232,226 250,244 266,228 290,250 290,262 150,262" fill="#1b2232" />
      <rect x="218" y="230" width="4" height="34" fill="#ff6b8a" opacity="0.8" />
      <circle cx="270" cy="196" r="12" fill="none" stroke="rgba(255,255,255,0.75)" strokeWidth="1.4" />
      <circle cx="270" cy="196" r="4" fill="none" stroke="rgba(255,255,255,0.75)" strokeWidth="1.4" />
      <text x="158" y="190" fontSize="9" fill="#fff" fontFamily="'Bebas Neue', sans-serif">
        SOUND BETTER
      </text>
      <text x="158" y="200" fontSize="9" fill="#fff" fontFamily="'Bebas Neue', sans-serif">
        TOGETHER
      </text>

      <rect x="282" y="300" width="52" height="116" rx="4" fill="#141418" stroke="#000" strokeWidth="2" />
      {[328, 368].map((cy) => (
        <g key={cy}>
          <circle cx="308" cy={cy} r="16" fill="#2a0a0d" />
          <circle cx="308" cy={cy} r="12" fill="#b5121f" />
          <circle cx="308" cy={cy} r="5" fill="#111" />
        </g>
      ))}
      <rect x="291" y="396" width="34" height="6" fill="#6ee7ff" opacity="0.7" />

      <polygon points="122,386 268,386 278,420 112,420" fill="#24242a" />
      <rect x="105" y="418" width="180" height="12" fill="#0e0e11" />
      <g transform="translate(115 330)">
        <line x1="22" y1="8" x2="22" y2="62" stroke="#a1a1aa" strokeWidth="1.6" />
        <ellipse cx="22" cy="10" rx="18" ry="3.5" fill="#d4a017" stroke="#000" />
        <line x1="140" y1="4" x2="140" y2="62" stroke="#a1a1aa" strokeWidth="1.6" />
        <ellipse cx="140" cy="6" rx="17" ry="3.5" fill="#d4a017" stroke="#000" />
        <ellipse cx="52" cy="34" rx="12" ry="6" fill="#b5121f" stroke="#000" strokeWidth="1.2" />
        <ellipse cx="108" cy="34" rx="12" ry="6" fill="#b5121f" stroke="#000" strokeWidth="1.2" />
        <circle cx="80" cy="48" r="20" fill="#b5121f" stroke="#000" strokeWidth="1.6" />
        <circle cx="80" cy="48" r="15" fill="#111114" stroke="#3a3a42" />
        <text x="80" y="54" textAnchor="middle" fontSize="14" fill="#fff" fontFamily="'Permanent Marker', cursive">
          AR
        </text>
      </g>

      <polygon points="0,560 50,420 340,420 390,560" fill="url(#floorG)" />
      <ellipse cx="80" cy="470" rx="70" ry="60" fill="url(#glowRed)" />
      <ellipse cx="310" cy="470" rx="70" ry="60" fill="url(#glowRed)" />
      <polygon points="70,452 320,452 360,540 30,540" fill="#2c2c32" opacity="0.95" />
      {["MUSIC", "PEOPLE", "BETTER"].map((word, i) => (
        <text key={word} x="195" y={476 + i * 22} textAnchor="middle" fontSize={18 + i * 3} fill="#e8e8ea" opacity="0.8" fontFamily="'Permanent Marker', cursive">
          {word}
        </text>
      ))}

      <g transform="translate(6 392)">
        {[
          ["#c2702c", "#3b2614"],
          ["#141416", "#2a2a2a"],
          ["#e8e8ec", "#2a2a2a"],
        ].map(([body, neck], i) => (
          <g key={i} transform={`translate(${i * 24} 0)`}>
            <rect x="10" y="0" width="4" height="56" fill={neck} />
            <path d="M12 52 C0 52 -2 66 2 74 C-2 84 2 98 12 98 C22 98 26 84 22 74 C26 66 24 52 12 52Z" fill={body} stroke="#000" strokeWidth="1.2" />
          </g>
        ))}
      </g>
      <g transform="translate(60 360)">
        <rect width="52" height="26" rx="3" fill="#141416" stroke="#000" strokeWidth="2" />
        <rect x="8" y="9" width="36" height="8" rx="2" fill="#c8b072" />
        <rect y="28" width="52" height="76" rx="3" fill="#19191c" stroke="#000" strokeWidth="2" />
        <text x="26" y="70" textAnchor="middle" fontSize="9" fill="#e8dcc0" fontFamily="'Permanent Marker', cursive">
          Kakun
        </text>
      </g>

      <g filter="url(#neon)" fill="none">
        <polygon points="72,40 318,40 298,140 92,140" stroke="#fff" strokeWidth="2" opacity="0.9" />
        <polyline points="0,8 50,150 340,150 390,8" stroke="#fff" strokeWidth="1.3" opacity="0.5" />
        <line x1="50" y1="150" x2="50" y2="420" stroke="#ff3b5c" strokeWidth="2" />
        <line x1="340" y1="150" x2="340" y2="420" stroke="#ff3b5c" strokeWidth="2" />
        <line x1="146" y1="170" x2="146" y2="386" stroke="#ff3b5c" strokeWidth="1.6" />
        <line x1="244" y1="170" x2="244" y2="386" stroke="#9cc3ff" strokeWidth="1.6" />
        <polyline points="0,560 50,420 340,420 390,560" stroke="#ff3b5c" strokeWidth="2.2" />
        <polyline points="105,430 112,386 278,386 285,430 105,430" stroke="#ff3b5c" strokeWidth="2.2" />
      </g>
      {[14, 30, 360, 376].map((cx, i) => (
        <circle key={cx} cx={cx} cy={i % 2 === 0 ? 110 : 125} r="5" fill="#2e2e35" />
      ))}

      <g transform="translate(296 182) skewY(-6)">
        <rect width="88" height="112" rx="10" fill="rgba(110,160,255,0.22)" stroke="rgba(160,200,255,0.7)" filter="url(#neon)" />
        <text x="10" y="26" fontSize="18" fill="#fff" fontFamily="'Permanent Marker', cursive">
          AR
        </text>
        {["PLAY", "PRACTICE", "IMPROVE", "TOGETHER"].map((word, i) => (
          <text key={word} x="10" y={44 + i * 13} fontSize="12" letterSpacing="1" fill="#e6efff" fontFamily="'Bebas Neue', sans-serif">
            {word}
          </text>
        ))}
      </g>
    </g>
  );
}
