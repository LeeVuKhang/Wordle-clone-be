/// <reference types="node" />
/**
 * Prisma Seed Script — WordBank data
 * 
 * Seeds all valid 5 letter words from words.txt.
 * Run: npx prisma db seed
 * 
 * @see WBS Task 5.4
 */

import { PrismaClient } from '../src/generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import 'dotenv/config';
import fs from 'fs';
import path from 'path';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main(): Promise<void> {
    console.log(' Starting seed...');

    // Clear existing word bank data
    await prisma.wordBank.deleteMany();
    console.log('  Cleared existing WordBank data');

    // Load words from src/data/words.txt
    const wordsFilePath = path.join(process.cwd(), 'src', 'data', 'words.txt');
    const wordsFileContent = fs.readFileSync(wordsFilePath, 'utf-8');
    
    // Split by lines, trim, upper case, and filter valid 5-letter words
    const allWords = wordsFileContent
        .split('\n')
        .map(w => w.trim().toUpperCase())
        .filter(w => w.length === 5);

    // Deduplicate
    const uniqueWords = Array.from(new Set(allWords));

    const wordData = uniqueWords.map(word => ({ word }));

    // Batch insert
    const result = await prisma.wordBank.createMany({
        data: wordData,
        skipDuplicates: true,
    });

    console.log(`   Seeded ${result.count} words to WordBank`);
    console.log('Seed complete!');
}

main()
    .catch((e) => {
        console.error('Seed failed:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });

