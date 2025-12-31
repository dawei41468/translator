import { sql } from "drizzle-orm";
import { db } from "../../../packages/db/src/index.js";
import { rooms } from "../../../packages/db/src/schema.js";
// import { logError, logInfo, logWarn } from "./logger.js";
import { app } from "./app.js";
import { createServer } from "http";
import { Server } from "socket.io";
import { setupSocketIO } from "./socket.js";
import cron from "node-cron";

const startupStart = Date.now();
const PORT = Number(process.env.PORT) || 3003;

const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: true,
    credentials: true,
  },
});

setupSocketIO(io);

// Schedule room cleanup every hour
cron.schedule('0 * * * *', async () => {
  try {
    await db.execute(sql`update rooms set deleted_at = now() where created_at < now() - interval '24 hours' and deleted_at is null`);
    console.log('Room cleanup completed');
  } catch (error) {
    console.error('Error cleaning up rooms:', error);
  }
});

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
    console.error('Database connection failed during startup', error);
  }

  // Service status
  const translationConfigured = !!process.env.GOOGLE_TRANSLATE_API_KEY;

  // Startup time
  const startupTime = Date.now() - startupStart;

  console.log('Server started successfully', {
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
      corsPolicy: 'Allow all origins',
      jwtExpiration: '30 days',
      missingEnvVars: missingVars
    },
    startupTime: `${startupTime}ms`,
    timestamp: new Date().toISOString()
  });

  // Log warnings for missing config
  if (missingVars.length > 0) {
    console.warn('Server started with missing configuration', { missingVars });
  }
  if (dbStatus === 'failed') {
    console.error('Server started but database connection failed');
  }
});