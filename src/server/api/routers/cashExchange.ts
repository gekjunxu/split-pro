import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { isCurrencyCode } from '~/lib/currency';
import { createTRPCRouter, groupProcedure } from '~/server/api/trpc';
import { db } from '~/server/db';

const cashExchangeFields = z.object({
  groupId: z.number(),
  cardId: z.number().nullable().optional(),
  name: z.string().trim().min(1),
  exchangeDate: z.date(),
  cashAmount: z.bigint().positive(),
  cashCurrency: z.string().refine(isCurrencyCode, 'Invalid cash currency'),
  settlementAmount: z.bigint().positive(),
  settlementCurrency: z.string().refine(isCurrencyCode, 'Invalid settlement currency'),
});

const validateCashExchangeCurrencies = (
  value: z.infer<typeof cashExchangeFields>,
  context: z.RefinementCtx,
) => {
  if (value.cashCurrency === value.settlementCurrency) {
    context.addIssue({
      code: 'custom',
      path: ['settlementCurrency'],
      message: 'Cash and settlement currencies must differ',
    });
  }
};

const cashExchangeInputSchema = cashExchangeFields.superRefine(validateCashExchangeCurrencies);
const cashExchangeUpdateSchema = cashExchangeFields
  .extend({ id: z.string() })
  .superRefine(validateCashExchangeCurrencies);

const assertActiveGroupMember = async (groupId: number, userId: number) => {
  const group = await db.group.findUnique({
    where: { id: groupId },
    select: {
      archivedAt: true,
      groupUsers: { where: { userId }, select: { userId: true } },
    },
  });

  if (!group || 0 === group.groupUsers.length) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Not a group member' });
  }
  if (group.archivedAt) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Group is archived' });
  }
};

const assertCashTranche = async (
  cardId: number | null | undefined,
  groupId: number,
  userId: number,
) => {
  if (null == cardId) {
    return;
  }

  const card = await db.card.findFirst({
    where: { id: cardId, userId },
    select: { type: true, groupId: true },
  });
  if (!card || 'CASH' !== card.type) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cash tranche not found' });
  }
  if (null !== card.groupId && card.groupId !== groupId) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cash tranche belongs to another trip' });
  }
};

const exchangeWhere = (id: string, groupId: number, userId: number) => ({
  id,
  groupId,
  userId,
});

export const cashExchangeRouter = createTRPCRouter({
  list: groupProcedure.query(async ({ input, ctx }) =>
    db.cashExchange.findMany({
      where: { groupId: input.groupId, userId: ctx.session.user.id },
      include: { card: { select: { id: true, name: true } } },
      orderBy: [{ exchangeDate: 'desc' }, { id: 'desc' }],
    }),
  ),

  create: groupProcedure.input(cashExchangeInputSchema).mutation(async ({ input, ctx }) => {
    await assertActiveGroupMember(input.groupId, ctx.session.user.id);
    await assertCashTranche(input.cardId, input.groupId, ctx.session.user.id);

    return db.cashExchange.create({
      data: {
        userId: ctx.session.user.id,
        groupId: input.groupId,
        cardId: input.cardId ?? null,
        name: input.name,
        exchangeDate: input.exchangeDate,
        cashAmount: input.cashAmount,
        cashCurrency: input.cashCurrency,
        settlementAmount: input.settlementAmount,
        settlementCurrency: input.settlementCurrency,
      },
      include: { card: { select: { id: true, name: true } } },
    });
  }),

  update: groupProcedure.input(cashExchangeUpdateSchema).mutation(async ({ input, ctx }) => {
    await assertActiveGroupMember(input.groupId, ctx.session.user.id);
    await assertCashTranche(input.cardId, input.groupId, ctx.session.user.id);
    const existing = await db.cashExchange.findFirst({
      where: exchangeWhere(input.id, input.groupId, ctx.session.user.id),
      select: { id: true },
    });
    if (!existing) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Cash exchange not found' });
    }

    return db.cashExchange.update({
      where: { id: input.id },
      data: {
        cardId: input.cardId ?? null,
        name: input.name,
        exchangeDate: input.exchangeDate,
        cashAmount: input.cashAmount,
        cashCurrency: input.cashCurrency,
        settlementAmount: input.settlementAmount,
        settlementCurrency: input.settlementCurrency,
      },
      include: { card: { select: { id: true, name: true } } },
    });
  }),

  delete: groupProcedure
    .input(z.object({ groupId: z.number(), id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const existing = await db.cashExchange.findFirst({
        where: exchangeWhere(input.id, input.groupId, ctx.session.user.id),
        select: { id: true },
      });
      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Cash exchange not found' });
      }

      return db.cashExchange.delete({ where: { id: input.id } });
    }),
});

export type CashExchangeRouter = typeof cashExchangeRouter;
