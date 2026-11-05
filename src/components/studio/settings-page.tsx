import { useEffect, useState } from "react";
import { canPickOutput, listAudioDevices } from "@/lib/audio/rig";
import { DEFAULT_SETTINGS, useSettings, type Settings } from "@/lib/settings";

export function SettingsPage() {
  const settings = useSettings();
  const [devices, setDevices] = useState<{ inputs: MediaDeviceInfo[]; outputs: MediaDeviceInfo[] }>({ inputs: [], outputs: [] });
  const [permission, setPermission] = useState("");

  useEffect(() => {
    void listAudioDevices().then(setDevices).catch(() => undefined);
  }, []);

  async function askMic() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      setDevices(await listAudioDevices());
      setPermission("อนุญาตไมค์แล้ว — รายชื่ออุปกรณ์แสดงครบ");
    } catch {
      setPermission("ไม่ได้รับสิทธิ์ไมค์ เปิดได้ที่การตั้งค่าเครื่อง > แอป > Kakunstudio > สิทธิ์");
    }
  }

  const set = (patch: Partial<Settings>) => settings.set(patch);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-3 py-4 sm:px-4">
      <h1 className="title-rock text-5xl">ตั้งค่า</h1>

      <section className="panel flex flex-col gap-3 p-4">
        <h2 className="font-semibold">โปรไฟล์</h2>
        <label className="flex flex-col gap-1 text-sm">
          ชื่อในห้องซ้อม
          <input value={settings.name} maxLength={32} onChange={(e) => set({ name: e.target.value })} className="h-10 rounded-lg border border-line bg-surface-2 px-3" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          เครื่องดนตรีหลัก
          <select value={settings.instrument} onChange={(e) => set({ instrument: e.target.value as Settings["instrument"] })} className="h-10 rounded-lg border border-line bg-surface-2 px-2">
            <option value="guitar">กีตาร์</option>
            <option value="bass">เบส</option>
            <option value="vocal">ร้อง</option>
            <option value="drums">กลอง</option>
            <option value="keys">คีย์บอร์ด</option>
          </select>
        </label>
      </section>

      <section className="panel flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">เสียงเข้า-ออก</h2>
          <button type="button" onClick={() => void askMic()} className="h-9 rounded-lg border border-line px-3 text-sm">
            ขอสิทธิ์ไมค์ / ค้นหาอุปกรณ์
          </button>
        </div>
        {permission ? <p className="text-xs text-muted">{permission}</p> : null}
        <label className="flex flex-col gap-1 text-sm">
          อินพุต (ไมค์ / ออดิโออินเทอร์เฟซ / iRig)
          <select value={settings.inputDeviceId} onChange={(e) => set({ inputDeviceId: e.target.value })} className="h-10 rounded-lg border border-line bg-surface-2 px-2">
            <option value="default">ค่าเริ่มต้นของระบบ</option>
            {devices.inputs
              .filter((d) => d.deviceId && d.deviceId !== "default")
              .map((d, i) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || `อินพุต ${i + 1}`}
                </option>
              ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          ช่องอินพุต
          <select value={settings.inputChannel} onChange={(e) => set({ inputChannel: e.target.value as Settings["inputChannel"] })} className="h-10 rounded-lg border border-line bg-surface-2 px-2">
            <option value="mix">รวม (โมโน)</option>
            <option value="left">ช่อง 1 / ซ้าย</option>
            <option value="right">ช่อง 2 / ขวา</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          เอาต์พุต {canPickOutput() ? "" : "(อุปกรณ์นี้ให้เลือกจากระบบเครื่อง)"}
          <select disabled={!canPickOutput()} value={settings.outputDeviceId} onChange={(e) => set({ outputDeviceId: e.target.value })} className="h-10 rounded-lg border border-line bg-surface-2 px-2">
            <option value="default">ค่าเริ่มต้นของระบบ</option>
            {devices.outputs
              .filter((d) => d.deviceId && d.deviceId !== "default")
              .map((d, i) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || `เอาต์พุต ${i + 1}`}
                </option>
              ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          โหมดดีเลย์
          <select value={settings.latency} onChange={(e) => set({ latency: e.target.value as Settings["latency"] })} className="h-10 rounded-lg border border-line bg-surface-2 px-2">
            <option value="interactive">ต่ำสุด (แนะนำเมื่อใช้สาย/อินเทอร์เฟซ)</option>
            <option value="balanced">สมดุล (ถ้าเสียงกระตุก)</option>
          </select>
        </label>
        <label className="flex items-center justify-between gap-3 text-sm">
          ตัดเสียงอัตโนมัติเมื่อเกิดเสียงหอน
          <input type="checkbox" checked={settings.howlGuard} onChange={(e) => set({ howlGuard: e.target.checked })} className="h-5 w-5 accent-[var(--color-brass)]" />
        </label>
        <p className="text-xs text-muted">
          เคล็ดลับดีเลย์ต่ำ: ใช้หูฟังมีสาย หรือออดิโออินเทอร์เฟซ USB · หูฟังบลูทูธมักหน่วง 150–300 ms ไม่เหมาะกับการเล่นสด · Android ใช้ USB-C อินเทอร์เฟซได้ · iPhone ใช้อะแดปเตอร์ Lightning/USB-C
        </p>
      </section>

      <section className="panel flex flex-col gap-3 p-4">
        <h2 className="font-semibold">จูนเนอร์</h2>
        <label className="flex items-center justify-between gap-3 text-sm">
          ความถี่อ้างอิง A4
          <input type="number" min={430} max={450} value={settings.a4} onChange={(e) => set({ a4: Math.min(450, Math.max(430, Number(e.target.value) || 440)) })} className="h-10 w-24 rounded-lg border border-line bg-surface-2 px-2 text-right" />
        </label>
      </section>

      <section className="panel flex flex-col gap-3 p-4">
        <h2 className="font-semibold">เซิร์ฟเวอร์ห้องซ้อม</h2>
        <p className="text-xs text-muted">
          ห้องซ้อมต้องมีเซิร์ฟเวอร์จับคู่ (แค่ส่งข้อมูลนัดเชื่อมต่อ เสียงวิ่งตรงระหว่างเครื่อง) · เว็บใช้เซิร์ฟเวอร์ของตัวเองอัตโนมัติ · แอปมือถือใช้ค่าที่ตั้งตอน build หรือใส่ URL ของเว็บ Kakunstudio ที่ deploy ไว้ตรงนี้
        </p>
        <input
          value={settings.serverUrl}
          onChange={(e) => set({ serverUrl: e.target.value })}
          placeholder="https://your-jamstudio.vercel.app"
          inputMode="url"
          className="h-10 rounded-lg border border-line bg-surface-2 px-3 text-sm"
        />
      </section>

      <section className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={() => settings.set(DEFAULT_SETTINGS)} className="h-10 rounded-lg border border-line px-3 text-sm">
          คืนค่าเริ่มต้น
        </button>
        <p className="text-xs text-muted">Kakunstudio v2.0 · ข้อมูลทั้งหมดเก็บในเครื่องนี้</p>
      </section>
    </main>
  );
}
