// Render every main tab of the built SPA (dist-mobile) on desktop + phone and
// save PNGs + console errors to qa/. Used by CI for visual QA.
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";

const root = "dist-mobile";
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json" };
const server = createServer(async (req, res) => {
  const path = decodeURIComponent((req.url ?? "/").split("?")[0]);
  try {
    const file = path === "/" ? "index.html" : path;
    const data = await readFile(join(root, file));
    res.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end();
  }
}).listen(4173);

await mkdir("qa", { recursive: true });
const browser = await chromium.launch({ args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required"] });
const tabs = [
  ["home", "หน้าแรก"],
  ["jam", "แจม|ห้องซ้อม"],
  ["rig", "โทน|แอมป์"],
  ["tuner", "จูน"],
  ["studio", "เพลง"],
];
const log = [];
for (const [label, vp] of [["desktop", { width: 1440, height: 900 }], ["phone", { width: 390, height: 844 }]]) {
  const page = await browser.newPage({ viewport: vp, deviceScaleFactor: 1 });
  page.on("console", (m) => m.type() === "error" && log.push(`[${label}] console: ${m.text()}`));
  page.on("pageerror", (e) => log.push(`[${label}] pageerror: ${e.message}`));
  await page.goto("http://127.0.0.1:4173/", { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  for (const [id, text] of tabs) {
    const nav = label === "desktop" ? page.locator("header nav button") : page.locator("nav[aria-label='เมนูหลัก'] >> nth=-1").locator("button");
    await nav.filter({ hasText: new RegExp(text) }).first().click();
    await page.waitForTimeout(700);
    await page.screenshot({ path: `qa/${label}-${id}.png`, fullPage: label === "desktop" });
  }
  // Library sub-tab inside "เพลง"
  await page.getByRole("tab", { name: "คลังเพลง" }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `qa/${label}-library.png`, fullPage: label === "desktop" });
  // Studio with the demo song analysed
  await (label === "desktop" ? page.locator("header nav button") : page.locator("nav[aria-label='เมนูหลัก'] >> nth=-1").locator("button")).filter({ hasText: /เพลง/ }).first().click();
  await page.getByRole("button", { name: "ลองเพลงตัวอย่าง" }).click();
  await page.waitForSelector("text=รูปจับคอร์ดในเพลง", { timeout: 60000 }).catch(() => log.push(`[${label}] studio demo did not finish`));
  await page.waitForTimeout(500);
  await page.screenshot({ path: `qa/${label}-studio-demo.png`, fullPage: label === "desktop" });
  await page.getByRole("tab", { name: "แยกเสียง" }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `qa/${label}-studio-stems.png`, fullPage: label === "desktop" });
  // Rig: open an artist preset and focus a pedal
  await (label === "desktop" ? page.locator("header nav button") : page.locator("nav[aria-label='เมนูหลัก'] >> nth=-1").locator("button")).filter({ hasText: /โทน|แอมป์/ }).first().click();
  await page.locator("#preset-pick").selectOption("hendrix-haze");
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: /ปรับ ฟัซซ์/ }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `qa/${label}-rig-hendrix.png`, fullPage: label === "desktop" });
  const opts = page.locator('[role="listbox"][aria-label="หัวแอมป์"] [role="option"]');
  log.push(`[${label}] amp options: ${await opts.count()}`);
  await opts.nth(5).scrollIntoViewIfNeeded().catch(() => undefined);
  await opts.nth(5).click({ timeout: 5000 }).catch((e) => log.push(`[${label}] amp switch failed: ${String(e).slice(0, 160)}`));
  await page.waitForTimeout(400);
  await page.screenshot({ path: `qa/${label}-rig-tweed.png`, fullPage: label === "desktop" });
  await page.getByRole("button", { name: "ตู้แอมป์" }).first().click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `qa/${label}-rig-amps.png`, fullPage: label === "desktop" });
  await page.getByRole("button", { name: "แอมป์ & เอฟเฟค" }).last().click();
  // Jam: enter a room
  await (label === "desktop" ? page.locator("header nav button") : page.locator("nav[aria-label='เมนูหลัก'] >> nth=-1").locator("button")).filter({ hasText: /แจม|ห้องซ้อม/ }).first().click();
  await page.getByRole("button", { name: "สร้างห้องซ้อม" }).click();
  await page.waitForTimeout(1200);
  await page.locator("#chat-input").fill("เริ่มกันเลย!");
  await page.getByRole("button", { name: "ส่ง" }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `qa/${label}-jam-room.png`, fullPage: label === "desktop" });
  // Settings
  await page.getByRole("button", { name: "ตั้งค่า" }).first().click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `qa/${label}-settings.png`, fullPage: label === "desktop" });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (overflow > 1) log.push(`[${label}] horizontal overflow ${overflow}px`);
  await page.close();
}
await browser.close();
server.close();
await writeFile("qa/console.txt", log.join("\n") || "no errors");
console.log(log.join("\n") || "no errors");
