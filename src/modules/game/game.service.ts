/**
 * Game Service — Daily word system business logic
 *
 * Handles daily word retrieval (Redis → DB fallback),
 * game state sync, and streak calculation.
 *
 * @see WBS Tasks 6A.1–6A.7
 */

import { prisma } from '../../lib/prisma.js';
import { redis, REDIS_KEYS, REDIS_TTL } from '../../lib/redis.js';
import type { DailyGameResponseDTO, DailyGameSyncDTO } from './game.types.js';

// ============================================================
// Daily Word Retrieval (Redis cache → Neon fallback)
// ============================================================

interface CachedWord {
    id: string;
    word: string;
}

/**
 * Get today's daily word from Redis cache, falling back to DB.
 * @see Risk R1 — cronjob failure fallback
 */
async function getDailyWord(): Promise<CachedWord> {
    // Try Redis first
    try {
        const cached = await redis.get<CachedWord>(REDIS_KEYS.DAILY_WORD);
        if (cached) return cached;
    } catch {
        console.warn('Redis unavailable, falling back to DB');
    }

    // Fallback: query DB for today's word
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const dailyWord = await prisma.dailyWord.findUnique({
        where: { gameDate: today },
    });

    if (!dailyWord) {
        throw new Error('No daily word found for today. Cronjob may have failed.');
    }

    // Re-populate Redis cache
    const wordData: CachedWord = { id: dailyWord.id, word: dailyWord.word };
    try {
        await redis.set(REDIS_KEYS.DAILY_WORD, wordData, { ex: REDIS_TTL.DAILY_WORD });
    } catch {
        // Non-critical — cache write failure is acceptable
    }

    return wordData;
}

// ============================================================
// GET /api/game/today
// ============================================================

export async function getDailyGame(
    userId?: string,
    guestUuid?: string
): Promise<DailyGameResponseDTO> {
    const dailyWord = await getDailyWord();
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    // Find or create game for this user/guest today
    const whereClause = userId
        ? { userId_gameDate: { userId, gameDate: today } }
        : guestUuid
            ? { guestUuid_gameDate: { guestUuid, gameDate: today } }
            : null;

    if (!whereClause) {
        throw new Error('Either userId or guestUuid is required');
    }

    let game = await prisma.dailyGame.findUnique({
        where: whereClause,
        include: { guesses: { orderBy: { attemptNumber: 'asc' } } },
    });

    // Create new game if not exists
    if (!game) {
        game = await prisma.dailyGame.create({
            data: {
                userId: userId || undefined,
                guestUuid: guestUuid || undefined,
                gameDate: today,
                dailyWordId: dailyWord.id,
            },
            include: { guesses: { orderBy: { attemptNumber: 'asc' } } },
        });
    }

    return {
        id: game.id,
        word: Buffer.from(dailyWord.word).toString('base64'),
        guesses: game.guesses.map(g => g.guessWord),
        attempts: game.attempts,
        status: game.status,
    };
}

// ============================================================
// POST /api/game/sync
// ============================================================

export async function syncGame(
    dto: DailyGameSyncDTO,
    userId?: string,
    guestUuid?: string
): Promise<DailyGameResponseDTO> {
    const dailyWord = await getDailyWord();

    // Fetch existing game
    const game = await prisma.dailyGame.findUnique({
        where: { id: dto.id },
        include: { guesses: true },
    });

    if (!game) {
        throw new GameNotFoundError(dto.id);
    }

    // Verify ownership
    if (userId && game.userId !== userId) throw new ForbiddenError();
    if (guestUuid && game.guestUuid !== guestUuid) throw new ForbiddenError();

    // Idempotent: if already completed, return existing state (WBS 6A.6)
    if (game.status === 'WON' || game.status === 'LOST') {
        return {
            id: game.id,
            word: Buffer.from(dailyWord.word).toString('base64'),
            guesses: game.guesses.map(g => g.guessWord),
            attempts: game.attempts,
            status: game.status,
        };
    }

    // Upsert guesses
    const guessOps = dto.guesses.map((word, i) =>
        prisma.dailyGuess.upsert({
            where: { gameId_attemptNumber: { gameId: dto.id, attemptNumber: i + 1 } },
            update: { guessWord: word.toUpperCase() },
            create: {
                gameId: dto.id,
                guessWord: word.toUpperCase(),
                attemptNumber: i + 1,
            },
        })
    );

    // Update game state — attempts = guesses.length (WBS 6A.4)
    const isCompleted = dto.status === 'WON' || dto.status === 'LOST';
    const gameUpdate = prisma.dailyGame.update({
        where: { id: dto.id },
        data: {
            attempts: dto.guesses.length,
            status: dto.status,
            completedAt: isCompleted ? new Date() : undefined,
        },
    });

    // Execute all in transaction
    await prisma.$transaction([...guessOps, gameUpdate]);

    // Trigger streak calculation on game end (WBS 6A.7)
    if (isCompleted && userId) {
        await calculateStreaks(userId);
    }

    return {
        id: dto.id,
        word: Buffer.from(dailyWord.word).toString('base64'),
        guesses: dto.guesses.map(w => w.toUpperCase()),
        attempts: dto.guesses.length,
        status: dto.status,
    };
}

// ============================================================
// Streak Calculation (WBS 6A.7)
// ============================================================

export async function calculateStreaks(userId: string): Promise<void> {
    const games = await prisma.dailyGame.findMany({
        where: { userId, status: 'WON' },
        orderBy: { gameDate: 'desc' },
        select: { gameDate: true },
    });

    if (games.length === 0) {
        await prisma.user.update({
            where: { id: userId },
            data: { currentStreak: 0, maxStreak: 0 },
        });
        return;
    }

    // Calculate current streak (consecutive days from today/yesterday)
    let currentStreak = 0;
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    for (let i = 0; i < games.length; i++) {
        const gameDate = new Date(games[i].gameDate);
        gameDate.setUTCHours(0, 0, 0, 0);

        const expectedDate = new Date(today);
        expectedDate.setUTCDate(expectedDate.getUTCDate() - i);

        // Allow streak to start from today or yesterday
        if (i === 0) {
            const diffDays = Math.floor((today.getTime() - gameDate.getTime()) / (86400000));
            if (diffDays > 1) break;
            currentStreak = 1;
        } else {
            const prevDate = new Date(games[i - 1].gameDate);
            prevDate.setUTCHours(0, 0, 0, 0);
            const diff = Math.floor((prevDate.getTime() - gameDate.getTime()) / 86400000);
            if (diff === 1) {
                currentStreak++;
            } else {
                break;
            }
        }
    }

    // Calculate max streak
    let maxStreak = 0;
    let streak = 1;
    for (let i = 1; i < games.length; i++) {
        const prev = new Date(games[i - 1].gameDate);
        const curr = new Date(games[i].gameDate);
        prev.setUTCHours(0, 0, 0, 0);
        curr.setUTCHours(0, 0, 0, 0);
        const diff = Math.floor((prev.getTime() - curr.getTime()) / 86400000);
        if (diff === 1) {
            streak++;
        } else {
            maxStreak = Math.max(maxStreak, streak);
            streak = 1;
        }
    }
    maxStreak = Math.max(maxStreak, streak, currentStreak);

    await prisma.user.update({
        where: { id: userId },
        data: {
            currentStreak,
            maxStreak,
            lastDailyDate: new Date(),
        },
    });
}

// ============================================================
// Custom Errors
// ============================================================

export class GameNotFoundError extends Error {
    constructor(id: string) {
        super(`Game not found: ${id}`);
        this.name = 'GameNotFoundError';
    }
}

export class ForbiddenError extends Error {
    constructor() {
        super('Access denied');
        this.name = 'ForbiddenError';
    }
}
