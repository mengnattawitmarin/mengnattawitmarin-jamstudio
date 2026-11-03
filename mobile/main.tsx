/**
 * Static single-page entry used for the native apps (Capacitor) and the
 * installable PWA on GitHub Pages. It renders the same StudioApp as the
 * TanStack Start web build, minus SSR and server routes. The jam room talks
 * to a signaling server configured by VITE_API_BASE or in Settings.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { StudioApp } from "@/components/studio/studio-app";
import "@/styles.css";

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <StudioApp />
    </StrictMode>,
  );
}

const isNative = typeof window !== "undefined" && /^(capacitor|ionic):|^https?:\/\/localhost/.test(window.location.href);
if ("serviceWorker" in navigator && !isNative && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("./sw.js").catch(() => undefined);
  });
}
