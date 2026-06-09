import { SplitType } from '@prisma/client';
import { TRPCError } from '@trpc/server';
import { nanoid } from 'nanoid';
import { z } from 'zod';

import {
  buildPaymentSourceAnalyticsCsv,
  buildTravelExpensesCsv,
  createCsvFileName,
} from '~/lib/csvExport';
import {
  defaultSplitInputSchema,
  deserializeDefaultSplit,
  parseSerializedDefaultSplit,
  serializeDefaultSplit,
} from '~/lib/defaultSplit';
import { simplifyDebts } from '~/lib/simplify';
import {
  sendGroupSimplifyDebtsToggleNotification,
} from '~/server/api/services/notificationService';
import { createTRPCRouter, groupProcedure, protectedProcedure } from '~/server/api/trpc';

export const groupRouter = createTRPCRouter({
  create: protectedProcedure
    .input(z.object({ name: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const group = await ctx.db.group.create({
        data: {
          name: input.name,
          publicId: nanoid(),
          userId: ctx.session.user.id,
          groupUsers: {
            create: {
              userId: ctx.session.user.id,
            },
          },
        },
      });

      return group;
    }),

  getAllGroups: protectedProcedure.query(async ({ ctx }) => {
    const groups = await ctx.db.groupUser.findMany({
      where: {
        userId: ctx.session.user.id,
      },
      include: {
        group: {
          include: {
            groupUsers: {
              include: {
                user: true,
              },
            },
          },
        },
      },
    });

    return groups;
  }),

  getAllGroupsWithBalances: protectedProcedure
    .input(z.object({ getArchived: z.boolean() }).optional())
    .query(async ({ ctx, input }) => {
      const groups = await ctx.db.groupUser.findMany({
        where: {
          userId: ctx.session.user.id,
          group: {
            archivedAt: input?.getArchived ? { not: null } : null,
          },
        },
        include: {
          group: {
            include: {
              groupBalances: {
                where: { userId: ctx.session.user.id },
              },
              // We can sort by group balance view instead
              expenses: {
                orderBy: {
                  createdAt: 'desc',
                },
                take: 1,
              },
            },
          },
        },
      });

      const sortedGroupsByLatestExpense = groups.sort((a, b) => {
        const aDate = a.group.expenses[0]?.createdAt ?? new Date(0);
        const bDate = b.group.expenses[0]?.createdAt ?? new Date(0);
        return bDate.getTime() - aDate.getTime();
      });

      const groupsWithBalances = sortedGroupsByLatestExpense.map((g) => {
        const balances: Record<string, bigint> = {};

        for (const balance of g.group.groupBalances) {
          balances[balance.currency] = (balances[balance.currency] ?? 0n) + balance.amount;
        }

        return {
          ...g.group,
          balances,
        };
      });

      return groupsWithBalances;
    }),

  joinGroup: protectedProcedure
    .input(z.object({ groupId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const group = await ctx.db.group.findFirst({
        where: {
          publicId: input.groupId,
        },
      });

      if (!group) {
        throw new Error('Group not found');
      }

      await ctx.db.groupUser.create({
        data: {
          groupId: group.id,
          userId: ctx.session.user.id,
        },
      });

      await ctx.db.groupDefaultSplit.deleteMany({ where: { groupId: group.id } });

      return group;
    }),

  getGroupDetails: groupProcedure.query(async ({ input, ctx }) => {
    const group = await ctx.db.group.findUnique({
      where: {
        id: input.groupId,
      },
      include: {
        groupUsers: {
          include: {
            user: true,
          },
        },
        groupBalances: true,
        groupDefaultSplit: true,
      },
    });

    if (!group) {
      return group;
    }

    if (group.simplifyDebts) {
      group.groupBalances = simplifyDebts(group.groupBalances);
    }

    const defaultSplit =
      group.groupDefaultSplit &&
      parseSerializedDefaultSplit(
        group.groupDefaultSplit.splitType,
        group.groupDefaultSplit.shares,
      );

    return {
      ...group,
      defaultSplit,
    };
  }),

  getGroupTotals: groupProcedure.query(async ({ input, ctx }) => {
    const totals = await ctx.db.expense.groupBy({
      by: 'currency',
      _sum: {
        amount: true,
      },
      where: {
        groupId: input.groupId,
        deletedAt: null,
        splitType: {
          not: SplitType.SETTLEMENT,
        },
      },
    });

    return totals;
  }),

  getGroupMemberSpendingTotals: groupProcedure.query(async ({ input, ctx }) => {
    const [members, totals] = await Promise.all([
      ctx.db.groupUser.findMany({
        where: {
          groupId: input.groupId,
        },
        include: {
          user: true,
        },
      }),
      ctx.db.expense.groupBy({
        by: ['paidBy', 'currency'],
        _sum: {
          amount: true,
        },
        where: {
          groupId: input.groupId,
          deletedAt: null,
          splitType: {
            notIn: [SplitType.SETTLEMENT, SplitType.CURRENCY_CONVERSION],
          },
        },
      }),
    ]);

    const totalsByUser = totals.reduce<Record<number, Record<string, bigint>>>((acc, total) => {
      acc[total.paidBy] ??= {};
      acc[total.paidBy]![total.currency] =
        (acc[total.paidBy]![total.currency] ?? 0n) + (total._sum.amount ?? 0n);
      return acc;
    }, {});

    return members
      .map(({ user }) => ({
        user,
        totals: totalsByUser[user.id] ?? {},
      }))
      .sort((a, b) => {
        const aMax = Object.values(a.totals).reduce(
          (max, amount) => (amount > max ? amount : max),
          0n,
        );
        const bMax = Object.values(b.totals).reduce(
          (max, amount) => (amount > max ? amount : max),
          0n,
        );
        return Number(bMax - aMax);
      });
  }),

  getGroupMemberAttributedTotals: groupProcedure.query(async ({ input, ctx }) => {
    const [members, expenses] = await Promise.all([
      ctx.db.groupUser.findMany({
        where: {
          groupId: input.groupId,
        },
        include: {
          user: true,
        },
      }),
      ctx.db.expense.findMany({
        where: {
          groupId: input.groupId,
          deletedAt: null,
          splitType: {
            notIn: [SplitType.SETTLEMENT, SplitType.CURRENCY_CONVERSION],
          },
        },
        select: {
          amount: true,
          currency: true,
          paidBy: true,
          expenseParticipants: {
            select: {
              userId: true,
              amount: true,
            },
          },
        },
      }),
    ]);

    const totalsByUser = expenses.reduce<Record<number, Record<string, bigint>>>(
      (acc, expense) => {
        expense.expenseParticipants.forEach((participant) => {
          const attributedAmount =
            participant.userId === expense.paidBy
              ? expense.amount - participant.amount
              : -participant.amount;

          acc[participant.userId] ??= {};
          acc[participant.userId]![expense.currency] =
            (acc[participant.userId]![expense.currency] ?? 0n) + attributedAmount;
        });
        return acc;
      },
      {},
    );

    return members
      .map(({ user }) => ({
        user,
        totals: totalsByUser[user.id] ?? {},
      }))
      .sort((a, b) => {
        const aMax = Object.values(a.totals).reduce(
          (max, amount) => (amount > max ? amount : max),
          0n,
        );
        const bMax = Object.values(b.totals).reduce(
          (max, amount) => (amount > max ? amount : max),
          0n,
        );
        return Number(bMax - aMax);
      });
  }),

  exportExpensesCsv: groupProcedure.mutation(async ({ input, ctx }) => {
    const [group, expenses] = await Promise.all([
      ctx.db.group.findUnique({
        where: {
          id: input.groupId,
        },
        select: {
          name: true,
        },
      }),
      ctx.db.expense.findMany({
        where: {
          groupId: input.groupId,
          deletedAt: null,
        },
        orderBy: [{ expenseDate: 'asc' }, { createdAt: 'asc' }],
        include: {
          addedByUser: true,
          card: true,
          expenseNotes: {
            orderBy: {
              createdAt: 'asc',
            },
          },
          expenseParticipants: {
            include: {
              user: true,
            },
          },
          paidByUser: true,
        },
      }),
    ]);

    if (!group) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Group not found' });
    }

    return {
      filename: createCsvFileName({
        prefix: 'expenses',
        groupName: group.name,
      }),
      csv: buildTravelExpensesCsv(expenses),
    };
  }),

  exportPaymentSourceAnalyticsCsv: groupProcedure.mutation(async ({ input, ctx }) => {
    const [group, expenses] = await Promise.all([
      ctx.db.group.findUnique({
        where: {
          id: input.groupId,
        },
        select: {
          name: true,
        },
      }),
      ctx.db.expense.findMany({
        where: {
          groupId: input.groupId,
          deletedAt: null,
          splitType: {
            notIn: [SplitType.SETTLEMENT, SplitType.CURRENCY_CONVERSION],
          },
        },
        orderBy: [{ expenseDate: 'asc' }, { createdAt: 'asc' }],
        include: {
          card: true,
        },
      }),
    ]);

    if (!group) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Group not found' });
    }

    return {
      filename: createCsvFileName({
        prefix: 'payment-source-analytics',
        groupName: group.name,
      }),
      csv: buildPaymentSourceAnalyticsCsv(expenses),
    };
  }),

  addMembers: groupProcedure
    .input(z.object({ userIds: z.array(z.number()) }))
    .mutation(async ({ input, ctx }) => {
      const groupUsers = await ctx.db.groupUser.createMany({
        data: input.userIds.map((userId) => ({
          groupId: input.groupId,
          userId,
        })),
      });

      await ctx.db.groupDefaultSplit.deleteMany({ where: { groupId: input.groupId } });

      return groupUsers;
    }),

  toggleSimplifyDebts: groupProcedure
    .input(z.object({ groupId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const group = await ctx.db.group.findUnique({
        where: {
          id: input.groupId,
        },
      });

      if (!group) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Group not found' });
      }

      if (group.archivedAt) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Cannot toggle simplify debts for archived groups',
        });
      }

      const isInGroup = await ctx.db.groupUser.findFirst({
        where: {
          groupId: input.groupId,
          userId: ctx.session.user.id,
        },
      });

      if (!isInGroup) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Only group members can toggle Simplify Debts',
        });
      }

      const simplifyDebtsInv = !group.simplifyDebts;

      await ctx.db.group.update({
        where: {
          id: input.groupId,
        },
        data: {
          simplifyDebts: simplifyDebtsInv,
        },
      });

      // Send notifications asynchronously
      void sendGroupSimplifyDebtsToggleNotification(
        input.groupId,
        ctx.session.user.id,
        simplifyDebtsInv,
      );

      return simplifyDebts;
    }),

  leaveGroup: groupProcedure
    .input(z.object({ groupId: z.number(), userId: z.number().optional() }))
    .mutation(async ({ input, ctx }) => {
      const userId = input.userId ?? ctx.session.user.id;

      const group = await ctx.db.group.findUnique({
        where: {
          id: input.groupId,
        },
      });
      if (!group) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Group not found' });
      }

      if (group.userId !== ctx.session.user.id && userId !== ctx.session.user.id) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Only group creator can remove someone from the group',
        });
      }

      const groupBalances = await ctx.db.balanceView.findMany({
        where: { groupId: input.groupId },
      });

      const finalGroupBalances = group.simplifyDebts ? simplifyDebts(groupBalances) : groupBalances;

      if (finalGroupBalances.some((b) => b.userId === userId && 0n !== b.amount)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'User has a non-zero balance in this group',
        });
      }

      const groupUser = await ctx.db.groupUser.delete({
        where: {
          groupId_userId: {
            groupId: input.groupId,
            userId,
          },
        },
      });

      await ctx.db.groupDefaultSplit.deleteMany({ where: { groupId: input.groupId } });

      return groupUser;
    }),

  upsertDefaultSplit: groupProcedure
    .input(
      z.object({
        groupId: z.number(),
        defaultSplit: defaultSplitInputSchema,
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const parsed = deserializeDefaultSplit(input.defaultSplit);
      if (!parsed) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Malformed default split' });
      }

      const serialized = serializeDefaultSplit(parsed);

      const groupDefaultSplit = await ctx.db.groupDefaultSplit.upsert({
        where: { groupId: input.groupId },
        create: {
          groupId: input.groupId,
          splitType: serialized.splitType,
          shares: serialized.shares,
        },
        update: {
          splitType: serialized.splitType,
          shares: serialized.shares,
        },
      });

      return {
        splitType: groupDefaultSplit.splitType,
        shares: serialized.shares,
      };
    }),

  clearDefaultSplit: groupProcedure
    .input(z.object({ groupId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await ctx.db.groupDefaultSplit.deleteMany({ where: { groupId: input.groupId } });
      return true;
    }),

  updateGroupDetails: groupProcedure
    .input(
      z.object({
        name: z.string().min(1),
        image: z.string().nullable().optional(),
        defaultCurrency: z.string().nullable().optional(),
        groupId: z.number(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const group = await ctx.db.group.findUnique({
        where: {
          id: input.groupId,
        },
      });

      if (!group) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Group not found' });
      }

      const updatedGroup = await ctx.db.group.update({
        where: {
          id: input.groupId,
        },
        data: {
          name: input.name,
          image: input.image,
          defaultCurrency: input.defaultCurrency,
        },
      });

      return updatedGroup;
    }),

  toggleArchive: groupProcedure
    .input(z.object({ groupId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const group = await ctx.db.group.findUnique({
        where: {
          id: input.groupId,
        },
        include: {
          groupBalances: true,
        },
      });

      if (!group) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Group not found' });
      }

      // Check if user is a member of the group
      const isInGroup = await ctx.db.groupUser.findFirst({
        where: {
          groupId: input.groupId,
          userId: ctx.session.user.id,
        },
      });

      if (!isInGroup) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Only group members can archive/unarchive the group',
        });
      }

      const isArchiving = !group.archivedAt;

      // Only check balances when archiving (not when unarchiving)
      if (isArchiving) {
        if (group?.simplifyDebts) {
          group.groupBalances = simplifyDebts(group.groupBalances);
        }

        const balanceWithNonZero = group.groupBalances.find((b) => 0n !== b.amount);

        if (balanceWithNonZero) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message:
              'Cannot archive group with outstanding balances. All balances must be settled first.',
          });
        }
      }

      const updatedGroup = await ctx.db.group.update({
        where: {
          id: input.groupId,
        },
        data: {
          archivedAt: isArchiving ? new Date() : null,
        },
      });

      return updatedGroup;
    }),

  delete: groupProcedure
    .input(z.object({ groupId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const group = await ctx.db.group.findUnique({
        where: {
          id: input.groupId,
        },
        include: {
          groupBalances: true,
        },
      });

      if (group?.userId !== ctx.session.user.id) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Only creator can delete the group' });
      }

      if (group?.simplifyDebts) {
        group.groupBalances = simplifyDebts(group.groupBalances);
      }

      const balanceWithNonZero = group?.groupBalances.find((b) => 0n !== b.amount);

      if (balanceWithNonZero) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'You have a non-zero balance in this group',
        });
      }

      await ctx.db.group.delete({
        where: {
          id: input.groupId,
        },
      });

      return group;
    }),
});

export type GroupRouter = typeof groupRouter;
