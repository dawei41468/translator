import winston from 'winston';

const { combine, timestamp, printf, colorize, align } = winston.format;

const logFormat = printf(({ level, message, timestamp, ...metadata }) => {
  const isProd = process.env.NODE_ENV === 'production';
  
  // ANSI colors for dev mode
  const reset = '\x1b[0m';
  const dim = '\x1b[2m';
  const yellow = '\x1b[33m';
  const cyan = '\x1b[36m';
  const blue = '\x1b[34m';

  if (isProd) {
    const metaStr = Object.keys(metadata).length > 0 ? ` ${JSON.stringify(metadata)}` : '';
    return `${timestamp} [${level}] : ${message}${metaStr}`;
  }

  // Development formatting
  let msg = `${dim}${timestamp}${reset} [${level}] : ${message}`;

  const entries = Object.entries(metadata);
  if (entries.length > 0) {
    msg += '\n' + entries
      .map(([key, value]) => {
        const formattedKey = `${yellow}${key}${reset}`;
        let valStr;
        
        if (typeof value === 'object' && value !== null) {
          // Pretty print objects with indentation and cyan values
          valStr = '\n' + JSON.stringify(value, null, 2)
            .split('\n')
            .map(line => {
              // Colorize values inside the JSON-like output for better visibility
              return line.replace(/: "(.*)"/g, `: "${cyan}$1${reset}"`)
                         .replace(/: (true|false|\d+)/g, `: ${blue}$1${reset}`);
            })
            .map(line => `    ${line}`)
            .join('\n');
        } else {
          valStr = ` ${cyan}${value}${reset}`;
        }
        
        return `  ${formattedKey}:${valStr}`;
      })
      .join('\n');
  }
  
  return msg;
});

const loggerInstance = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: combine(
    colorize(), // Colors the level property
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
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
