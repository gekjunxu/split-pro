interface AttributedExpenseParticipant {
  userId: number;
  amount: bigint;
}

interface AttributedExpense {
  amount: bigint;
  currency: string;
  paidBy: number;
  expenseParticipants: AttributedExpenseParticipant[];
}

export const calculateMemberAttributedTotals = (expenses: AttributedExpense[]) =>
  expenses.reduce<Record<number, Record<string, bigint>>>((acc, expense) => {
    if (0 === expense.expenseParticipants.length) {
      acc[expense.paidBy] ??= {};
      acc[expense.paidBy]![expense.currency] =
        (acc[expense.paidBy]![expense.currency] ?? 0n) + expense.amount;
      return acc;
    }

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
  }, {});
