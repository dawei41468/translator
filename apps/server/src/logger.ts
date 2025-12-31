import winston from 'winston';
import type { Request } from 'express';

interface LogContext {
  userId?: string;
  businessUnit?: string;
  ip?: string;
  user?: {
    id?: string;
    email?: string;
    businessUnit?: string;
    role?: string;
  };
  request?: {
    method: string;
    url: string;
    ip: string;
    userAgent?: string;
  };
  response?: {
    statusCode: number;
    duration: number;
  };
  error?: Error | { message: string, stack?: string };
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

// Enhanced human-readable format with grouped context
const humanReadableFormat = winston.format.printf(({ timestamp, level, message, ...data }) => {
  const ctx = data as any;
  const levelUpper = level.toUpperCase().padEnd(7);

  // Main log line
  let output = `${timestamp} [${levelUpper}]: ${message}\n`;

  // User context
  if (ctx.user) {
    const userStr = ctx.user.email ? `${ctx.user.email} (${ctx.user.businessUnit || 'N/A'})` : ctx.user.id || 'Unknown';
    output += `  User: ${userStr}\n`;
  }

  // Request context
  if (ctx.request) {
    output += `  Request: ${ctx.request.method} ${ctx.request.url} from ${ctx.request.ip}\n`;
  }

  // Response context
  if (ctx.response) {
    output += `  Response: ${ctx.response.statusCode} in ${ctx.response.duration}ms\n`;
  }

  // Error context
  if (ctx.error) {
    const errMsg = typeof ctx.error === 'string' ? ctx.error : ctx.error.message;
    output += `  Error: ${errMsg}\n`;
    if (ctx.error.stack) {
      const stackLines = ctx.error.stack.split('\n');
      output += `  Stack Trace:\n`;
      stackLines.forEach((line: string) => {
        output += `    ${line}\n`;
      });
    }
  }

  // Metadata / Extra fields (excluding fields already handled)
  const handledFields = ['user', 'request', 'response', 'error', 'service', 'timestamp', 'level', 'message'];
  const metadata: Record<string, unknown> = {};

  Object.keys(ctx).forEach(key => {
    if (!handledFields.includes(key)) {
      metadata[key] = ctx[key];
    }
  });

  if (Object.keys(metadata).length > 0) {
    output += `  Metadata:\n`;
    Object.entries(metadata).forEach(([key, value]) => {
      const formattedValue = typeof value === 'object'
        ? JSON.stringify(value, null, 2).split('\n').join('\n    ')
        : String(value);
      output += `    ${key}: ${formattedValue}\n`;
    });
  }

  return output.trim();
});

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'oneproject-server' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize({ all: true }),
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.errors({ stack: true }),
        humanReadableFormat
      )
    }),
  ],
});

export function logInfo(message: string, context?: LogContext) {
  logger.info(message, context);
}

export function logWarn(message: string, context?: LogContext) {
  logger.warn(message, context);
}

export function logError(message: string, error?: Error | unknown, context?: LogContext) {
  const errObj = error instanceof Error ? error : (error ? new Error(String(error)) : undefined);
  logger.error(message, {
    ...context,
    error: errObj,
  });
}

export function getRequestContext(req: Request): LogContext {
  const context: LogContext = {};

  if (req.user) {
    context.user = {
      id: req.user.id,
      email: req.user.email ?? undefined,
      businessUnit: req.user.businessUnit ?? undefined,
      role: req.user.role ?? undefined,
    };
  }

  // Get IP address
  context.ip = req.ip ||
    (req.connection as any)?.remoteAddress ||
    (req.socket as any)?.remoteAddress ||
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    'unknown';

  return context;
}

export default logger;