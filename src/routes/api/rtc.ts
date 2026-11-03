import { createFileRoute } from "@tanstack/react-router";

async function handle({ request }: { request: Request }) {
  const { handleSignaling } = await import("@/lib/multiplayer/signaling.server");
  return handleSignaling(request);
}

export const Route = createFileRoute("/api/rtc")({
  server: { handlers: { GET: handle, POST: handle } },
});
