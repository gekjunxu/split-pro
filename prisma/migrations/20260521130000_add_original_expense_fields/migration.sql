ALTER TABLE "Expense"
ADD COLUMN "originalAmount" BIGINT,
ADD COLUMN "originalCurrency" TEXT,
ADD COLUMN "conversionRate" DOUBLE PRECISION;
