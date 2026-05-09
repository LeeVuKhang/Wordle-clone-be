/**
 * Practice Service — Server-side word comparison for practice mode
 *
 * Uses Redis sessions (TTL: 30min), no DB writes, no streak impact.
 *
 * @see WBS Tasks 6B.1–6B.3
 */

import { prisma } from '../../lib/prisma.js';
import { redis, REDIS_KEYS, REDIS_TTL } from '../../lib/redis.js';
import type { LetterResult, PracticeGuessResultDTO } from '../game/game.types.js';
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';

interface PracticeSession {
    word: string;
    guesses: string[];
}

// ============================================================
// POST /api/practice/new (WBS 6B.1)
// ============================================================

export async function createSession(): Promise<{ practiceId: string }> {
    // Pick random answer word from wordle-dictionary.txt
    const dictPath = path.join(process.cwd(), 'src', 'data', 'wordle-dictionary.txt');
    const dictContent = fs.readFileSync(dictPath, 'utf-8');
    const availableWords = dictContent
        .split('\n')
        .map(w => w.trim().toUpperCase())
        .filter(w => w.length === 5);

    if (availableWords.length === 0) {
        throw new Error('No answer words found in dictionary.');
    }

    const word = availableWords[Math.floor(Math.random() * availableWords.length)];

    const practiceId = `prac_${randomUUID().slice(0, 12)}`;
    const session: PracticeSession = { word: word, guesses: [] };

    await redis.set(REDIS_KEYS.practice(practiceId), session, {
        ex: REDIS_TTL.PRACTICE_SESSION,
    });

    return { practiceId };
}

// ============================================================
// POST /api/practice/guess (WBS 6B.2)
// ============================================================

export async function submitGuess(
    practiceId: string,
    guess: string
): Promise<PracticeGuessResultDTO> {
    const session = await redis.get<PracticeSession>(REDIS_KEYS.practice(practiceId));

    if (!session) {
        throw new PracticeSessionExpiredError();
    }

    const normalizedGuess = guess.toUpperCase();
    const result = compareWord(normalizedGuess, session.word);
    session.guesses.push(normalizedGuess);

    const isWon = normalizedGuess === session.word;
    const isLost = !isWon && session.guesses.length >= 6;
    const status = isWon ? 'WON' : isLost ? 'LOST' : 'PLAYING';

    if (isWon || isLost) {
        // Clean up session on completion
        await redis.del(REDIS_KEYS.practice(practiceId));
    } else {
        // Update session with new guess, keep existing TTL
        await redis.set(REDIS_KEYS.practice(practiceId), session, {
            ex: REDIS_TTL.PRACTICE_SESSION,
        });
    }

    return {
        result,
        attempts: session.guesses.length,
        status,
    };
}

// ============================================================
// Word Comparison (server-side, for practice mode only)
// ============================================================

export function compareWord(guess: string, target: string): LetterResult[] {
    const result: LetterResult[] = Array(5).fill(null).map(() => ({
        letter: '',
        status: 'absent' as const,
    }));
    const targetChars = target.split('');
    const used = new Array(5).fill(false);

    // First pass: mark correct positions
    for (let i = 0; i < 5; i++) {
        result[i].letter = guess[i];
        if (guess[i] === targetChars[i]) {
            result[i].status = 'correct';
            used[i] = true;
        }
    }

    // Second pass: mark present (wrong position)
    for (let i = 0; i < 5; i++) {
        if (result[i].status === 'correct') continue;
        for (let j = 0; j < 5; j++) {
            if (!used[j] && guess[i] === targetChars[j]) {
                result[i].status = 'present';
                used[j] = true;
                break;
            }
        }
    }

    return result;
}

// ============================================================
// Custom Errors
// ============================================================

export class PracticeSessionExpiredError extends Error {
    constructor() {
        super('Practice session expired or not found');
        this.name = 'PracticeSessionExpiredError';
    }
}
