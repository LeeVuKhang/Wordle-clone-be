/**
 * Auth Controller — HTTP handlers for authentication endpoints
 *
 * Cookie strategy:
 *   - access_token:  httpOnly, Secure, SameSite=None (cross-origin Vercel/Railway)
 *   - refresh_token: httpOnly, Secure, SameSite=None, Path=/api/auth/refresh
 *
 * @see WBS Tasks 7.4, 7.5, 7.6
 */

import { Request, Response, NextFunction } from 'express';
import * as authService from './auth.service.js';
import type {
    GoogleAuthRequestDTO,
    MergeRequestDTO,
} from './auth.types.js';

const IS_PROD = process.env.NODE_ENV === 'production';

/** Shared cookie options for cross-origin Vercel ↔ Railway setup */
function cookieOptions(maxAge: number, path = '/') {
    return {
        httpOnly: true,
        secure: IS_PROD,                       // HTTPS only in production
        sameSite: IS_PROD ? 'none' as const : 'lax' as const, // cross-origin in prod
        maxAge: maxAge * 1000,                 // ms
        path,
    };
}

// ============================================================
// POST /api/auth/google (Task 7.4)
// ============================================================

export async function googleAuth(
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> {
    try {
        const { code, redirectUri } = req.body as GoogleAuthRequestDTO;

        if (!code || !redirectUri) {
            res.status(400).json({
                error: {
                    code: 'VALIDATION_ERROR',
                    message: 'code and redirectUri are required',
                },
            });
            return;
        }

        const result = await authService.authenticateWithGoogle(code, redirectUri);

        // Set cookies
        res.cookie(
            'access_token',
            result.accessToken,
            cookieOptions(authService.ACCESS_TOKEN_MAX_AGE),
        );
        res.cookie(
            'refresh_token',
            result.refreshToken,
            cookieOptions(authService.REFRESH_TOKEN_MAX_AGE, '/api/auth/refresh'),
        );

        res.json({
            user: result.user,
            accessToken: result.accessToken,
            expiresAt: result.expiresAt,
        });
    } catch (err) {
        next(err);
    }
}

// ============================================================
// POST /api/auth/refresh (Task 7.5)
// ============================================================

export async function refresh(
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> {
    try {
        const refreshToken = req.cookies?.refresh_token;

        if (!refreshToken) {
            res.status(401).json({
                error: {
                    code: 'NO_REFRESH_TOKEN',
                    message: 'Refresh token cookie is missing',
                },
            });
            return;
        }

        const result = await authService.refreshAccessToken(refreshToken);

        // Rotate cookies
        res.cookie(
            'access_token',
            result.accessToken,
            cookieOptions(authService.ACCESS_TOKEN_MAX_AGE),
        );
        res.cookie(
            'refresh_token',
            result.refreshToken,
            cookieOptions(authService.REFRESH_TOKEN_MAX_AGE, '/api/auth/refresh'),
        );

        res.json({
            accessToken: result.accessToken,
            expiresAt: result.expiresAt,
        });
    } catch (err) {
        next(err);
    }
}

// ============================================================
// POST /api/auth/merge (Task 7.6)
// ============================================================

export async function mergeGuest(
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> {
    try {
        const { userId } = res.locals;
        if (!userId) {
            res.status(401).json({
                error: {
                    code: 'UNAUTHORIZED',
                    message: 'Must be authenticated to merge guest data',
                },
            });
            return;
        }

        const { guestUuid } = req.body as MergeRequestDTO;
        if (!guestUuid) {
            res.status(400).json({
                error: {
                    code: 'VALIDATION_ERROR',
                    message: 'guestUuid is required',
                },
            });
            return;
        }

        const result = await authService.mergeGuestData(userId, guestUuid);
        res.json(result);
    } catch (err) {
        next(err);
    }
}

// ============================================================
// POST /api/auth/logout
// ============================================================

export async function logout(
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> {
    try {
        const { userId } = res.locals;
        if (userId) {
            await authService.revokeTokens(userId);
        }

        // Clear cookies
        res.clearCookie('access_token', { path: '/' });
        res.clearCookie('refresh_token', { path: '/api/auth/refresh' });

        res.json({ message: 'Logged out successfully' });
    } catch (err) {
        next(err);
    }
}

// ============================================================
// GET /api/auth/me
// ============================================================

export async function getMe(
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> {
    try {
        const { userId } = res.locals;
        if (!userId) {
            res.status(401).json({
                error: {
                    code: 'UNAUTHORIZED',
                    message: 'Authentication required',
                },
            });
            return;
        }

        const profile = await authService.getProfile(userId);
        res.json(profile);
    } catch (err) {
        next(err);
    }
}
