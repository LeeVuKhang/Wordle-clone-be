/**
 * Wordle Clone — Express Server Entry Point
 *
 * Mounts all route modules, middleware pipeline, and cron service.
 * Security hardened with Helmet + strict CORS (WBS 7.8).
 *
 * @see WBS Phase 6, Phase 7
 */

import 'dotenv/config';
import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import cron from 'node-cron';

// Infrastructure
import { connectDatabase, disconnectDatabase } from './lib/prisma.js';
import { selectDailyWord } from './lib/cron.js';

// Middleware
import { identityMiddleware } from './middleware/auth.middleware.js';
import { rateLimitMiddleware } from './middleware/rateLimit.middleware.js';
import { validateGuessInput } from './middleware/validation.middleware.js';
import { errorMiddleware } from './middleware/error.middleware.js';

// Routes
import gameRoutes from './modules/game/game.routes.js';
import practiceRoutes from './modules/practice/practice.routes.js';
import authRoutes from './modules/auth/auth.routes.js';



const app = express();
const PORT = process.env.PORT || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

// ============================================================
// Security Hardening (Task 7.8)
// ============================================================

// Helmet — secure HTTP headers
app.use(helmet({
    // Allow cross-origin requests for API (Vercel FE → Railway BE)
    crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

// CORS — strict origins (Task 7.8)
const ALLOWED_ORIGINS = [
    process.env.FRONTEND_URL || 'http://localhost:5173',
    // Add production domain(s) here
].filter(Boolean);

app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (mobile apps, curl, server-to-server)
        if (!origin) return callback(null, true);
        if (ALLOWED_ORIGINS.includes(origin)) {
            return callback(null, true);
        }
        callback(new Error(`CORS: Origin ${origin} not allowed`));
    },
    credentials: true,    // Required for httpOnly cookies (access_token, refresh_token)
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Guest-ID', 'X-Correlation-ID'],
}));

// ============================================================
// Global Middleware (Chain of Responsibility)
// ============================================================

app.use(express.json({ limit: '10kb' }));  // Prevent large payload attacks
app.use(cookieParser());
app.use(identityMiddleware);
app.use(rateLimitMiddleware);

// ============================================================
// Routes
// ============================================================

app.get('/', (_req: Request, res: Response) => {
    res.json({
        message: 'Wordle Clone API Server',
        version: '3.0.0',
        status: 'running',
    });
});

app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Auth routes (Phase 7)
app.use('/api/auth', authRoutes);

// Game routes (with input validation on sync)
app.use('/api/game', gameRoutes);
app.use('/api/game/sync', validateGuessInput);

// Practice routes (with input validation on guess)
app.use('/api/practice', practiceRoutes);
app.use('/api/practice/guess', validateGuessInput);

// ============================================================
// Error Handler (must be last)
// ============================================================

app.use(errorMiddleware);

// ============================================================
// Server Startup
// ============================================================

async function bootstrap(): Promise<void> {
    // Connect to database (mitigates cold-start — Risk R10)
    await connectDatabase();

    // Ensure today's word exists (health check — Risk R1)
    try {
        await selectDailyWord();
    } catch (err) {
        console.warn('Daily word selection failed on startup:', err);
    }

    // Schedule daily word rotation at 00:00 UTC
    cron.schedule('0 0 * * *', async () => {
        console.log('Running daily word rotation...');
        try {
            await selectDailyWord();
        } catch (err) {
            console.error('Cronjob failed:', err);
        }
    }, { timezone: 'UTC' });

    // Start HTTP server
    const server = app.listen(PORT, () => {
        console.log(`Server is running on http://localhost:${PORT}`);
        console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
        console.log(`CORS origins: ${ALLOWED_ORIGINS.join(', ')}`);
    });

    // Graceful shutdown (WBS 10.6)
    const shutdown = async () => {
        console.log('Shutting down gracefully...');
        server.close();
        await disconnectDatabase();
        process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
}

bootstrap().catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
});

export default app;
