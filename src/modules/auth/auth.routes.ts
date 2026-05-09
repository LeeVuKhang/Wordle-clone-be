/**
 * Auth Routes
 *
 * POST /api/auth/google   — Google OAuth code exchange (Task 7.4)
 * POST /api/auth/refresh  — Rotate access token via refresh cookie (Task 7.5)
 * POST /api/auth/merge    — Merge guest data into authenticated user (Task 7.6)
 * POST /api/auth/logout   — Revoke tokens and clear cookies
 * GET  /api/auth/me       — Get current user profile
 *
 * @see WBS Phase 7
 */

import { Router } from 'express';
import * as authController from './auth.controller.js';

const router = Router();

router.post('/google', authController.googleAuth);
router.post('/refresh', authController.refresh);
router.post('/merge', authController.mergeGuest);
router.post('/logout', authController.logout);
router.get('/me', authController.getMe);

export default router;
