import { getDb } from "@/lib/db/index";
import { Repository } from "@/lib/db/repo";
import { SnapshotService } from "@/lib/snapshot/service";

export function createSseStream(request: Request, country = "us"): Response {
  const db = getDb();
  const repo = new Repository(db);
  const snapshotService = new SnapshotService(db);

  // Parse Last-Event-ID from header or query param
  const url = new URL(request.url);
  const lastEventIdHeader = request.headers.get("last-event-id") || url.searchParams.get("lastEventId");
  let lastSeenId = lastEventIdHeader ? parseInt(lastEventIdHeader, 10) : 0;
  if (isNaN(lastSeenId)) lastSeenId = 0;

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      // 1. Send initial snapshot
      try {
        const snapshot = snapshotService.getSnapshot(country);
        const maxId = repo.getLatestStreamEventId();
        if (lastSeenId === 0) lastSeenId = maxId;

        const snapshotMsg = `id: ${maxId}\nevent: snapshot\ndata: ${JSON.stringify(snapshot)}\n\n`;
        controller.enqueue(encoder.encode(snapshotMsg));
      } catch (err) {
        console.error("[SSE] Error generating initial snapshot:", err);
      }

      // 2. Replay missed events if client reconnected with an older Last-Event-ID
      if (lastSeenId > 0) {
        const missedEvents = repo.getStreamEventsSince(lastSeenId, 50);
        for (const ev of missedEvents) {
          const msg = `id: ${ev.id}\nevent: ${ev.event_type}\ndata: ${ev.payload_json}\n\n`;
          controller.enqueue(encoder.encode(msg));
          lastSeenId = ev.id;
        }
      }

      // 3. Heartbeat every 15 seconds
      const heartbeatTimer = setInterval(() => {
        try {
          const hb = `event: heartbeat\ndata: ${JSON.stringify({ time: new Date().toISOString() })}\n\n`;
          controller.enqueue(encoder.encode(hb));
        } catch {
          clearInterval(heartbeatTimer);
        }
      }, 15000);

      // 4. Poll stream_events table every 1 second for new events
      const pollTimer = setInterval(() => {
        try {
          const newEvents = repo.getStreamEventsSince(lastSeenId, 50);
          for (const ev of newEvents) {
            const msg = `id: ${ev.id}\nevent: ${ev.event_type}\ndata: ${ev.payload_json}\n\n`;
            controller.enqueue(encoder.encode(msg));
            lastSeenId = ev.id;
          }
        } catch (err) {
          console.error("[SSE] Polling error:", err);
        }
      }, 1000);

      // 5. Cleanup on abort
      request.signal.addEventListener("abort", () => {
        clearInterval(heartbeatTimer);
        clearInterval(pollTimer);
        try {
          controller.close();
        } catch {
          // ignore
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
