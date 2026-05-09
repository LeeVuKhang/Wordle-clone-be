/**
 * Auth Service — Authentication & Guest Data Merging business logic
 *
 * Handles:
 *   - Google OAuth 2.0 token exchange (Task 7.4)
 *   - JWT access + refresh token lifecycle (Task 7.5)
 *   - Guest → Authenticated user data merge (Task 7.6)
 *
 * Security decisions:
 *   - Access token: 15min, delivered via httpOnly cookie + response body
 *   - Refresh token: 7d, stored as bcrypt hash in DB (never sent to client raw after initial set)
 *   - Refresh rotation: old token invalidated on each refresh call
 *
 * @see WBS Phase 7
 */

import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { OAuth2Client } from 'google-auth-library';
import { prisma } from '../../lib/prisma.js';
import { calculateStreaks } from '../game/game.service.js';
import type {
    JwtPayload,
    GoogleProfile,
    AuthResponseDTO,
    RefreshResponseDTO,
    MergeResponseDTO,
} from './auth.types.js';
import { InvalidTokenError, OAuthError } from './auth.types.js';

// ============================================================
// Configuration
// ============================================================

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY = '7d';

/** Seconds until access token expires (for cookie maxAge) */
const ACCESS_TOKEN_MAX_AGE = 15 * 60;           // 15 minutes
const REFRESH_TOKEN_MAX_AGE = 7 * 24 * 60 * 60; // 7 days

const googleClient = new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
);

// ============================================================
// Google OAuth (Task 7.4)
// ============================================================

/**
 * Exchange a Google OAuth authorization code for user profile data.
 * Returns the internal user record (created if first login).
 */
export async function authenticateWithGoogle(
    code: string,
    redirectUri: string,
): Promise<AuthResponseDTO & { refreshToken: string }> {
    // Exchange authorization code for tokens
    let googleProfile: GoogleProfile;
    try {
        const { tokens } = await googleClient.getToken({
            code,
            redirect_uri: redirectUri,
        });

        if (!tokens.id_token) {
            throw new OAuthError('No ID token received from Google');
        }

        // Verify the ID token
        const ticket = await googleClient.verifyIdToken({
            idToken: tokens.id_token,
            audience: process.env.GOOGLE_CLIENT_ID,
        });

        const payload = ticket.getPayload();
        if (!payload || !payload.email) {
            throw new OAuthError('Invalid Google token payload');
        }

        googleProfile = {
            googleId: payload.sub,
            email: payload.email,
            name: payload.name,
        };
    } catch (err) {
        if (err instanceof OAuthError) throw err;
        throw new OAuthError(
            `Google OAuth exchange failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
        );
    }

    // Find or create user
    let user = await prisma.user.findFirst({
        where: {
            OR: [
                { email: googleProfile.email },
                { oauthProvider: 'google', oauthId: googleProfile.googleId },
            ],
        },
    });

    if (!user) {
        user = await prisma.user.create({
            data: {
                email: googleProfile.email,
                username: googleProfile.name || null,
                oauthProvider: 'google',
                oauthId: googleProfile.googleId,
            },
        });
    } else if (!user.oauthId) {
        // Link OAuth to existing email-matched user
        user = await prisma.user.update({
            where: { id: user.id },
            data: {
                oauthProvider: 'google',
                oauthId: googleProfile.googleId,
                username: user.username || googleProfile.name || null,
            },
        });
    }

    // Issue token pair
    const { accessToken, refreshToken, expiresAt } = await issueTokenPair(user.id, user.email);

    return {
        user: {
            id: user.id,
            email: user.email,
            username: user.username,
        },
        accessToken,
        refreshToken,
        expiresAt,
    };
}

// ============================================================
// JWT Token Lifecycle (Task 7.5)
// ============================================================

/**
 * Issue a new access + refresh token pair.
 * The refresh token hash is persisted in the User record.
 */
export async function issueTokenPair(
    userId: string,
    email: string,
): Promise<{ accessToken: string; refreshToken: string; expiresAt: string }> {
    const accessPayload: JwtPayload = { sub: userId, email, type: 'access' };
    const refreshPayload: JwtPayload = { sub: userId, email, type: 'refresh' };

    const accessToken = jwt.sign(accessPayload, JWT_SECRET, {
        expiresIn: ACCESS_TOKEN_EXPIRY,
    });

    const refreshToken = jwt.sign(refreshPayload, JWT_SECRET, {
        expiresIn: REFRESH_TOKEN_EXPIRY,
    });

    // Hash refresh token before storing (WBS 7.5 — "hashed before DB storage")
    const refreshHash = await bcrypt.hash(refreshToken, 10);
    await prisma.user.update({
        where: { id: userId },
        data: { refreshTokenHash: refreshHash },
    });

    const expiresAt = new Date(Date.now() + ACCESS_TOKEN_MAX_AGE * 1000).toISOString();

    return { accessToken, refreshToken, expiresAt };
}

/**
 * Verify and decode an access token.
 * @throws InvalidTokenError if token is expired or malformed
 */
export function verifyAccessToken(token: string): JwtPayload {
    try {
        const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
        if (decoded.type !== 'access') {
            throw new InvalidTokenError('Token is not an access token');
        }
        return decoded;
    } catch (err) {
        if (err instanceof InvalidTokenError) throw err;
        throw new InvalidTokenError(
            err instanceof jwt.TokenExpiredError
                ? 'Access token expired'
                : 'Invalid access token',
        );
    }
}

/**
 * Refresh an access token using a valid refresh token.
 * Implements rotation: old refresh token is invalidated, new pair is issued.
 *
 * @see WBS Task 7.5
 */
export async function refreshAccessToken(
    refreshToken: string,
): Promise<RefreshResponseDTO & { refreshToken: string }> {
    // Decode without full verification first to get userId
    let decoded: JwtPayload;
    try {
        decoded = jwt.verify(refreshToken, JWT_SECRET) as JwtPayload;
        if (decoded.type !== 'refresh') {
            throw new InvalidTokenError('Token is not a refresh token');
        }
    } catch (err) {
        if (err instanceof InvalidTokenError) throw err;
        throw new InvalidTokenError(
            err instanceof jwt.TokenExpiredError
                ? 'Refresh token expired — please re-authenticate'
                : 'Invalid refresh token',
        );
    }

    // Verify against stored hash
    const user = await prisma.user.findUnique({
        where: { id: decoded.sub },
        select: { id: true, email: true, refreshTokenHash: true },
    });

    if (!user || !user.refreshTokenHash) {
        throw new InvalidTokenError('Refresh token has been revoked');
    }

    const isValid = await bcrypt.compare(refreshToken, user.refreshTokenHash);
    if (!isValid) {
        // Possible token reuse attack — revoke all tokens
        await prisma.user.update({
            where: { id: user.id },
            data: { refreshTokenHash: null },
        });
        throw new InvalidTokenError('Refresh token reuse detected — all sessions revoked');
    }

    // Rotate: issue new pair
    const tokens = await issueTokenPair(user.id, user.email);

    return {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresAt,
    };
}

/**
 * Revoke all tokens for a user (logout).
 */
export async function revokeTokens(userId: string): Promise<void> {
    await prisma.user.update({
        where: { id: userId },
        data: { refreshTokenHash: null },
    });
}

// ============================================================
// Guest Data Merge (Task 7.6)
// ============================================================

/**
 * Migrate guest DailyGame records to the authenticated user.
 *
 * Strategy (from WBS):
 *   - Transfer games where the user doesn't already have a game for that date
 *   - Skip (drop) guest records that violate the [userId, gameDate] unique constraint
 *   - Recalculate streaks from consolidated records
 *   - Return merge report
 */
export async function mergeGuestData(
    userId: string,
    guestUuid: string,
): Promise<MergeResponseDTO> {
    // Fetch all guest games
    const guestGames = await prisma.dailyGame.findMany({
        where: { guestUuid },
        orderBy: { gameDate: 'asc' },
    });

    if (guestGames.length === 0) {
        // Nothing to merge — still recalculate streaks for consistency
        await calculateStreaks(userId);
        const user = await prisma.user.findUniqueOrThrow({
            where: { id: userId },
            select: { currentStreak: true, maxStreak: true },
        });

        return {
            merged: { gamesTransferred: 0, gamesSkipped: 0 },
            stats: { currentStreak: user.currentStreak, maxStreak: user.maxStreak },
        };
    }

    // Find which dates the user already has games for
    const existingUserGames = await prisma.dailyGame.findMany({
        where: { userId },
        select: { gameDate: true },
    });
    const existingDates = new Set(
        existingUserGames.map((g) => g.gameDate.toISOString().slice(0, 10)),
    );

    let gamesTransferred = 0;
    let gamesSkipped = 0;

    // Transfer games in a transaction
    await prisma.$transaction(async (tx) => {
        for (const game of guestGames) {
            const dateKey = game.gameDate.toISOString().slice(0, 10);

            if (existingDates.has(dateKey)) {
                // User already has a game for this date — drop the guest record
                gamesSkipped++;
                // Delete the conflicting guest game and its guesses (cascade)
                await tx.dailyGame.delete({ where: { id: game.id } });
            } else {
                // Transfer ownership: guest → user
                await tx.dailyGame.update({
                    where: { id: game.id },
                    data: {
                        userId,
                        guestUuid: null, // Clear guest identity
                    },
                });
                gamesTransferred++;
            }
        }
    });

    // Recalculate streaks from consolidated records (WBS merge strategy)
    await calculateStreaks(userId);

    const user = await prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { currentStreak: true, maxStreak: true },
    });

    return {
        merged: { gamesTransferred, gamesSkipped },
        stats: { currentStreak: user.currentStreak, maxStreak: user.maxStreak },
    };
}

/**
 * Get the current authenticated user's profile.
 */
export async function getProfile(userId: string) {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
            id: true,
            email: true,
            username: true,
            currentStreak: true,
            maxStreak: true,
            createdAt: true,
        },
    });

    if (!user) {
        throw new InvalidTokenError('User not found');
    }

    return user;
}

// ============================================================
// Exports for cookie configuration
// ============================================================

export { ACCESS_TOKEN_MAX_AGE, REFRESH_TOKEN_MAX_AGE };
