ALTER TABLE "public"."Card"
ADD COLUMN "groupId" INTEGER;

CREATE INDEX "Card_groupId_idx" ON "public"."Card"("groupId");

ALTER TABLE "public"."Card"
ADD CONSTRAINT "Card_groupId_fkey"
FOREIGN KEY ("groupId") REFERENCES "public"."Group"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "public"."CashExchange" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "groupId" INTEGER NOT NULL,
    "cardId" INTEGER,
    "name" TEXT NOT NULL,
    "exchangeDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cashAmount" BIGINT NOT NULL,
    "cashCurrency" TEXT NOT NULL,
    "settlementAmount" BIGINT NOT NULL,
    "settlementCurrency" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CashExchange_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CashExchange_userId_groupId_exchangeDate_idx"
ON "public"."CashExchange"("userId", "groupId", "exchangeDate");

CREATE INDEX "CashExchange_cardId_idx" ON "public"."CashExchange"("cardId");

ALTER TABLE "public"."CashExchange"
ADD CONSTRAINT "CashExchange_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "public"."User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."CashExchange"
ADD CONSTRAINT "CashExchange_groupId_fkey"
FOREIGN KEY ("groupId") REFERENCES "public"."Group"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."CashExchange"
ADD CONSTRAINT "CashExchange_cardId_fkey"
FOREIGN KEY ("cardId") REFERENCES "public"."Card"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
