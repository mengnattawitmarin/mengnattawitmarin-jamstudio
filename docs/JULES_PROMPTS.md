# พรอมต์สำหรับ Jules / Gemini — Kakunstudio

คัดลอกทีละข้อไปวางใน Jules (jules.google.com) โดยเลือก repo `mengnattawitmarin-jamstudio` และ branch `main`
ทุกข้อขึ้นต้นด้วยกติกากลางให้แล้ว ใช้ได้เลยไม่ต้องแก้

> **กติกากลาง (มีอยู่ในทุกพรอมต์แล้ว):** อ่าน GEMINI.md และ AGENTS.md ก่อน · UI ภาษาไทย · ห้ามส่งไฟล์เสียงของผู้ใช้ขึ้นเซิร์ฟเวอร์ · ห้ามใช้ชื่อ/โลโก้แบรนด์จริง · ทำบน branch ใหม่แล้วเปิด Pull Request เข้า main · ต้องผ่าน `npm run typecheck && npm test && npm run build:mobile` · เพิ่มบรรทัดใน "บันทึกการส่งต่อ" ของ AGENTS.md

---

## 0) เริ่มต้น — ให้ Jules ทำความเข้าใจโปรเจกต์ (ไม่แก้โค้ด)

```
อ่าน GEMINI.md และ AGENTS.md ใน repo นี้ให้ครบ แล้วตอบเป็นภาษาไทย:
1) สรุปสถาปัตยกรรม (เว็บเต็ม vs SPA มือถือ, shared audio engine, ห้องซ้อม P2P)
2) ไฟล์หลักแต่ละไฟล์ทำอะไร
3) งานถัดไป 3 อันดับแรกที่ควรทำ พร้อมความเสี่ยง
ยังไม่ต้องแก้โค้ดหรือเปิด PR
```

---

## 1) ห้องซ้อมออนไลน์ใช้งานได้จริง (เซิร์ฟเวอร์ signaling)

```
อ่าน GEMINI.md และ AGENTS.md ก่อน

เป้าหมาย: ให้ห้องซ้อมออนไลน์ในแอปมือถือ (Capacitor) และเว็บ GitHub Pages ใช้งานได้จริงโดยไม่ต้องดูแลเซิร์ฟเวอร์เอง

ตอนนี้: src/lib/multiplayer/p2p.ts เรียก `${apiBase()}/api/rtc` (signaling.server.ts ใช้ Postgres) แต่ build มือถือไม่มีเซิร์ฟเวอร์

ให้ทำ:
- เพิ่มทางเลือก signaling แบบ serverless ที่ฟรีและไม่ต้องสมัครบัญชี เช่น Cloudflare Worker + Durable Object (มีโค้ดใน /worker พร้อม wrangler.toml และคู่มือ deploy) หรือทางเลือกอื่นที่เหมาะกว่า อธิบายเหตุผล
- ทำ interface กลางใน p2p.ts ให้สลับ backend ได้ (http polling เดิม / ตัวใหม่) โดยไม่เปลี่ยน API ที่ jam-room.tsx ใช้
- ตั้งค่าผ่าน VITE_API_BASE / ช่อง "เซิร์ฟเวอร์ห้องซ้อม" ในหน้าตั้งค่าเหมือนเดิม
- เขียน docs/DEPLOY_SIGNALING.md เป็นภาษาไทยทีละขั้น สำหรับคนไม่ใช่โปรแกรมเมอร์
- เพิ่ม unit test ของ logic ที่เป็น pure function

เกณฑ์ผ่าน: typecheck/test/build ผ่าน, ห้องซ้อม 2 เครื่องเชื่อมกันได้เมื่อ deploy ตามคู่มือ, ไม่ส่งเสียงผ่านเซิร์ฟเวอร์ (แค่นัดเชื่อมต่อ)
เปิด PR เข้า main และเพิ่มบันทึกใน AGENTS.md
```

---

## 2) ส่งเสียงกีตาร์ที่ผ่านแอมป์เข้าห้องซ้อม

```
อ่าน GEMINI.md และ AGENTS.md ก่อน

เป้าหมาย: ในห้องซ้อม เพื่อนต้องได้ยินเสียงกีตาร์ของเราที่ผ่านแอมป์+เอฟเฟกต์ (ไม่ใช่เสียงดิบ)

ใช้ของที่มี: sharedRig() ใน src/lib/audio/shared-engine.ts มี outputStream() (MediaStream ของเสียงทั้งหมด)
และ P2PRoom.setLocalStream ใน src/lib/multiplayer/p2p.ts

ให้ทำ:
- ใน jam-room.tsx เพิ่มตัวเลือกแหล่งเสียงที่ส่ง: "ไมค์/ไลน์อินดิบ" (เดิม) หรือ "เสียงจากแอมป์ & มิกเซอร์"
- ป้องกันเสียงวน: ไม่ส่งเสียงของเพื่อนที่เล่นอยู่กลับออกไปอีก (แยก bus ให้ชัด)
- แสดงมิเตอร์ระดับเสียงที่กำลังส่ง

เกณฑ์ผ่าน: typecheck/test/build ผ่าน, ไม่มี feedback loop, UI ภาษาไทย
เปิด PR เข้า main และเพิ่มบันทึกใน AGENTS.md
```

---

## 3) ท่าทาง / อีโมตในห้องซ้อม 3D

```
อ่าน GEMINI.md และ AGENTS.md ก่อน

เป้าหมาย: ผู้เล่นกดท่าทางได้ แล้วตัวละครของตัวเองในห้อง 3D/AR (src/components/studio/stage-room.tsx) แสดงท่านั้น และเพื่อนเห็นด้วย

ให้ทำ:
- ท่าทาง 6 แบบ: โบกมือ, ยกมือร็อก, กระโดด, ปรบมือ, หัวเราะ, โค้งคำนับ (SVG/CSS animation ไม่ใช้รูปภาพภายนอก)
- ส่งผ่าน data channel เดิมของ P2P (เพิ่มชนิดข้อความใหม่ใน wire ของ jam-room.tsx พร้อม validate ข้อมูลขาเข้า)
- ปุ่มเลือกท่าทางในแถบของห้องซ้อม ใช้ได้บนมือถือ (ปุ่มใหญ่ ≥44px)
- เพิ่ม test ให้ parser ของข้อความใหม่

เกณฑ์ผ่าน: typecheck/test/build ผ่าน, ไม่มี emoji ในโค้ด UI (ใช้ไอคอน SVG)
เปิด PR เข้า main และเพิ่มบันทึกใน AGENTS.md
```

---

## 4) AR จับพื้นจริง (Android)

```
อ่าน GEMINI.md และ AGENTS.md ก่อน

เป้าหมาย: โหมด AR ใน stage-room.tsx ตอนนี้เป็นแค่วางภาพทับกล้อง ให้เพิ่มโหมด WebXR immersive-ar (hit-test) สำหรับ Android ที่รองรับ เพื่อวางวงดนตรีบนพื้นจริงและตัวละครอยู่กับที่เมื่อขยับมือถือ

ให้ทำ:
- ใช้ three.js (เพิ่ม dependency ได้) โหลดแบบ lazy เฉพาะตอนกด AR
- ตรวจ navigator.xr?.isSessionSupported('immersive-ar') ถ้าไม่รองรับ (iPhone/เครื่องเก่า) ใช้โหมดเดิม
- ตัวละครสร้างจากข้อมูลใน src/lib/avatars.ts (สี/เครื่องดนตรี) เป็นโมเดลง่ายๆ แบบ low-poly
- ถ้าต้องเพิ่มสิทธิ์ native ให้แก้ tool/patch-native.mjs

เกณฑ์ผ่าน: typecheck/test/build ผ่าน, ขนาด bundle หลักไม่โตเกิน 30 KB (three.js ต้องแยก chunk)
เปิด PR เข้า main และเพิ่มบันทึกใน AGENTS.md
```

---

## 5) แท็บ TAB และเนื้อเพลงในเครื่องมือแกะเพลง

```
อ่าน GEMINI.md และ AGENTS.md ก่อน

เป้าหมาย: ในหน้าแกะเพลง (Studio ใน src/components/studio/studio-app.tsx) เพิ่มแท็บ "TAB" และ "เนื้อเพลง"

ให้ทำ:
- TAB: แปลงคอร์ดที่วิเคราะห์ได้เป็นแท็บกีตาร์ 6 สาย (ใช้ src/lib/audio/chord-shapes.ts) เลื่อนตามเวลาเล่น ไฮไลต์คอร์ดปัจจุบัน
- เนื้อเพลง: ให้ผู้ใช้วาง/พิมพ์เนื้อเพลงเอง แล้วแทรกคอร์ดเหนือคำได้ (ไม่ดึงเนื้อเพลงจากเว็บ เพราะลิขสิทธิ์) บันทึกลง IndexedDB คู่กับเพลงใน src/lib/library.ts
- ส่งออกเป็นข้อความ/คัดลอกได้

เกณฑ์ผ่าน: typecheck/test/build ผ่าน, เพิ่ม test ให้ logic แปลงคอร์ด→แท็บ
เปิด PR เข้า main และเพิ่มบันทึกใน AGENTS.md
```

---

## 6) แอมป์ดีเลย์ต่ำด้วย AudioWorklet

```
อ่าน GEMINI.md และ AGENTS.md ก่อน

เป้าหมาย: ลด latency และ CPU ของ amp sim ใน src/lib/audio/rig.ts โดยย้ายส่วน preamp/waveshaper/tone stack ไปทำใน AudioWorkletProcessor

ให้ทำ:
- เขียน worklet (TypeScript ที่ build เป็นไฟล์แยกได้ทั้งเว็บและ build มือถือ vite.mobile.config.ts)
- คงเสียงให้ใกล้เดิม (ทำ A/B test ด้วยสัญญาณทดสอบใน unit test เทียบ RMS/สเปกตรัมคร่าวๆ)
- fallback เป็นเส้นทางเดิมถ้าเครื่องไม่รองรับ AudioWorklet
- วัดและแสดงผล CPU/latency ก่อน-หลังในคำอธิบาย PR

เกณฑ์ผ่าน: typecheck/test/build ผ่าน, ไม่มีเสียงแตกกระตุกเมื่อสลับพรีเซ็ต
เปิด PR เข้า main และเพิ่มบันทึกใน AGENTS.md
```

---

## 7) แก้บั๊กจากการทดสอบจริง (แม่แบบ)

```
อ่าน GEMINI.md และ AGENTS.md ก่อน

บั๊กที่พบบนเครื่องจริง:
- เครื่อง: [เช่น vivo / iPhone 13, Android 14 / iOS 18]
- หน้า: [เช่น เชื่อมต่อ & มิกเซอร์]
- ทำอะไร: [ขั้นตอน]
- ผลที่เกิด: [อาการ / ข้อความ error]
- ที่ควรเป็น: [ผลที่ต้องการ]

ให้หาสาเหตุ อธิบายสั้นๆ แก้ให้น้อยที่สุดเท่าที่จำเป็น และเพิ่ม test ป้องกันถ้าทำได้
เกณฑ์ผ่าน: typecheck/test/build ผ่าน
เปิด PR เข้า main และเพิ่มบันทึกใน AGENTS.md
```

---

## 8) เตรียมขึ้น Google Play

```
อ่าน GEMINI.md และ AGENTS.md ก่อน

เป้าหมาย: เตรียม workflow สำหรับ release ขึ้น Google Play โดยไม่กระทบ APK ทดสอบเดิม

ให้ทำ:
- เพิ่ม job ใน .github/workflows/build.yml ที่ build AAB (bundleRelease) และเซ็นด้วยคีย์จาก GitHub Secrets (ANDROID_KEYSTORE_BASE64, ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_ALIAS, ANDROID_KEY_PASSWORD) — ทำงานเฉพาะเมื่อมี secret ครบ
- ห้าม commit คีย์จริงลง repo
- เขียน docs/PLAY_STORE.md ภาษาไทย: สร้างคีย์, ใส่ secret, หน้าร้าน (ชื่อ คำอธิบาย ภาพ), นโยบายความเป็นส่วนตัว (ไมค์/กล้องใช้ในเครื่องเท่านั้น)
- ร่างนโยบายความเป็นส่วนตัวเป็น docs/PRIVACY.md

เกณฑ์ผ่าน: workflow เดิมยังผ่าน, job ใหม่ข้ามไปเงียบๆ ถ้าไม่มี secret
เปิด PR เข้า main และเพิ่มบันทึกใน AGENTS.md
```

---

## หลัง Jules เปิด PR — ตรวจอย่างไร

1. เปิดแท็บ **Pull requests** ใน GitHub → เข้า PR ของ Jules
2. ดูด้านล่างว่าเช็กทั้งหมดเป็นสีเขียว ✓ (Check + build, Android APK, Visual QA)
3. ภาพหน้าจอล่าสุดอยู่ที่ branch `screenshots`
4. ถ้าผ่าน กด **Merge pull request** → แอปเวอร์ชันใหม่จะ build ขึ้น Releases และ GitHub Pages อัตโนมัติ
5. ไม่แน่ใจ ส่งลิงก์ PR ให้ Claude ช่วยรีวิวก่อนกด Merge ได้
