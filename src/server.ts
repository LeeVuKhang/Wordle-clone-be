/**
 * Wordle Clone — Express Server Entry Point
 *
 * Mounts all route modules, middleware pipeline, and cron service.
 *
 * @see WBS Phase 6
 */

import express, { Request, Response } from 'express';
import cors from 'cors';
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

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================
// Global Middleware (Chain of Responsibility)
// ============================================================

app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
}));
app.use(express.json());
app.use(cookieParser());
app.use(identityMiddleware);
app.use(rateLimitMiddleware);

// ============================================================
// Routes
// ============================================================

app.get('/', (_req: Request, res: Response) => {
    res.json({
        message: 'Wordle Clone API Server',
        version: '2.0.0',
        status: 'running',
    });
});

app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

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
