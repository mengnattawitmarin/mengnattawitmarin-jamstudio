import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { AuthProvider } from "@/lib/auth/provider";
import { PreviewHostBridge } from "@/components/preview-host-bridge";
import appCss from "../styles.css?url";

const APP_NAME = "Kakunstudio";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: `${APP_NAME} — ห้องซ้อมดนตรีออนไลน์ แอมป์ เอฟเฟกต์ จูนเนอร์` },
      { name: "theme-color", content: "#0b0a0f" },
      { name: "description", content: "ห้องซ้อมดนตรีออนไลน์ แอมป์และเอฟเฟกต์กีตาร์ จูนเนอร์ และเครื่องมือแกะเพลง ลดความเร็ว เปลี่ยนคีย์ ตัดเสียงร้อง" },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/__grok/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/__grok/icon-180.png" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Kanit:wght@300;400;500;600;700;800&family=Bebas+Neue&family=Permanent+Marker&display=swap",
      },
    ],
  }),
  component: () => (
    <html lang="th" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <PreviewHostBridge />
        <AuthProvider>
          <Outlet />
        </AuthProvider>
        <Scripts />
      </body>
    </html>
  ),
});
