/**
 * Auth Types — DTOs and interfaces for authentication module
 *
 * Covers Google OAuth, JWT token pairs, guest merging, and refresh flow.
 *
 * @see WBS Phase 7
 */

// ============================================================
// JWT Payload
// ============================================================

export interface JwtPayload {
    /** User CUID from the User model */
    sub: string;
    /** User email */
    email: string;
    /** Token type discriminator */
    type: 'access' | 'refresh';
    /** Issued-at (epoch seconds) — set automatically by jsonwebtoken */
    iat?: number;
    /** Expiration (epoch seconds) — set automatically by jsonwebtoken */
    exp?: number;
}

// ============================================================
// Google OAuth
// ============================================================

/** Profile data extracted from Google ID token */
export interface GoogleProfile {
    googleId: string;
    email: string;
    name?: string;
}

/** Request body for POST /api/auth/google */
export interface GoogleAuthRequestDTO {
    /** The Google OAuth authorization code (exchanged server-side) */
    code: string;
    /** The redirect URI used in the client-side OAuth flow */
    redirectUri: string;
}

/** Response for successful authentication */
export interface AuthResponseDTO {
    user: {
        id: string;
        email: string;
        username: string | null;
    };
    /** Access token (also set as httpOnly cookie) */
    accessToken: string;
    /** Expiry hint for the FE (ISO string) */
    expiresAt: string;
}

// ============================================================
// Refresh Token
// ============================================================

/** Response for POST /api/auth/refresh */
export interface RefreshResponseDTO {
    accessToken: string;
    expiresAt: string;
}

// ============================================================
// Guest Merge
// ============================================================

/** Request body for POST /api/auth/merge */
export interface MergeRequestDTO {
    /** Guest UUID from localStorage */
    guestUuid: string;
}

/** Response for POST /api/auth/merge */
export interface MergeResponseDTO {
    merged: {
        gamesTransferred: number;
        gamesSkipped: number;
    };
    stats: {
        currentStreak: number;
        maxStreak: number;
    };
}

// ============================================================
// Custom Auth Errors
// ============================================================

export class InvalidTokenError extends Error {
    constructor(message = 'Invalid or expired token') {
        super(message);
        this.name = 'InvalidTokenError';
    }
}

export class OAuthError extends Error {
    constructor(message = 'OAuth authentication failed') {
        super(message);
        this.name = 'OAuthError';
    }
}

export class MergeConflictError extends Error {
    constructor(message = 'Merge conflict — some games could not be transferred') {
        super(message);
        this.name = 'MergeConflictError';
    }
}
