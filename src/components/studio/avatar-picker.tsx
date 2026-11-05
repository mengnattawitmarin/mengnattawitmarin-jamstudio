import { AVATARS, AVATAR_INSTS, OUTFITS, resolveAvatar, type AvatarChoice } from "@/lib/avatars";
import { AvatarHead, AvatarSvg } from "@/components/studio/avatar-figure";

/** Character select: stage preview + characters + outfit colour + instrument. */
export function AvatarPicker({ value, onChange }: { value: AvatarChoice; onChange: (next: AvatarChoice) => void }) {
  const look = resolveAvatar(value);
  return (
    <div className="flex flex-col gap-4 sm:flex-row">
      <div
        className="relative h-72 shrink-0 overflow-hidden rounded-xl border-2 border-black shadow-[4px_4px_0_#000] sm:w-56"
        style={{
          background:
            "radial-gradient(200px 220px at 50% 15%, rgba(255,255,255,0.22), transparent 70%), linear-gradient(90deg, transparent 0 14px, rgba(255,59,92,0.95) 14px 16px, transparent 16px calc(100% - 16px), rgba(255,59,92,0.95) calc(100% - 16px) calc(100% - 14px), transparent calc(100% - 14px)), linear-gradient(180deg, #17171c 0 72%, #2c2c32 72%, #1d1d22 100%)",
        }}
      >
        <span className="tape absolute left-3 top-3 text-xs">{look.style}</span>
        <span className="title-rock text-grad absolute right-3 top-2 text-4xl">{look.name}</span>
        <div className="absolute bottom-6 left-1/2 h-8 w-40 -translate-x-1/2 rounded-[50%] bg-[radial-gradient(closest-side,rgba(255,59,92,0.7),transparent)]" />
        <div className="absolute bottom-5 left-1/2 -translate-x-1/2">
          <AvatarSvg look={look} width={128} label={`ตัวละคร ${look.name}`} />
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div>
          <p className="mb-2 text-xs font-semibold text-muted">ตัวละคร</p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {AVATARS.map((avatar) => {
              const on = avatar.id === value.char;
              return (
                <button
                  key={avatar.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => onChange({ char: avatar.id, outfit: null, inst: avatar.inst })}
                  className={`flex flex-col items-center gap-0.5 rounded-lg border-2 p-1.5 text-xs font-semibold ${on ? "border-brass bg-brass/15 shadow-[2px_2px_0_#000]" : "border-line bg-surface-2"}`}
                >
                  <AvatarHead look={resolveAvatar({ char: avatar.id })} size={40} />
                  {avatar.name}
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <p className="mb-2 text-xs font-semibold text-muted">สีชุด</p>
          <div className="flex flex-wrap gap-2">
            {OUTFITS.map((outfit) => {
              const on = (outfit.color ?? null) === (value.outfit ?? null);
              return (
                <button
                  key={outfit.label}
                  type="button"
                  aria-label={`ชุดสี${outfit.label}`}
                  aria-pressed={on}
                  onClick={() => onChange({ ...value, outfit: outfit.color })}
                  className={`h-10 w-10 rounded-full border-[3px] ${on ? "border-fg ring-2 ring-brass" : "border-black"}`}
                  style={{ background: outfit.color ?? "conic-gradient(#ff2e88, #2de2e6, #ffcc00, #7b3fe4, #ff2e88)" }}
                />
              );
            })}
          </div>
        </div>
        <div>
          <p className="mb-2 text-xs font-semibold text-muted">เครื่องดนตรีที่ถือ</p>
          <div className="grid grid-cols-4 gap-2">
            {AVATAR_INSTS.map((inst) => {
              const on = inst.id === look.inst;
              return (
                <button
                  key={inst.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => onChange({ ...value, inst: inst.id })}
                  className={`h-10 rounded-lg border-2 text-sm font-semibold ${on ? "border-black bg-olive text-black shadow-[2px_2px_0_#000]" : "border-line bg-surface-2"}`}
                >
                  {inst.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
