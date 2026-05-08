/**
 * Upstash Redis Client (Singleton)
 *
 * Uses @upstash/redis HTTP client which is serverless-safe (no persistent
 * TCP connections). Configured via environment variables.
 *
 * Redis Key Strategy (from WBS):
 *   daily:word          → { id, word } JSON       (TTL: 25h)
 *   daily:word:date     → date string             (TTL: 25h)
 *   leaderboard:data    → Sorted Set              (TTL: 10min)
 *   leaderboard:refresh → sentinel                (TTL: 5min)
 *   rate:guest:{uuid}   → counter                 (TTL: 1min, max 60 req)
 *   rate:user:{id}      → counter                 (TTL: 1min, max 60 req)
 *   practice:{id}       → { word, guesses } JSON  (TTL: 30min)
 *
 * @see WBS Task 5.5, 5.6
 */

import { Redis } from '@upstash/redis';

// Validate required environment variables
function validateRedisConfig(): void {
    if (!process.env.UPSTASH_REDIS_REST_URL) {
        console.warn('⚠️  UPSTASH_REDIS_REST_URL is not set. Redis features will be unavailable.');
    }
    if (!process.env.UPSTASH_REDIS_REST_TOKEN) {
        console.warn('⚠️  UPSTASH_REDIS_REST_TOKEN is not set. Redis features will be unavailable.');
    }
}

// Singleton instance
const globalForRedis = globalThis as unknown as {
    redis: Redis | undefined;
};

function createRedisClient(): Redis {
    validateRedisConfig();

    return new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL || '',
        token: process.env.UPSTASH_REDIS_REST_TOKEN || '',
    });
}

export const redis =
    globalForRedis.redis ??
    createRedisClient();

if (process.env.NODE_ENV !== 'production') {
    globalForRedis.redis = redis;
}

// ============================================================
// Redis Key Constants & TTL (in seconds)
// ============================================================

export const REDIS_KEYS = {
    /** Daily word JSON: { id: string, word: string } */
    DAILY_WORD: 'daily:word',
    /** Daily word date string for cache validation */
    DAILY_WORD_DATE: 'daily:word:date',
    /** Leaderboard sorted set (top 100 by maxStreak) */
    LEADERBOARD_DATA: 'leaderboard:data',
    /** Leaderboard refresh sentinel (stampede prevention) */
    LEADERBOARD_REFRESH: 'leaderboard:refresh',
    /** Rate limit counter for guest users */
    rateGuest: (uuid: string) => `rate:guest:${uuid}`,
    /** Rate limit counter for authenticated users */
    rateUser: (id: string) => `rate:user:${id}`,
    /** Practice session data */
    practice: (id: string) => `practice:${id}`,
} as const;

export const REDIS_TTL = {
    /** Daily word TTL: 25 hours (buffer for late cronjob) */
    DAILY_WORD: 25 * 60 * 60,       // 90000 seconds
    /** Leaderboard data TTL: 10 minutes */
    LEADERBOARD_DATA: 10 * 60,       // 600 seconds
    /** Leaderboard refresh sentinel TTL: 5 minutes */
    LEADERBOARD_REFRESH: 5 * 60,     // 300 seconds
    /** Rate limit window: 1 minute */
    RATE_LIMIT: 60,                   // 60 seconds
    /** Practice session TTL: 30 minutes */
    PRACTICE_SESSION: 30 * 60,        // 1800 seconds
} as const;

/** Maximum requests per rate-limit window */
export const RATE_LIMIT_MAX = 60;
