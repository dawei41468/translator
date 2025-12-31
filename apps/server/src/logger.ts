import winston from 'winston';

const { combine, timestamp, printf, colorize, align } = winston.format;

const logFormat = printf(({ level, message, timestamp, ...metadata }) => {
  let msg = `${timestamp} [${level}] : ${message} `;
  if (Object.keys(metadata).length > 0) {
    msg += JSON.stringify(metadata);
  }
  return msg;
});

const loggerInstance = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: combine(
    colorize({ all: true }),
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    align(),
    logFormat
  ),
  transports: [new winston.transports.Console()],
});

export interface LogContext {
  user?: {
    id: string;
    email?: string;
  };
  request?: {
    method: string;
    url: string;
    ip?: string;
  };
  response?: {
    statusCode: number;
    duration?: number;
  };
  [key: string]: any;
}

export const logger = {
  info: (message: string, context?: LogContext) => {
    loggerInstance.info(message, context);
  },
  warn: (message: string, context?: LogContext) => {
    loggerInstance.warn(message, context);
  },
  error: (message: string, error?: any, context?: LogContext) => {
    loggerInstance.error(message, { ...context, error: error instanceof Error ? error.stack : error });
  },
  debug: (message: string, context?: LogContext) => {
    loggerInstance.debug(message, context);
  }
};

export const getRequestContext = (req: any): LogContext => {
  return {
    user: req.user ? { id: req.user.id, email: req.user.email } : undefined,
    request: {
      method: req.method,
      url: req.originalUrl || req.url,
      ip: req.ip,
    },
  };
};
