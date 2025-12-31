import { Request, Response, NextFunction } from 'express';
import { logger, getRequestContext } from '../logger.js';

export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();

  // Log request start in debug mode
  logger.debug('Request started', getRequestContext(req));

  res.on('finish', () => {
    const duration = Date.now() - start;
    const context = {
      ...getRequestContext(req),
      response: {
        statusCode: res.statusCode,
        duration,
      },
    };

    const message = `Request completed`;
    
    if (res.statusCode >= 500) {
      logger.error(message, undefined, context);
    } else if (res.statusCode >= 400) {
      logger.warn(message, context);
    } else {
      logger.info(message, context);
    }
  });

  next();
};
