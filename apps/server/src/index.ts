import { sql } from "drizzle-orm";
import { db } from "../../../packages/db/src/index.js";
import { logError, logInfo, logWarn } from "./logger.js";
import { app } from "./app.js";

const startupStart = Date.now();
const PORT = Number(process.env.PORT) || 3003;

app.listen(PORT, "0.0.0.0", async () => {
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
    logError('Database connection failed during startup', error as Error);
  }

  // Service status
  const translationConfigured = !!process.env.GOOGLE_TRANSLATE_API_KEY;

  // Startup time
  const startupTime = Date.now() - startupStart;

  logInfo('Server started successfully', {
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
    logWarn('Server started with missing configuration', { missingVars });
  }
  if (dbStatus === 'failed') {
    logError('Server started but database connection failed');
  }
});