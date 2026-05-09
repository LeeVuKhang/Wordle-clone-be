/**
 * Error Middleware — Global error handler with structured JSON responses
 *
 * Maps known error types to appropriate HTTP status codes.
 * Includes correlation IDs for request tracing.
 *
 * @see WBS Task 6C.3, 7.5
 */

import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { GameNotFoundError, ForbiddenError } from '../modules/game/game.service.js';
import { PracticeSessionExpiredError } from '../modules/practice/practice.service.js';
import { InvalidTokenError, OAuthError, MergeConflictError } from '../modules/auth/auth.types.js';

export function errorMiddleware(
    err: Error,
    req: Request,
    res: Response,
    _next: NextFunction
): void {
    const correlationId = (req.headers['x-correlation-id'] as string) || `req-${randomUUID().slice(0, 8)}`;

    // Map known errors to HTTP status codes
    let statusCode = 500;
    let code = 'INTERNAL_ERROR';

    if (err instanceof GameNotFoundError) {
        statusCode = 404;
        code = 'GAME_NOT_FOUND';
    } else if (err instanceof ForbiddenError) {
        statusCode = 403;
        code = 'FORBIDDEN';
    } else if (err instanceof PracticeSessionExpiredError) {
        statusCode = 410;
        code = 'PRACTICE_SESSION_EXPIRED';
    } else if (err instanceof InvalidTokenError) {
        statusCode = 401;
        code = 'INVALID_TOKEN';
    } else if (err instanceof OAuthError) {
        statusCode = 401;
        code = 'OAUTH_ERROR';
    } else if (err instanceof MergeConflictError) {
        statusCode = 409;
        code = 'MERGE_CONFLICT';
    } else if (err.name === 'ValidationError') {
        statusCode = 400;
        code = 'VALIDATION_ERROR';
    }

    // Log error (structured)
    console.error(JSON.stringify({
        timestamp: new Date().toISOString(),
        correlationId,
        method: req.method,
        path: req.path,
        statusCode,
        error: err.message,
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    }));

    res.status(statusCode).json({
        error: {
            code,
            message: statusCode === 500 ? 'Internal server error' : err.message,
            correlationId,
        },
    });
}
