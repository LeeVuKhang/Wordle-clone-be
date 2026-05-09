-- CreateEnum
CREATE TYPE "GameStatus" AS ENUM ('PLAYING', 'WON', 'LOST');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "username" TEXT,
    "passwordHash" TEXT,
    "oauthProvider" TEXT,
    "oauthId" TEXT,
    "refreshTokenHash" TEXT,
    "currentStreak" INTEGER NOT NULL DEFAULT 0,
    "maxStreak" INTEGER NOT NULL DEFAULT 0,
    "lastDailyDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyWord" (
    "id" TEXT NOT NULL,
    "word" VARCHAR(5) NOT NULL,
    "gameDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyWord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyGame" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "guestUuid" TEXT,
    "gameDate" TIMESTAMP(3) NOT NULL,
    "status" "GameStatus" NOT NULL DEFAULT 'PLAYING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "dailyWordId" TEXT NOT NULL,

    CONSTRAINT "DailyGame_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyGuess" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "guessWord" VARCHAR(5) NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyGuess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WordBank" (
    "id" TEXT NOT NULL,
    "word" VARCHAR(5) NOT NULL,
    "isAnswer" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WordBank_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_oauthProvider_oauthId_idx" ON "User"("oauthProvider", "oauthId");

-- CreateIndex
CREATE UNIQUE INDEX "DailyWord_gameDate_key" ON "DailyWord"("gameDate");

-- CreateIndex
CREATE INDEX "DailyWord_gameDate_idx" ON "DailyWord"("gameDate");

-- CreateIndex
CREATE INDEX "DailyGame_userId_idx" ON "DailyGame"("userId");

-- CreateIndex
CREATE INDEX "DailyGame_guestUuid_idx" ON "DailyGame"("guestUuid");

-- CreateIndex
CREATE INDEX "DailyGame_gameDate_idx" ON "DailyGame"("gameDate");

-- CreateIndex
CREATE INDEX "DailyGame_status_idx" ON "DailyGame"("status");

-- CreateIndex
CREATE UNIQUE INDEX "DailyGame_userId_gameDate_key" ON "DailyGame"("userId", "gameDate");

-- CreateIndex
CREATE UNIQUE INDEX "DailyGame_guestUuid_gameDate_key" ON "DailyGame"("guestUuid", "gameDate");

-- CreateIndex
CREATE INDEX "DailyGuess_gameId_idx" ON "DailyGuess"("gameId");

-- CreateIndex
CREATE UNIQUE INDEX "DailyGuess_gameId_attemptNumber_key" ON "DailyGuess"("gameId", "attemptNumber");

-- CreateIndex
CREATE UNIQUE INDEX "WordBank_word_key" ON "WordBank"("word");

-- CreateIndex
CREATE INDEX "WordBank_isAnswer_idx" ON "WordBank"("isAnswer");

-- CreateIndex
CREATE INDEX "WordBank_word_idx" ON "WordBank"("word");

-- AddForeignKey
ALTER TABLE "DailyGame" ADD CONSTRAINT "DailyGame_dailyWordId_fkey" FOREIGN KEY ("dailyWordId") REFERENCES "DailyWord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyGame" ADD CONSTRAINT "DailyGame_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyGuess" ADD CONSTRAINT "DailyGuess_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "DailyGame"("id") ON DELETE CASCADE ON UPDATE CASCADE;
