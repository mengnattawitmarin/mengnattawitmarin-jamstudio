/**
 * Static SPA build for the native apps (Capacitor) and the GitHub Pages PWA.
 *   npm run build:mobile   → dist-mobile/
 * Relative base so it works from capacitor://localhost and /<repo>/ on Pages.
 */
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  root: fileURLToPath(new URL("./mobile", import.meta.url)),
  base: "./",
  publicDir: fileURLToPath(new URL("./mobile/public", import.meta.url)),
  envDir: fileURLToPath(new URL(".", import.meta.url)),
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  plugins: [react(), tailwindcss()],
  worker: { format: "es" },
  build: {
    outDir: fileURLToPath(new URL("./dist-mobile", import.meta.url)),
    emptyOutDir: true,
    target: "es2020",
    sourcemap: false,
  },
  server: { host: "0.0.0.0", port: 5174 },
});
