ALTER TABLE "public"."Card"
ADD COLUMN "type" TEXT NOT NULL DEFAULT 'CARD',
ADD COLUMN "defaultCurrency" TEXT,
ADD COLUMN "settlementCurrency" TEXT,
ADD COLUMN "defaultRate" DOUBLE PRECISION,
ADD COLUMN "startingBalance" BIGINT;
