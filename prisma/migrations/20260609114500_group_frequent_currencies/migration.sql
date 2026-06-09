ALTER TABLE "public"."Group" ADD COLUMN "frequentCurrencies" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
