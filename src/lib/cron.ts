/**
 * Cron Service — Daily word rotation at 00:00 UTC
 *
 * Selects unused answer word from WordBank, writes to DailyWord table,
 * then sets in Redis cache. Order: DB first → Redis (prevents orphaned cache keys).
 *
 * @see WBS Task 6A.1
 */

import { prisma } from './prisma.js';
import { redis, REDIS_KEYS, REDIS_TTL } from './redis.js';

/**
 * Select and publish today's daily word.
 * Called by node-cron at 00:00 UTC and on server startup (health check).
 */
export async function selectDailyWord(): Promise<void> {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    // Check if today's word already exists
    const existing = await prisma.dailyWord.findUnique({
        where: { gameDate: today },
    });

    if (existing) {
        // Ensure Redis is populated
        try {
            await redis.set(REDIS_KEYS.DAILY_WORD, { id: existing.id, word: existing.word }, {
                ex: REDIS_TTL.DAILY_WORD,
            });
            await redis.set(REDIS_KEYS.DAILY_WORD_DATE, today.toISOString().slice(0, 10), {
                ex: REDIS_TTL.DAILY_WORD,
            });
        } catch {
            console.warn('Failed to update Redis cache for existing daily word');
        }
        console.log(`Daily word already set for ${today.toISOString().slice(0, 10)}: ${existing.word}`);
        return;
    }

    // Find all previously used words
    const usedWords = await prisma.dailyWord.findMany({
        select: { word: true },
    });
    const usedSet = new Set(usedWords.map(w => w.word));

    // Pick random unused answer word
    const availableWords = await prisma.wordBank.findMany({
        where: { isAnswer: true },
        select: { word: true },
    });

    const candidates = availableWords.filter(w => !usedSet.has(w.word));
    if (candidates.length === 0) {
        console.error('CRITICAL: No unused answer words available!');
        throw new Error('Word bank exhausted');
    }

    const selected = candidates[Math.floor(Math.random() * candidates.length)];

    // Step 1: Write to DB first (prevents orphaned cache keys)
    const dailyWord = await prisma.dailyWord.create({
        data: {
            word: selected.word,
            gameDate: today,
        },
    });

    // Step 2: Set in Redis
    try {
        await redis.set(REDIS_KEYS.DAILY_WORD, { id: dailyWord.id, word: dailyWord.word }, {
            ex: REDIS_TTL.DAILY_WORD,
        });
        await redis.set(REDIS_KEYS.DAILY_WORD_DATE, today.toISOString().slice(0, 10), {
            ex: REDIS_TTL.DAILY_WORD,
        });
    } catch {
        console.warn('Failed to set daily word in Redis (DB write succeeded)');
    }

    console.log(`Daily word set for ${today.toISOString().slice(0, 10)}: ${dailyWord.word}`);
}
