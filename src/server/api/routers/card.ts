import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { calculateCardAnalytics } from '~/lib/cardAnalytics';
import { createTRPCRouter, protectedProcedure } from '~/server/api/trpc';
import { db } from '~/server/db';

const cardInputSchema = z.object({
  name: z.string().trim().min(1),
  groupId: z.number().nullable().optional(),
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

const assertGroupMember = async (groupId: number, userId: number, requireActive = false) => {
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
  if (requireActive && group.archivedAt) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Group is archived' });
  }
};

const resolveCardGroupId = async ({
  groupId,
  type,
  userId,
}: {
  groupId?: number | null;
  type: 'CARD' | 'CASH';
  userId: number;
}) => {
  if ('CARD' === type) {
    return null;
  }
  if (null == groupId) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cash tranches need a trip' });
  }

  await assertGroupMember(groupId, userId, true);
  return groupId;
};

export const cardRouter = createTRPCRouter({
  list: protectedProcedure
    .input(
      z
        .object({
          includeArchived: z.boolean().optional(),
          groupId: z.number().nullable().optional(),
        })
        .optional(),
    )
    .query(async ({ input, ctx }) => {
      const hasGroupScope = undefined !== input?.groupId;
      if ('number' === typeof input?.groupId) {
        await assertGroupMember(input.groupId, ctx.session.user.id);
      }
      const cashScope = !hasGroupScope
        ? {}
        : null === input.groupId
          ? { type: { not: 'CASH' } }
          : {
              OR: [
                { type: { not: 'CASH' } },
                { type: 'CASH', groupId: input.groupId },
                { type: 'CASH', groupId: null },
              ],
            };

      return db.card.findMany({
        where: {
          userId: ctx.session.user.id,
          ...(input?.includeArchived ? {} : { archivedAt: null }),
          ...cashScope,
        },
        orderBy: [{ archivedAt: 'asc' }, { name: 'asc' }],
      });
    }),

  create: protectedProcedure.input(cardInputSchema).mutation(async ({ input, ctx }) => {
    const groupId = await resolveCardGroupId({ ...input, userId: ctx.session.user.id });

    return db.card.create({
      data: {
        userId: ctx.session.user.id,
        groupId,
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

  update: protectedProcedure
    .input(cardInputSchema.extend({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await assertCardOwner(input.id, ctx.session.user.id);
      const groupId = await resolveCardGroupId({ ...input, userId: ctx.session.user.id });

      return db.card.update({
        where: { id: input.id },
        data: {
          groupId,
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

  analytics: protectedProcedure
    .input(z.object({ groupId: z.number().nullable() }).optional())
    .query(async ({ input, ctx }) => {
      if (input && null !== input.groupId) {
        await assertGroupMember(input.groupId, ctx.session.user.id);
      }

      const groupScope = !input || undefined === input.groupId ? {} : { groupId: input.groupId };
      const cashExchangeScope =
        'number' === typeof input?.groupId ? { groupId: input.groupId } : {};
      const [expenses, cashExchanges] = await Promise.all([
        db.expense.findMany({
          where: {
            deletedBy: null,
            cardId: { not: null },
            ...groupScope,
            card: {
              is: {
                userId: ctx.session.user.id,
              },
            },
          },
          select: {
            id: true,
            name: true,
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
          orderBy: [{ expenseDate: 'asc' }, { id: 'asc' }],
        }),
        null === input?.groupId
          ? []
          : db.cashExchange.findMany({
              where: {
                userId: ctx.session.user.id,
                ...cashExchangeScope,
              },
              select: {
                id: true,
                name: true,
                exchangeDate: true,
                cashAmount: true,
                cashCurrency: true,
                settlementAmount: true,
                settlementCurrency: true,
                card: { select: { id: true, name: true } },
              },
              orderBy: [{ exchangeDate: 'asc' }, { id: 'asc' }],
            }),
      ]);

      return calculateCardAnalytics(
        expenses,
        cashExchanges.map(
          ({
            id,
            name,
            exchangeDate,
            cashAmount,
            cashCurrency,
            settlementAmount,
            settlementCurrency,
            card,
          }) => ({
            id,
            name,
            exchangeDate,
            cashAmount,
            cashCurrency,
            settlementAmount,
            settlementCurrency,
            card,
          }),
        ),
      );
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
