// End-to-end check of on-device AI stem separation (HT-Demucs 6s via
// onnxruntime-web) in headless Chromium against the built SPA + demo song.
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";

const root = "dist-mobile";
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json", ".wasm": "application/wasm" };
const server = createServer(async (req, res) => {
  const path = decodeURIComponent((req.url ?? "/").split("?")[0]);
  const file = path === "/" ? "index.html" : path;
  try {
    const data = await readFile(join(root, file));
    res.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end();
  }
}).listen(4174);

await mkdir("ai-qa", { recursive: true });
const log = [];
const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.on("console", (m) => (m.type() === "error" || m.type() === "warning") && log.push(`console ${m.type()}: ${m.text().slice(0, 300)}`));
page.on("pageerror", (e) => log.push(`pageerror: ${e.message}`));
const t0 = Date.now();
try {
  await page.goto("http://127.0.0.1:4174/", { waitUntil: "networkidle" });
  await page.locator("header nav button").filter({ hasText: /เพลง/ }).first().click();
  await page.getByRole("button", { name: "ลองเพลงตัวอย่าง" }).click();
  await page.waitForSelector("text=รูปจับคอร์ดในเพลง", { timeout: 120000 });
  await page.getByRole("tab", { name: "แยกเสียง" }).click();
  await page.getByRole("button", { name: "เริ่มแยกด้วย AI" }).click();
  let last = "";
  const deadline = Date.now() + 25 * 60 * 1000;
  while (Date.now() < deadline) {
    if (await page.locator("text=/เสร็จใน/").count()) break;
    const err = page.locator("[role=alert]");
    if (await err.count()) {
      log.push(`ui error: ${await err.first().innerText()}`);
      break;
    }
    const status = await page.locator("text=/ดาวน์โหลดโมเดล|โหลด AI|กำลังแยกเสียง|เตรียมไฟล์/").first().innerText().catch(() => "");
    if (status && status !== last) {
      log.push(`[${Math.round((Date.now() - t0) / 1000)}s] ${status}`);
      last = status;
    }
    await page.waitForTimeout(5000);
  }
  const done = await page.locator("text=/เสร็จใน/").first().innerText().catch(() => "not finished");
  log.push(`result: ${done}`);
  // Stem energy sanity check: each stem has signal, stems sum ≈ original.
  const energy = await page.evaluate(() => {
    const w = window;
    return w.__kakunAiEnergy ? w.__kakunAiEnergy() : null;
  });
  if (energy) log.push(`energy: ${JSON.stringify(energy)}`);
  await page.screenshot({ path: "ai-qa/ai-stems.png", fullPage: true });
} catch (e) {
  log.push(`fatal: ${String(e).slice(0, 400)}`);
  await page.screenshot({ path: "ai-qa/ai-error.png", fullPage: true }).catch(() => undefined);
}
log.push(`total ${Math.round((Date.now() - t0) / 1000)}s`);
await browser.close();
server.close();
await writeFile("ai-qa/log.txt", log.join("\n"));
console.log(log.join("\n"));
