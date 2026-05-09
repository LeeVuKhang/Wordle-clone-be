/**
 * Game Types — DTOs and enums for the game module
 * @see WBS Task 6A, API.md
 */

// Re-export Prisma enum for convenience
export { GameStatus } from '../../generated/prisma/client.js';

/** Response DTO for GET /api/game/today and POST /api/game/sync */
export interface DailyGameResponseDTO {
    id: string;
    word: string;          // Base64-encoded
    guesses: string[];     // Array of 5-letter uppercase words
    attempts: number;
    status: 'PLAYING' | 'WON' | 'LOST';
}

/** Request DTO for POST /api/game/sync */
export interface DailyGameSyncDTO {
    id: string;
    guesses: string[];
    status: 'PLAYING' | 'WON' | 'LOST';
}

/** Letter comparison result (used by practice mode server-side) */
export interface LetterResult {
    letter: string;
    status: 'correct' | 'present' | 'absent';
}

/** Practice guess response */
export interface PracticeGuessResultDTO {
    result: LetterResult[];
    attempts: number;
    status: 'PLAYING' | 'WON' | 'LOST';
}

/** Authenticated request with user identity */
export interface AuthenticatedLocals {
    userId?: string;
    guestUuid?: string;
}
