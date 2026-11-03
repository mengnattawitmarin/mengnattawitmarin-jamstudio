#!/usr/bin/env node
/**
 * Patch the generated native projects (android/ and ios/ are created fresh by
 * `npx cap add` on CI and are not committed). Idempotent.
 *   node tool/patch-native.mjs android|ios
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const target = process.argv[2];
const run = Number(process.env.GITHUB_RUN_NUMBER || "1");
const version = process.env.APP_VERSION || `1.0.${run}`;

function edit(path, fn) {
  if (!existsSync(path)) {
    console.error(`missing ${path}`);
    process.exit(1);
  }
  const before = readFileSync(path, "utf8");
  const after = fn(before);
  if (after !== before) writeFileSync(path, after);
  console.log(`patched ${path}`);
}

if (target === "android") {
  edit("android/app/src/main/AndroidManifest.xml", (xml) => {
    const perms = [
      "android.permission.INTERNET",
      "android.permission.RECORD_AUDIO",
      "android.permission.MODIFY_AUDIO_SETTINGS",
      "android.permission.ACCESS_NETWORK_STATE",
    ];
    let out = xml;
    for (const perm of perms) {
      if (!out.includes(`"${perm}"`)) out = out.replace("</manifest>", `    <uses-permission android:name="${perm}" />\n</manifest>`);
    }
    if (!out.includes("android.hardware.microphone")) {
      out = out.replace(
        "</manifest>",
        '    <uses-feature android:name="android.hardware.microphone" android:required="false" />\n</manifest>',
      );
    }
    return out;
  });
  edit("android/app/build.gradle", (gradle) =>
    gradle.replace(/versionCode \d+/, `versionCode ${run}`).replace(/versionName "[^"]*"/, `versionName "${version}"`),
  );
} else if (target === "ios") {
  edit("ios/App/App/Info.plist", (plist) => {
    const add = [
      ["NSMicrophoneUsageDescription", "JamStudio ใช้ไมโครโฟนเพื่อจูนสาย รับเสียงกีตาร์เข้าแอมป์จำลอง และส่งเสียงในห้องซ้อม"],
      ["CFBundleShortVersionString", version],
      ["CFBundleVersion", String(run)],
    ];
    let out = plist;
    for (const [key, value] of add) {
      const re = new RegExp(`<key>${key}</key>\\s*<string>[^<]*</string>`);
      if (re.test(out)) out = out.replace(re, `<key>${key}</key>\n\t<string>${value}</string>`);
      else out = out.replace(/<\/dict>\s*<\/plist>\s*$/, `\t<key>${key}</key>\n\t<string>${value}</string>\n</dict>\n</plist>\n`);
    }
    return out;
  });
} else {
  console.error("usage: node tool/patch-native.mjs android|ios");
  process.exit(1);
}
