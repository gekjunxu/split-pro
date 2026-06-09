CREATE TABLE "public"."Card" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "issuer" TEXT,
    "network" TEXT,
    "notes" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Card_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "public"."Expense" ADD COLUMN "cardId" INTEGER;

CREATE INDEX "Card_userId_idx" ON "public"."Card"("userId");
CREATE INDEX "Expense_cardId_idx" ON "public"."Expense"("cardId");

ALTER TABLE "public"."Card"
ADD CONSTRAINT "Card_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "public"."User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."Expense"
ADD CONSTRAINT "Expense_cardId_fkey"
FOREIGN KEY ("cardId") REFERENCES "public"."Card"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
