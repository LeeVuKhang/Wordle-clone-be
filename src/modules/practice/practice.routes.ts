/**
 * Practice Routes
 * @see WBS Phase 6B
 */

import { Router } from 'express';
import * as practiceController from './practice.controller.js';

const router = Router();

router.post('/new', practiceController.createSession);
router.post('/guess', practiceController.submitGuess);

export default router;
