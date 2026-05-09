/**
 * Input Validation Middleware — Sanitize guess inputs
 *
 * Rejects non-alpha characters, enforces length=5, normalizes to uppercase.
 *
 * @see WBS Task 6C.1
 */

import { Request, Response, NextFunction } from 'express';

class ValidationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ValidationError';
    }
}

/** Validate guess words in request body */
export function validateGuessInput(req: Request, _res: Response, next: NextFunction): void {
    const { guess, guesses } = req.body;

    // Single guess (practice mode)
    if (guess !== undefined) {
        validateWord(guess);
    }

    // Array of guesses (sync mode)
    if (guesses !== undefined) {
        if (!Array.isArray(guesses)) {
            throw new ValidationError('guesses must be an array');
        }
        for (const word of guesses) {
            validateWord(word);
        }
    }

    next();
}

function validateWord(word: unknown): void {
    if (typeof word !== 'string') {
        throw new ValidationError('Guess must be a string');
    }
    if (word.length !== 5) {
        throw new ValidationError('Guess must be exactly 5 characters');
    }
    if (!/^[A-Za-z]{5}$/.test(word)) {
        throw new ValidationError('Guess must contain only letters A-Z');
    }
}
