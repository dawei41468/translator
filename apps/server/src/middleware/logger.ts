import type { Request, Response, NextFunction } from 'express';
import { logInfo, getRequestContext } from '../logger.js';

export function requestLogger(req: Request, res: Response, next: NextFunction) {
    const start = Date.now();
    const path = req.path;
    const method = req.method;

    // Log incoming request
    // Note: req.user might not be populated yet if this middleware is before authenticate
    // but many routes are authenticated, so we try to get context
    const context = getRequestContext(req);

    logInfo(`→ ${method} ${path}`, {
        ...context,
        request: {
            method,
            url: path,
            ip: context.ip || 'unknown',
            userAgent: req.get('user-agent'),
        },
    });

    // Capture the original end function to log the response
    const originalEnd = res.end;

    // @ts-ignore
    res.end = function (chunk?: any, encoding?: string | (() => void), callback?: () => void) {
        const duration = Date.now() - start;
        const statusCode = res.statusCode;

        // Refresh context in case req.user was populated by authenticate middleware
        const responseContext = getRequestContext(req);

        logInfo(`← ${method} ${path} ${statusCode}`, {
            ...responseContext,
            request: {
                method,
                url: path,
                ip: responseContext.ip || 'unknown',
            },
            response: {
                statusCode,
                duration,
            },
        });

        return originalEnd.call(this, chunk, encoding as any, callback as any);
    };

    next();
}
