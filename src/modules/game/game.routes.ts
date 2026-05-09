/**
 * Game Routes
 * @see WBS Phase 6A
 */

import { Router } from 'express';
import * as gameController from './game.controller.js';

const router = Router();

router.get('/today', gameController.getToday);
router.post('/sync', gameController.syncGame);

export default router;
