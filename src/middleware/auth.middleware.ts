/**
 * Auth Middleware — JWT verification + Guest UUID extraction
 *
 * Populates res.locals with userId (JWT) or guestUuid (X-Guest-ID header).
 * Does NOT reject unauthenticated requests — downstream handlers decide access.
 *
 * @see WBS Tasks 7.3, 7.5
 */

import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../modules/auth/auth.service.js';

/**
 * Identity extraction middleware (runs on every request).
 *
 * 1. Try JWT from httpOnly cookie `access_token`
 * 2. Fallback: Guest UUID from `X-Guest-ID` header
 *
 * Never rejects — just populates res.locals for downstream use.
 */
export function identityMiddleware(req: Request, res: Response, next: NextFunction): void {
    // ---- JWT from cookie ----
    const accessToken = req.cookies?.access_token;
    if (accessToken) {
        try {
            const payload = verifyAccessToken(accessToken);
            res.locals.userId = payload.sub;
            res.locals.userEmail = payload.email;
        } catch {
            // Token invalid or expired — treat as unauthenticated
            // FE should call POST /api/auth/refresh when it gets 401
        }
    }

    // ---- Fallback: Guest UUID ----
    if (!res.locals.userId) {
        const guestUuid = req.headers['x-guest-id'] as string | undefined;
        if (guestUuid && isValidUUID(guestUuid)) {
            res.locals.guestUuid = guestUuid;
        }
    }

    next();
}

/**
 * Require either authenticated user or guest identity.
 * Returns 401 if neither is present.
 */
export function requireIdentity(req: Request, res: Response, next: NextFunction): void {
    const { userId, guestUuid } = res.locals;
    if (!userId && !guestUuid) {
        res.status(401).json({
            error: {
                code: 'UNAUTHORIZED',
                message: 'Authentication or guest identity required',
            },
        });
        return;
    }
    next();
}

/**
 * Require authenticated user (JWT).
 * Returns 401 if not logged in.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
    if (!res.locals.userId) {
        res.status(401).json({
            error: {
                code: 'UNAUTHORIZED',
                message: 'Authentication required',
            },
        });
        return;
    }
    next();
}

// ============================================================
// Helpers
// ============================================================

/** Basic UUID v4 format validation for guest UUIDs (Task 7.3) */
function isValidUUID(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
