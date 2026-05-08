/**
 * Auth Middleware — JWT verification + Guest UUID extraction
 *
 * Populates res.locals with userId (JWT) or guestUuid (X-Guest-ID header).
 * Does NOT reject unauthenticated requests — downstream handlers decide access.
 *
 * @see WBS Tasks 7.3, 7.5 (partial — full OAuth in Phase 7)
 */

import { Request, Response, NextFunction } from 'express';

export function identityMiddleware(req: Request, res: Response, next: NextFunction): void {
    // Try JWT from cookie first (Phase 7 will implement full JWT verification)
    // For now, placeholder — will be enhanced in Phase 7
    const accessToken = req.cookies?.access_token;
    if (accessToken) {
        // TODO: Phase 7 — verify JWT and set res.locals.userId
        // For now, skip JWT verification
    }

    // Fallback: Guest UUID from header
    const guestUuid = req.headers['x-guest-id'] as string | undefined;
    if (guestUuid) {
        res.locals.guestUuid = guestUuid;
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
