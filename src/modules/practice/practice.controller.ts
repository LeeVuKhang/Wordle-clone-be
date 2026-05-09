/**
 * Practice Controller — HTTP handlers for practice mode
 * @see WBS Tasks 6B.1, 6B.2
 */

import { Request, Response, NextFunction } from 'express';
import * as practiceService from './practice.service.js';

/** POST /api/practice/new */
export async function createSession(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        const result = await practiceService.createSession();
        res.status(201).json(result);
    } catch (err) {
        next(err);
    }
}

/** POST /api/practice/guess */
export async function submitGuess(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        const { practiceId, guess } = req.body as { practiceId: string; guess: string };
        const result = await practiceService.submitGuess(practiceId, guess);
        res.json(result);
    } catch (err) {
        next(err);
    }
}
