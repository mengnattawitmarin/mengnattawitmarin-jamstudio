# GEMINI.md

สำหรับ Gemini / Jules / Gemini CLI: อ่าน **[AGENTS.md](AGENTS.md)** ก่อนเริ่มงานทุกครั้ง — มีโครงสร้างโค้ด กติกา และงานถัดไปครบ

สรุปสั้น:
- แอป Kakunstudio (React + TanStack Start + Vite, มือถือด้วย Capacitor) UI ภาษาไทย ธีม rock-pop
- ตรวจก่อนส่ง: `npm install && npm run typecheck && npm test && npm run build:mobile`
- ทำงานบน branch ใหม่แล้วเปิด Pull Request เข้า `main` — CI จะ typecheck, test, build และถ่ายภาพหน้าจอให้อัตโนมัติ
- เสร็จงานแล้วเพิ่มบรรทัดใน "บันทึกการส่งต่อ" ของ AGENTS.md
