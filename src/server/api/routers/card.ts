import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { calculateCardAnalytics } from '~/lib/cardAnalytics';
import { createTRPCRouter, protectedProcedure } from '~/server/api/trpc';
import { db } from '~/server/db';

const cardInputSchema = z.object({
  name: z.string().trim().min(1),
  issuer: z.string().trim().nullable().optional(),
  network: z.string().trim().nullable().optional(),
  notes: z.string().trim().nullable().optional(),
  type: z.enum(['CARD', 'CASH']).default('CARD'),
  defaultCurrency: z.string().trim().nullable().optional(),
  settlementCurrency: z.string().trim().nullable().optional(),
  defaultRate: z.number().positive().nullable().optional(),
  autoConvertToSettlement: z.boolean().default(false),
  startingBalance: z.bigint().nullable().optional(),
});

const normalizeNullableText = (value?: string | null) => {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  return '' === trimmed ? null : trimmed;
};

export const cardRouter = createTRPCRouter({
  list: protectedProcedure
    .input(z.object({ includeArchived: z.boolean().optional() }).optional())
    .query(async ({ input, ctx }) =>
      db.card.findMany({
        where: {
          userId: ctx.session.user.id,
          ...(input?.includeArchived ? {} : { archivedAt: null }),
        },
        orderBy: [{ archivedAt: 'asc' }, { name: 'asc' }],
      }),
    ),

  create: protectedProcedure.input(cardInputSchema).mutation(async ({ input, ctx }) =>
    db.card.create({
      data: {
        userId: ctx.session.user.id,
        name: input.name,
        issuer: normalizeNullableText(input.issuer),
        network: normalizeNullableText(input.network),
        notes: normalizeNullableText(input.notes),
        type: input.type,
        defaultCurrency: normalizeNullableText(input.defaultCurrency),
        settlementCurrency: normalizeNullableText(input.settlementCurrency),
        defaultRate: input.defaultRate ?? null,
        autoConvertToSettlement: input.autoConvertToSettlement,
        startingBalance: input.startingBalance ?? null,
      },
    }),
  ),

  update: protectedProcedure
    .input(cardInputSchema.extend({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await assertCardOwner(input.id, ctx.session.user.id);

      return db.card.update({
        where: { id: input.id },
        data: {
          name: input.name,
          issuer: normalizeNullableText(input.issuer),
          network: normalizeNullableText(input.network),
          notes: normalizeNullableText(input.notes),
          type: input.type,
          defaultCurrency: normalizeNullableText(input.defaultCurrency),
          settlementCurrency: normalizeNullableText(input.settlementCurrency),
          defaultRate: input.defaultRate ?? null,
          autoConvertToSettlement: input.autoConvertToSettlement,
          startingBalance: input.startingBalance ?? null,
        },
      });
    }),

  archive: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await assertCardOwner(input.id, ctx.session.user.id);

      return db.card.update({
        where: { id: input.id },
        data: { archivedAt: new Date() },
      });
    }),

  restore: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await assertCardOwner(input.id, ctx.session.user.id);

      return db.card.update({
        where: { id: input.id },
        data: { archivedAt: null },
      });
    }),

  analytics: protectedProcedure.query(async ({ ctx }) => {
    const expenses = await db.expense.findMany({
      where: {
        deletedBy: null,
        cardId: { not: null },
        card: {
          is: {
            userId: ctx.session.user.id,
          },
        },
      },
      select: {
        amount: true,
        originalAmount: true,
        originalCurrency: true,
        conversionRate: true,
        currency: true,
        card: {
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
        expenseDate: true,
      },
    });

    return calculateCardAnalytics(expenses);
  }),
});

export const assertCardOwner = async (cardId: number | null | undefined, userId: number) => {
  if (!cardId) {
    return;
  }

  const card = await db.card.findFirst({
    where: {
      id: cardId,
      userId,
    },
  });

  if (!card) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Card not found' });
  }
};

export type CardRouter = typeof cardRouter;
