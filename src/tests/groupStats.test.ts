import { calculateMemberAttributedTotals } from '~/server/api/routers/groupStats';

describe('calculateMemberAttributedTotals', () => {
  it('should count legacy self-only group expenses with no participant rows', () => {
    const totals = calculateMemberAttributedTotals([
      {
        amount: 12345n,
        currency: 'USD',
        paidBy: 1,
        expenseParticipants: [],
      },
    ]);

    expect(totals).toEqual({
      1: {
        USD: 12345n,
      },
    });
  });

  it('should count self-only group expenses with a zero-net payer participant row', () => {
    const totals = calculateMemberAttributedTotals([
      {
        amount: 12345n,
        currency: 'USD',
        paidBy: 1,
        expenseParticipants: [
          {
            userId: 1,
            amount: 0n,
          },
        ],
      },
    ]);

    expect(totals).toEqual({
      1: {
        USD: 12345n,
      },
    });
  });

  it('should attribute normal split expenses by consumed share', () => {
    const totals = calculateMemberAttributedTotals([
      {
        amount: 10000n,
        currency: 'USD',
        paidBy: 1,
        expenseParticipants: [
          {
            userId: 1,
            amount: 5000n,
          },
          {
            userId: 2,
            amount: -5000n,
          },
        ],
      },
    ]);

    expect(totals).toEqual({
      1: {
        USD: 5000n,
      },
      2: {
        USD: 5000n,
      },
    });
  });
});
