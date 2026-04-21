import { sql } from "drizzle-orm";
import { db } from "../../../packages/db/src/index.js";
import { normalizeGoogleCredentials } from "./config.js";
normalizeGoogleCredentials();

import { rooms } from "../../../packages/db/src/schema.js";
import { logger } from "./logger.js";
import { app } from "./app.js";
import { createServer } from "http";
import { Server } from "socket.io";
import { setupSocketIO } from "./socket.js";
import cron from "node-cron";

import { CleanupService } from "./services/cleanup.js";
import { ttsRegistry, GoogleTtsEngine, GrokTtsEngine } from "./services/tts/index.js";
import { sttRegistry, GoogleSttEngine, GrokSttEngine } from "./services/stt/index.js";

// Initialize speech engine registries
ttsRegistry.registerEngine('google-cloud', new GoogleTtsEngine());
ttsRegistry.registerEngine('grok-tts', new GrokTtsEngine());

sttRegistry.registerEngine('google-cloud-stt', new GoogleSttEngine());
sttRegistry.registerEngine('grok-stt', new GrokSttEngine());

const startupStart = Date.now();
const PORT = Number(process.env.PORT) || 3003;

const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin:
      process.env.NODE_ENV === "production"
        ? (process.env.FRONTEND_URL || false)
        : true,
    credentials: true,
  },
  transports: ['websocket', 'polling'],
  allowEIO3: true, // Allow Engine.IO v3 clients for compatibility
  pingTimeout: 60000,
  pingInterval: 25000,
});

setupSocketIO(io);

// Initialize cleanup service
CleanupService.init();

server.listen(PORT, "0.0.0.0", async () => {
  // Configuration validation
  const requiredEnvVars = ['DATABASE_URL', 'JWT_SECRET'];
  const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

  // Database health check
  let dbStatus = 'unknown';
  try {
    await db.execute(sql`SELECT 1`);
    dbStatus = 'connected';
  } catch (error) {
    dbStatus = 'failed';
    logger.error('Database connection failed during startup', error);
  }

  // Service status
  const translationConfigured = !!process.env.GOOGLE_CLOUD_PROJECT_ID;

  // Startup time
  const startupTime = Date.now() - startupStart;

  logger.info('Server started successfully', {
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    port: PORT,
    host: '0.0.0.0',
    nodeVersion: process.version,
    processId: process.pid,
    memoryUsage: {
      heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB',
      heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + 'MB'
    },
    database: {
      status: dbStatus,
      type: 'PostgreSQL (Local)'
    },
    services: {
      translationService: translationConfigured ? 'configured' : 'not configured'
    },
    configuration: {
      corsPolicy: process.env.NODE_ENV === 'production' ? (process.env.FRONTEND_URL || 'restricted') : 'Allow all origins',
      jwtExpiration: '30 days',
      missingEnvVars: missingVars
    },
    startupTime: `${startupTime}ms`
  });

  // Fail hard on missing required configuration
  if (missingVars.length > 0) {
    logger.error('Server failed to start: missing required configuration', { missingVars });
    process.exit(1);
  }
  if (dbStatus === 'failed') {
    logger.error('Server started but database connection failed');
  }
});