import { db } from './database';
import { accountingSnapshot, testGroup, testScenario } from './factories';
import { callerFor } from './trpc';

describe('trip-scoped payment-source analytics', () => {
  it('creates a group cash tranche and standalone exchange without balance effects', async () => {
    const { owner, outsider, group } = await testScenario();
    const ownerCaller = callerFor(owner.id);
    const outsiderCaller = callerFor(outsider.id);
    const before = await accountingSnapshot();

    const cashTranche = await ownerCaller.card.create({
      name: 'Japan cash',
      type: 'CASH',
      groupId: group.id,
      defaultCurrency: 'JPY',
      settlementCurrency: 'SGD',
      defaultRate: 1100,
      autoConvertToSettlement: false,
      startingBalance: 11000n,
      issuer: null,
      network: null,
      notes: null,
    });

    await expect(
      outsiderCaller.cashExchange.create({
        groupId: group.id,
        cardId: cashTranche.id,
        name: 'Money changer',
        exchangeDate: new Date('2026-10-20T00:00:00.000Z'),
        cashAmount: 11000n,
        cashCurrency: 'JPY',
        settlementAmount: 1000n,
        settlementCurrency: 'SGD',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    const exchange = await ownerCaller.cashExchange.create({
      groupId: group.id,
      cardId: cashTranche.id,
      name: 'Money changer',
      exchangeDate: new Date('2026-10-20T00:00:00.000Z'),
      cashAmount: 11000n,
      cashCurrency: 'JPY',
      settlementAmount: 1000n,
      settlementCurrency: 'SGD',
    });

    expect(exchange).toMatchObject({
      groupId: group.id,
      cardId: cashTranche.id,
      cashAmount: 11000n,
    });
    expect(await ownerCaller.cashExchange.list({ groupId: group.id })).toHaveLength(1);
    expect(await accountingSnapshot()).toEqual(before);
    await expect(outsiderCaller.cashExchange.list({ groupId: group.id })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });

    const updated = await ownerCaller.cashExchange.update({
      id: exchange.id,
      groupId: group.id,
      cardId: cashTranche.id,
      name: 'Airport money changer',
      exchangeDate: new Date('2026-10-21T00:00:00.000Z'),
      cashAmount: 22000n,
      cashCurrency: 'JPY',
      settlementAmount: 2000n,
      settlementCurrency: 'SGD',
    });
    expect(updated).toMatchObject({ name: 'Airport money changer', cashAmount: 22000n });

    await ownerCaller.cashExchange.delete({ groupId: group.id, id: exchange.id });
    expect(await db.cashExchange.count({ where: { groupId: group.id } })).toBe(0);
    expect(await accountingSnapshot()).toEqual(before);
  });

  it('keeps expense analytics inside the selected trip or personal scope', async () => {
    const { owner, member, group } = await testScenario();
    const otherGroup = await testGroup(owner.id, [member.id]);
    const caller = callerFor(owner.id);
    const card = await caller.card.create({
      name: 'Travel card',
      type: 'CARD',
      issuer: null,
      network: null,
      notes: null,
      defaultCurrency: null,
      settlementCurrency: null,
      defaultRate: null,
      autoConvertToSettlement: false,
      startingBalance: null,
    });

    const expenseInput = {
      paidBy: owner.id,
      name: 'Overseas expense',
      category: 'Food',
      amount: 1000n,
      originalAmount: 10000n,
      originalCurrency: 'JPY',
      conversionRate: 0.01,
      groupId: group.id,
      cardId: card.id,
      currency: 'SGD',
      participants: [
        { userId: owner.id, amount: 500n },
        { userId: member.id, amount: -500n },
      ],
    } as const;
    await caller.expense.addOrEditExpense(expenseInput);
    await caller.expense.addOrEditExpense({ ...expenseInput, groupId: otherGroup.id });
    await caller.expense.addOrEditExpense({ ...expenseInput, groupId: null });

    const selectedTrip = await caller.card.analytics({ groupId: group.id });
    const personal = await caller.card.analytics({ groupId: null });

    expect(selectedTrip.rateHistory).toHaveLength(1);
    expect(personal.rateHistory).toHaveLength(1);
  });
});
