# AGENTS.md — คู่มือส่งต่องาน Kakunstudio (สำหรับ AI / นักพัฒนา)

> ทุกครั้งที่ทำงานเสร็จ ให้อัปเดต "สถานะล่าสุด" และ "บันทึกการส่งต่อ" ด้านล่าง

## โปรเจกต์คืออะไร
**Kakunstudio** — แอปซ้อมดนตรีภาษาไทย: ห้องซ้อมออนไลน์ (P2P), แอมป์ & เอฟเฟกต์กีตาร์/เบส, จูนเนอร์, เครื่องมือแกะเพลง (แยกเสียง/ลดความเร็ว/เปลี่ยนคีย์/คอร์ด), คลังเพลง
- Repo: https://github.com/mengnattawitmarin/mengnattawitmarin-jamstudio
- ดาวน์โหลด: หน้า Releases (APK Android, .ipa ไม่เซ็น, zip เว็บ) — สร้างอัตโนมัติทุก push ขึ้น `main`
- ต้นทาง: โค้ด "เลน" จาก Grok workspace (ดู `docs/GROK_WORKSPACE.md`) → ปรับเป็น Kakunstudio ตามภาพดีไซน์
- ภาษา UI: ไทย · ธีม **rock-pop** (v2): ดำ + ชมพู→ส้ม (`--grad-rock`) + เขียวนีออน, ฟอนต์ Kanit / Bebas Neue / Permanent Marker, การ์ดสไตล์สติกเกอร์ (ขอบหนา + เงาแข็ง) — `src/styles.css` (token ชื่อเดิม: `brass` = สีหลัก, `olive` = เขียวนีออน, `.bg-brass` ถูก override เป็นกราเดียนต์)
- ชื่อเดิม JamStudio → เปลี่ยนเป็น **Kakunstudio** (2026-11-05). key ใน localStorage/IndexedDB ยังเป็น `jamstudio-*` เพื่อไม่ให้ข้อมูลผู้ใช้หาย; ชื่อ repo ยังเป็น `mengnattawitmarin-jamstudio`

## สถาปัตยกรรม
มี 2 build จากโค้ดชุดเดียว:
1. **เว็บเต็ม (TanStack Start + Nitro, deploy Vercel)** — `npm run dev` / `npm run build`. มี `/api/rtc` (signaling ห้องซ้อม, ใช้ Postgres/PGlite)
2. **SPA สำหรับมือถือ/PWA** — `npm run build:mobile` → `dist-mobile/` (entry `mobile/main.tsx`, config `vite.mobile.config.ts`).
   ใช้กับ Capacitor (Android/iOS) และ GitHub Pages. ไม่มี server ในตัว → ห้องซ้อมต้องชี้ไปที่ `/api/rtc` ของเว็บเต็มผ่าน
   `VITE_API_BASE` (repo variable `JAMSTUDIO_API_BASE`) หรือช่อง "เซิร์ฟเวอร์ห้องซ้อม" ในหน้าตั้งค่า. Server ส่ง CORS `*` แล้ว

## โครงสร้างโค้ดสำคัญ
```
src/components/studio/studio-app.tsx   shell หลัก: เมนู 5 หมวด (หน้าแรก·แจม·โทน·จูน·เพลง) + ตั้งค่าที่ header, SongTabs (แกะเพลง↔คลังเพลง), Studio แบ่งแท็บ คอร์ด/แยกเสียง/วิเคราะห์, Transport, WSOLA
src/components/studio/home.tsx         หน้าแรก: hero, 4 ไทล์ตามเป้าหมาย, Legend Tones (ส่งพรีเซ็ตไปหน้าแอมป์ผ่าน PENDING_PRESET_KEY), เพลงล่าสุด
src/components/studio/jam-room.tsx     ห้องซ้อม: lobby, Session (โน้ต P2P, ไลน์อิน, แชท, รายชื่อ+มิเตอร์, เชิญเพื่อน)
src/components/studio/rig-room.tsx     แอมป์ & เอฟเฟค: pedalboard, AmpHead, ตู้/ไมค์/IR, I/O, fretboard, backing, เมโทรนอม, พรีเซ็ตผู้ใช้
src/components/studio/tuner.tsx        จูนเนอร์ (หัวกีตาร์, AUTO, เสียงอ้างอิง, trace)
src/components/studio/library.tsx      คลังเพลง (IndexedDB)
src/components/studio/settings-page.tsx ตั้งค่า (ชื่อ, อุปกรณ์เสียง, A4, server URL)
src/components/studio/chord-diagram.tsx ไดอะแกรมคอร์ดกีตาร์
src/components/ui/knob.tsx             ลูกบิดหมุน (ลาก/ล้อเมาส์/ลูกศร, ARIA slider)
src/lib/audio/rig.ts                   DSP แอมป์: RigEngine, ก้อนเอฟเฟกต์ 18 แบบ, แอมป์ 14 รุ่น, ตู้/ไมค์/IR, howl guard, I/O, พรีเซ็ตศิลปิน
src/lib/audio/stretch.ts (+worker)     WSOLA: ลดความเร็วไม่เพี้ยนเสียง + เปลี่ยนคีย์
src/lib/audio/player.ts                MixPlayer (ต้นฉบับ/เลน, buffer ที่ประมวลผลแล้ว)
src/lib/audio/engine.ts, worker.ts     วิเคราะห์เพลง: แยกเลน, คอร์ด, คีย์, BPM
src/lib/audio/tunings.ts               14 เครื่อง / 39 จูนนิ่ง
src/lib/audio/chord-shapes.ts          รูปจับคอร์ด (open + E/A-shape barre)
src/lib/multiplayer/p2p.ts             WebRTC mesh + signaling poll (ใช้ apiBase())
src/lib/multiplayer/signaling.server.ts /api/rtc (+CORS)
src/lib/settings.ts                    zustand persist (localStorage "jamstudio-settings"), apiBase()
src/lib/library.ts                     IndexedDB "jamstudio"/songs
mobile/                                entry SPA, manifest, sw.js, ไอคอน PWA
capacitor.config.json                  appId com.kakunstudio.app (เปลี่ยนจาก com.mengnattawit.kakunstudio เพื่อหนีลายเซ็นเก่า), webDir dist-mobile
tool/patch-native.mjs                  ใส่ permission ไมค์ / version ลง android/ ios/ ที่สร้างใหม่บน CI
tool/signing/debug.keystore            คีย์ทดสอบ (CI เท่านั้น ให้ APK ติดตั้งทับกันได้) — ห้ามใช้ขึ้น Play Store
.github/workflows/build.yml            typecheck → test → build:mobile → Pages / APK / iOS ipa → Release "build-N"
```

## ระบบเสียง (สรุปอัลกอริทึม)
- **อินพุต**: getUserMedia ปิด echoCancellation/noiseSuppression/AGC, ขอ latency 5 ms, เลือกอุปกรณ์ + ช่องซ้าย/ขวา (ChannelSplitter), high-pass 28 Hz กัน DC/รัมเบิล, ทริม ±24 dB, มิเตอร์พีค + เตือนคลิป (≥ −0.5 dBFS)
- **เอาต์พุต**: AudioContext latencyHint interactive/balanced, `setSinkId` เลือกหูฟัง (Chrome/Edge), แสดงค่าดีเลย์ (base+output+input frame), limiter ท้ายสาย
- **Howl guard**: อินพุตดัง (rms>0.18) และไม่ลดลง + มี pitch คงที่ ~1.3 วิ → ปิด master (สายดีดจะ decay เสมอ เสียงหอนจะค้าง/โต)
- **แอมป์**: tone stack (low-shelf/peaking/high-shelf) → preamp gain → WaveShaper 4x oversample (เส้นหลอดอสมมาตร) → sag (compressor) → presence → ตู้
- **ตู้/ไมค์**: profile ตู้ (HP, bump, notch, LP) × ไมค์ (SM57/MD421/R121/U87: peak, low shelf, hi rolloff) + room (early reflection) หรือ **IR ผู้ใช้** (ConvolverNode)
- **ก้อนใหม่**: Treble Boost, Clear OD (clean blend + diode clip), Uni-Vibe (4 all-pass แบบ staggered + LFO รูปหลอดไฟ + throb), Varitone (notch 6 ตำแหน่ง)
- **พรีเซ็ตศิลปิน** (`group: "artist"`): Hendrix ×3, John Mayer ×3, B.B. King ×2 — อิงอุปกรณ์จากข้อมูลสาธารณะ ไม่ได้รับรองโดยศิลปิน
- **WSOLA**: grain 46 ms, overlap 50% Hann, ค้นหา ±12 ms (coarse step 4 + fine), เปลี่ยนคีย์ = resample แล้ว stretch กลับ

## กติกาการแก้โค้ด
1. ข้อความ UI เป็นภาษาไทย; เสียงประมวลผลในเครื่อง ห้ามส่งไฟล์เพลงขึ้นเซิร์ฟเวอร์
2. โค้ดที่ใช้ร่วมเว็บ+มือถือ ห้าม import `@tanstack/*` server หรือ `@/lib/db` ใน `src/components/studio/*`
3. ห้ามใช้ชื่อ/โลโก้แบรนด์อุปกรณ์จริงใน UI (ใช้ชื่อกลาง เช่น "เพล็กซี่ 100W", "โอดีใส")
4. localStorage ต้องห่อ try/catch
5. เพิ่ม permission/native config → แก้ `tool/patch-native.mjs` (android/ ios/ ถูกสร้างใหม่บน CI ไม่ commit)
6. เพิ่ม logic → เพิ่ม test (`node --experimental-strip-types --test`, import ด้วยนามสกุล `.ts`)
7. lock file เดิมไม่ sync → CI ใช้ `npm install` (ถ้าแก้ dependency ให้ commit package-lock ใหม่จากเครื่องที่มี npm)

## รันบนเครื่อง
```bash
npm install
npm run dev            # เว็บเต็ม (มีห้องซ้อม) ที่ :8080
npm run dev:mobile     # SPA มือถือที่ :5174
npm run build:mobile && npx cap add android && node tool/patch-native.mjs android && npx cap sync && npx cap open android
```

## สถานะล่าสุด (v2.0 — 2026-11-05)
- ✅ เปลี่ยนชื่อ Kakunstudio + ธีม rock-pop + จัดเมนูใหม่ ผ่าน typecheck/test/QA screenshots
- ✅ typecheck + unit tests ผ่านบน CI, build SPA ผ่าน
- ⚠️ ยังไม่ทดสอบบนมือถือจริง, ห้องซ้อมในแอปมือถือต้องตั้ง `JAMSTUDIO_API_BASE` (URL เว็บเต็มที่ deploy แล้ว)
- ⚠️ GitHub Pages ต้องเปิดเองครั้งแรก: Settings → Pages → Source: GitHub Actions

## งานถัดไป (เรียงตามความสำคัญ)
0. ✅ v2.1 ใส่ห้องซ้อม 3D/AR ในแอปแล้ว (`stage-room.tsx` ฉาก SVG 390×560, `avatar-figure.tsx`, `avatar-picker.tsx`, `src/lib/avatars.ts`, ส่งตัวละครใน wire `who.a`, บอลลูนแชท 5 วิ, AR = กล้องหลัง + พื้นจำลอง) — ถัดไป: WebXR จับพื้นจริง, ท่าทาง/อีโมต, ขยับตามจังหวะจริง. แนวคิดเดิม: เลือกตัวละคร (สไตล์/สีชุด/เครื่องดนตรี) → ห้องซ้อม 3D (ผนังอิฐ, แอมป์, กลอง, ป้ายชื่อ+มิเตอร์เสียงลอยหัว) → โหมด AR วางวงบนพื้นจริงผ่านกล้อง. แนวทาง: three.js + WebXR (Android Chrome) / ภาพกล้อง + พื้นจำลองสำหรับ iOS, ส่ง pose/อีโมตผ่าน P2P data channel ที่มีอยู่
1. ทดสอบบนเครื่องจริง (ดีเลย์ไลน์อิน Android/iOS, สิทธิ์ไมค์ใน WebView) แล้วแก้
2. Deploy เว็บเต็ม (Vercel + Neon) แล้วตั้ง `JAMSTUDIO_API_BASE` ให้ห้องซ้อมในแอปมือถือใช้ได้
3. ส่งเสียงจากแอมป์จำลองเข้าห้องซ้อม (MediaStreamDestination ของ RigEngine → p2p.setLocalStream)
4. วิดีโอในห้องซ้อม (ต้องเพิ่ม video track + renegotiation ใน p2p.ts)
5. แท็บ TAB/เนื้อเพลงในเครื่องมือแกะเพลง, export MIDI จาก melody
6. AudioWorklet สำหรับ amp sim (ลด latency/CPU), ไลน์อินผ่าน native plugin (Oboe/AVAudioEngine) เพื่อ <10 ms
7. Release signing จริง + Play Store / TestFlight; รายได้: Pro (IR/พรีเซ็ตเพิ่ม, ห้องส่วนตัว, อัดเสียง)

## บันทึกการส่งต่อ (เพิ่มรายการใหม่ไว้บนสุด)
| วันที่ | ผู้ทำ | ทำอะไร | ค้าง/ข้อควรรู้ |
|---|---|---|---|
| 2026-11-05 | Claude (claude.ai) | ห้องซ้อม 3D/AR ในแอป: เลือกตัวละคร 6 ตัว/สีชุด/เครื่องดนตรี (ที่ lobby และในห้อง), ฉากสตูดิโอนีออนตามภาพอ้างอิง, โหมด AR กล้อง, สิทธิ์ CAMERA/NSCameraUsageDescription | AR ยังไม่ใช่การจับพื้นจริง (overlay บนวิดีโอ) |
| 2026-11-05 | Claude (claude.ai) | แก้ติดตั้ง APK ไม่ได้ ("แพ็กเกจขัดแย้ง"): บังคับเซ็นด้วย tool/signing/debug.keystore ผ่าน patch-native + ตรวจ SHA-256 ใน CI (bb6402…d453) | ผู้ใช้ต้องลบแอปเก่าครั้งเดียว หลังจากนั้นอัปเดตทับได้ |
| 2026-11-05 | Claude (claude.ai) | v2: เปลี่ยนชื่อเป็น Kakunstudio, ธีม rock-pop, โลโก้สายฟ้า, หน้าแรกใหม่, เมนู 5 หมวด, รวมแกะเพลง+คลังเพลงเป็นหมวด "เพลง", Studio แบ่งแท็บ | appId เปลี่ยนเป็น com.mengnattawit.kakunstudio → ต้องลบแอปเก่า (JamStudio) เองถ้าติดตั้งไว้ |
| 2026-11-03 | Claude (claude.ai) | นำเข้าโค้ด Grok "เลน" → Kakunstudio v1: UI ใหม่ตามดีไซน์, จูนเนอร์, rig แบบภาพ+ตู้/ไมค์/IR+I/O+howl guard, ก้อนใหม่ 4, แอมป์ใหม่ 4, พรีเซ็ตศิลปิน 8, WSOLA, คลังเพลง, แชท, ไดอะแกรมคอร์ด, Capacitor+CI | ยังไม่ทดสอบเครื่องจริง; Pages ต้องเปิดเอง; ห้องซ้อมบนมือถือต้องมี server URL |
