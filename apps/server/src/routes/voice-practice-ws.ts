import { WebSocket } from "ws";
import jwt from "jsonwebtoken";
import type { IncomingMessage } from "http";
import type { Socket } from "net";
import { logger } from "../logger.js";
import { parseCookies } from "../middleware/auth.js";
import { db } from "../../../../packages/db/src/index.js";
import { users } from "../../../../packages/db/src/schema.js";
import { eq } from "drizzle-orm";

const GROK_VOICE_MODEL = "grok-voice-latest";
const GROK_VOICE_WS_URL = "wss://api.x.ai/v1/realtime";
const JWT_SECRET = process.env.JWT_SECRET!;
const AUTH_COOKIE_NAME = "auth_token";
const PRACTICE_WS_PATH = "/api/voice/practice-ws";

export function handlePracticeWsUpgrade(
  req: IncomingMessage,
  socket: Socket,
  head: Buffer
) {
  const url = new URL(req.url || "/", `http://${req.headers.host}`);
  if (url.pathname !== PRACTICE_WS_PATH) return;

  // Authenticate via cookie
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[AUTH_COOKIE_NAME];
  if (!token) {
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    socket.destroy();
    return;
  }

  let userId: string;
  try {
    const payload = jwt.verify(token, JWT_SECRET) as any;
    userId = payload.userId;
    if (!userId) throw new Error("no userId");
  } catch {
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    socket.destroy();
    return;
  }

  // Accept the browser WebSocket
  const wss = new WebSocket.Server({ noServer: true });
  wss.handleUpgrade(req, socket, head, async (clientWs) => {
    // Look up user language preference
    let sourceLang = "en";
    try {
      const user = await db.query.users.findFirst({
        where: eq(users.id, userId),
      });
      if (user?.language) sourceLang = user.language;
    } catch {
      // default to en
    }

    const apiKey = process.env.GROK_API_KEY;
    if (!apiKey) {
      clientWs.send(JSON.stringify({ type: "error", error: { message: "GROK_API_KEY not configured" } }));
      clientWs.close();
      return;
    }

    // Connect to xAI realtime API
    const wsUrl = new URL(GROK_VOICE_WS_URL);
    wsUrl.searchParams.set("model", GROK_VOICE_MODEL);

    const grokWs = new WebSocket(wsUrl.toString(), [`xai-api-key.${apiKey}`]);

    grokWs.on("open", () => {
      logger.info("Practice proxy: connected to Grok Voice", { userId, sourceLang });

      // Configure session — the client will send its own session.update,
      // but we send a default config as fallback
      grokWs.send(JSON.stringify({
        type: "session.update",
        session: {
          voice: "eve",
          instructions: "You are a helpful language practice partner. Listen to the user and respond naturally.",
          turn_detection: {
            type: "server_vad",
            silence_duration_ms: 400,
            threshold: 0.6,
            prefix_padding_ms: 200,
          },
        },
      }));

      // Tell client it's ready
      clientWs.send(JSON.stringify({ type: "practice.ready" }));
    });

    // Proxy: Grok → Browser
    grokWs.on("message", (data) => {
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(data.toString());
      }
    });

    grokWs.on("error", (err) => {
      logger.error("Practice proxy: Grok WebSocket error", { error: err.message, userId });
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify({ type: "error", error: { message: "Voice service error" } }));
        clientWs.close();
      }
    });

    grokWs.on("close", (code, reason) => {
      logger.info("Practice proxy: Grok WebSocket closed", { userId, code, reason: reason?.toString() });
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.close();
      }
    });

    // Proxy: Browser → Grok
    clientWs.on("message", (data) => {
      if (grokWs.readyState === WebSocket.OPEN) {
        grokWs.send(data.toString());
      }
    });

    clientWs.on("close", () => {
      logger.info("Practice proxy: client disconnected", { userId });
      grokWs.close();
    });

    clientWs.on("error", () => {
      grokWs.close();
    });
  });
}
