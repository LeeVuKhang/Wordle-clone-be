/**
 * Prisma Client Singleton
 *
 * Uses @prisma/adapter-pg driver adapter (required by Prisma 6+).
 * Ensures a single PrismaClient instance is shared across the application.
 * Connection pooling is handled by Neon's built-in pooler.
 *
 * @see WBS Task 5.7
 */

import { PrismaClient } from '../generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

const connectionString = process.env.DATABASE_URL || '';

const globalForPrisma = globalThis as unknown as {
    prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
    const pool = new pg.Pool({ connectionString });
    const adapter = new PrismaPg(pool);
    return new PrismaClient({ adapter });
}

export const prisma =
    globalForPrisma.prisma ??
    createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.prisma = prisma;
}

/**
 * Connect to the database on server startup.
 * Mitigates cold-start latency (Risk R10).
 */
export async function connectDatabase(): Promise<void> {
    try {
        await prisma.$connect();
        console.log('✅ Database connected successfully');
    } catch (error) {
        console.error('❌ Database connection failed:', error);
        process.exit(1);
    }
}

/**
 * Disconnect from the database on server shutdown.
 */
export async function disconnectDatabase(): Promise<void> {
    await prisma.$disconnect();
    console.log('Database disconnected');
}
