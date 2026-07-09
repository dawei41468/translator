import WebSocket, { WebSocketServer } from "ws";
import type { IncomingMessage } from "http";
import type { Duplex } from "stream";
import { logger } from "../logger.js";
import { parseCookies } from "../middleware/auth.js";
import { AUTH_COOKIE_NAME, verifyAuthToken } from "../services/auth-session.js";

const GROK_VOICE_MODEL = "grok-voice-latest";
const GROK_VOICE_WS_URL = "wss://api.x.ai/v1/realtime";
const PRACTICE_WS_PATH = "/api/voice/practice-ws";

/** One shared server — do not construct per upgrade. */
const practiceWss = new WebSocketServer({ noServer: true });

/** Concurrent practice connections per user. */
const practiceConnections = new Map<string, number>();
const MAX_PRACTICE_CONNECTIONS_PER_USER = 2;

/** Inbound client messages per user per minute. */
const practiceMessageCounts = new Map<string, { count: number; resetTime: number }>();
const MAX_PRACTICE_MESSAGES_PER_MINUTE = 180;
const MAX_PRACTICE_CLIENT_MESSAGE_BYTES = 120_000;

function incrementPracticeConnection(userId: string): boolean {
  const current = practiceConnections.get(userId) ?? 0;
  if (current >= MAX_PRACTICE_CONNECTIONS_PER_USER) {
    return false;
  }
  practiceConnections.set(userId, current + 1);
  return true;
}

function decrementPracticeConnection(userId: string): void {
  const current = practiceConnections.get(userId) ?? 0;
  if (current <= 1) {
    practiceConnections.delete(userId);
  } else {
    practiceConnections.set(userId, current - 1);
  }
}

function allowPracticeMessage(userId: string): boolean {
  const now = Date.now();
  const entry = practiceMessageCounts.get(userId);
  if (!entry || now > entry.resetTime) {
    practiceMessageCounts.set(userId, { count: 1, resetTime: now + 60_000 });
    return true;
  }
  if (entry.count >= MAX_PRACTICE_MESSAGES_PER_MINUTE) {
    return false;
  }
  entry.count += 1;
  return true;
}

// Prune message rate map periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of practiceMessageCounts) {
    if (now > entry.resetTime) {
      practiceMessageCounts.delete(key);
    }
  }
}, 60_000).unref?.();

export function handlePracticeWsUpgrade(
  req: IncomingMessage,
  socket: Duplex,
  head: Buffer
) {
  const url = new URL(req.url || "/", `http://${req.headers.host}`);
  if (url.pathname !== PRACTICE_WS_PATH) return;

  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[AUTH_COOKIE_NAME];
  if (!token) {
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    socket.destroy();
    return;
  }

  // Authenticate + accept asynchronously after session verification
  void (async () => {
    const auth = await verifyAuthToken(token);
    if (!auth) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }

    const userId = auth.user.id;
    if (!incrementPracticeConnection(userId)) {
      socket.write("HTTP/1.1 429 Too Many Requests\r\n\r\n");
      socket.destroy();
      return;
    }

    practiceWss.handleUpgrade(req, socket, head, (clientWs: WebSocket) => {
      let released = false;
      const release = () => {
        if (released) return;
        released = true;
        decrementPracticeConnection(userId);
      };

      const sourceLang = auth.user.language || "en";

      const apiKey = process.env.GROK_API_KEY;
      if (!apiKey) {
        clientWs.send(JSON.stringify({ type: "error", error: { message: "GROK_API_KEY not configured" } }));
        clientWs.close();
        release();
        return;
      }

      const wsUrl = new URL(GROK_VOICE_WS_URL);
      wsUrl.searchParams.set("model", GROK_VOICE_MODEL);

      const grokWs = new WebSocket(wsUrl.toString(), {
        headers: { Authorization: `Bearer ${apiKey}` },
      });

      grokWs.on("open", () => {
        logger.info("Practice proxy: connected to Grok Voice", { userId, sourceLang });

        grokWs.send(JSON.stringify({
          type: "session.update",
          session: {
            voice: "eve",
            instructions: "You are a helpful language practice partner. Listen to the user and respond naturally.",
            turn_detection: { type: "server_vad" },
          },
        }));

        clientWs.send(JSON.stringify({ type: "practice.ready" }));
      });

      grokWs.on("message", (data: WebSocket.Data) => {
        const msg = data.toString();
        try {
          const parsed = JSON.parse(msg);
          if (parsed.type !== "response.output_audio.delta") {
            logger.info("Practice proxy: Grok message", { userId, type: parsed.type });
          }
        } catch { /* ignore */ }
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(msg);
        }
      });

      grokWs.on("error", (err: Error) => {
        logger.error("Practice proxy: Grok WebSocket error", { error: err.message, userId });
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(JSON.stringify({ type: "error", error: { message: "Voice service error" } }));
          clientWs.close();
        }
      });

      grokWs.on("close", (code: number, reason: Buffer) => {
        logger.info("Practice proxy: Grok WebSocket closed", { userId, code, reason: reason?.toString() });
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.close();
        }
      });

      clientWs.on("message", (data: WebSocket.Data) => {
        if (!allowPracticeMessage(userId)) {
          return;
        }
        const payload = typeof data === "string" ? data : data.toString();
        if (payload.length > MAX_PRACTICE_CLIENT_MESSAGE_BYTES) {
          return;
        }
        if (grokWs.readyState === WebSocket.OPEN) {
          grokWs.send(payload);
        }
      });

      clientWs.on("close", () => {
        logger.info("Practice proxy: client disconnected", { userId });
        grokWs.close();
        release();
      });

      clientWs.on("error", () => {
        grokWs.close();
        release();
      });
    });
  })().catch((err) => {
    logger.error("Practice proxy upgrade failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    try {
      socket.write("HTTP/1.1 500 Internal Server Error\r\n\r\n");
      socket.destroy();
    } catch {
      // ignore
    }
  });
}
