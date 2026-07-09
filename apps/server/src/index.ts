import { sql } from "drizzle-orm";
import { db } from "../../../packages/db/src/index.js";
import { logger } from "./logger.js";
import { app } from "./app.js";
import { createServer } from "http";
import { Server } from "socket.io";
import { setupSocketIO } from "./socket.js";
import { handlePracticeWsUpgrade } from "./routes/voice-practice-ws.js";
import { CleanupService } from "./services/cleanup.js";
import { ttsRegistry, GrokTtsEngine } from "./services/tts/index.js";
import { sttRegistry, GrokSttEngine } from "./services/stt/index.js";

// Fail closed on required configuration before binding ports.
const requiredEnvVars = ["DATABASE_URL", "JWT_SECRET"] as const;
const missingVars = requiredEnvVars.filter((varName) => !process.env[varName]);
if (missingVars.length > 0) {
  logger.error("Server failed to start: missing required configuration", { missingVars });
  process.exit(1);
}

// Initialize speech engine registries (Grok is default)
ttsRegistry.registerEngine("grok-tts", new GrokTtsEngine());
sttRegistry.registerEngine("grok-stt", new GrokSttEngine());

const startupStart = Date.now();
const PORT = Number(process.env.PORT) || 3003;
const HOST = "127.0.0.1";

async function main() {
  // Database must be reachable before we accept traffic
  try {
    await db.execute(sql`SELECT 1`);
  } catch (error) {
    logger.error("Database connection failed during startup", error);
    process.exit(1);
  }

  const server = createServer(app);
  const io = new Server(server, {
    cors: {
      origin:
        process.env.NODE_ENV === "production"
          ? process.env.FRONTEND_URL || false
          : true,
      credentials: true,
    },
    transports: ["websocket", "polling"],
    allowEIO3: true,
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  setupSocketIO(io);

  server.on("upgrade", (req, socket, head) => {
    handlePracticeWsUpgrade(req, socket, head);
  });

  CleanupService.init();

  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`Received ${signal}, shutting down gracefully`);
    server.close(() => {
      io.close(() => {
        process.exit(0);
      });
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(PORT, HOST, () => resolve());
  });

  const startupTime = Date.now() - startupStart;
  logger.info("Server started successfully", {
    version: "1.0.0",
    environment: process.env.NODE_ENV || "development",
    port: PORT,
    host: HOST,
    nodeVersion: process.version,
    processId: process.pid,
    memoryUsage: {
      heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + "MB",
      heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + "MB",
    },
    database: {
      status: "connected",
      type: "PostgreSQL",
    },
    services: {
      grokApi: process.env.GROK_API_KEY ? "configured" : "not configured",
    },
    configuration: {
      corsPolicy:
        process.env.NODE_ENV === "production"
          ? process.env.FRONTEND_URL || "restricted"
          : "Allow all origins",
      jwtExpiration: "7 days (session-backed)",
    },
    startupTime: `${startupTime}ms`,
  });
}

main().catch((error) => {
  logger.error("Fatal startup error", error);
  process.exit(1);
});
