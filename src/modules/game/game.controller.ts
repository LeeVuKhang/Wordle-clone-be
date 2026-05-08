/**
 * Game Controller — HTTP handlers for daily game endpoints
 * @see WBS Tasks 6A.3, 6A.4
 */

import { Request, Response, NextFunction } from 'express';
import * as gameService from './game.service.js';
import type { DailyGameSyncDTO, AuthenticatedLocals } from './game.types.js';

/** GET /api/game/today */
export async function getToday(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        const { userId, guestUuid } = res.locals as AuthenticatedLocals;
        const result = await gameService.getDailyGame(userId, guestUuid);
        res.json(result);
    } catch (err) {
        next(err);
    }
}

/** POST /api/game/sync */
export async function syncGame(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        const { userId, guestUuid } = res.locals as AuthenticatedLocals;
        const dto = req.body as DailyGameSyncDTO;
        const result = await gameService.syncGame(dto, userId, guestUuid);
        res.json(result);
    } catch (err) {
        next(err);
    }
}
