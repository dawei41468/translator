interface LogContext {
  userId?: string;
  businessUnit?: string;
  [key: string]: unknown;
}

class Logger {
  private getTimestamp(): string {
    return new Date().toISOString();
  }

  private formatMessage(level: string, message: string, context?: LogContext): string {
    const timestamp = this.getTimestamp();
    const contextStr = context ? ` | ${JSON.stringify(context)}` : '';
    return `[${timestamp}] ${level.toUpperCase()}: ${message}${contextStr}`;
  }

  info(message: string, context?: LogContext) {
    console.log(this.formatMessage('info', message, context));
  }

  warn(message: string, context?: LogContext) {
    console.warn(this.formatMessage('warn', message, context));
  }

  error(message: string, error?: Error, context?: LogContext) {
    const errorContext = error ? { ...context, error: error.message, stack: error.stack } : context;
    console.error(this.formatMessage('error', message, errorContext));
  }

  // Specific logging methods for common events
  userAction(action: string, context?: LogContext) {
    this.info(`User action: ${action}`, context);
  }

  apiError(endpoint: string, error: string, context?: LogContext) {
    this.error(`API Error on ${endpoint}: ${error}`, undefined, context);
  }

  conflictAlert(message: string, context?: LogContext) {
    this.warn(`Conflict alert shown: ${message}`, context);
  }

  buttonClick(buttonName: string, context?: LogContext) {
    this.info(`Button clicked: ${buttonName}`, context);
  }
}

export const logger = new Logger();