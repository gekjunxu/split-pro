import { CURRENCIES, type CurrencyCode, isCurrencyCode } from '~/lib/currency';

type CsvValue = string | number | bigint | boolean | Date | null | undefined;

type CsvUser = {
  id: number;
  name: string | null;
  email: string | null;
};

export type TravelExpenseCsvExpense = {
  id: string;
  expenseDate: Date;
  name: string;
  paidByUser: CsvUser;
  addedByUser: CsvUser;
  card: { name: string } | null;
  currency: string;
  amount: bigint;
  originalAmount: bigint | null;
  originalCurrency: string | null;
  conversionRate: number | null;
  splitType: string;
  category: string;
  expenseParticipants: { user: CsvUser }[];
  expenseNotes: { note: string }[];
};

export type PaymentSourceAnalyticsCsvExpense = Pick<
  TravelExpenseCsvExpense,
  | 'expenseDate'
  | 'name'
  | 'card'
  | 'currency'
  | 'amount'
  | 'originalAmount'
  | 'originalCurrency'
  | 'conversionRate'
>;

const csvDate = (date: Date) => date.toISOString().slice(0, 10);

const csvUserName = (user: CsvUser) => user.name ?? user.email ?? `User ${user.id}`;

export const csvCell = (value: CsvValue) => {
  const text = value instanceof Date ? value.toISOString() : `${value ?? ''}`;

  return `"${text.replace(/"/g, '""')}"`;
};

export const toCsv = (rows: CsvValue[][]) =>
  rows.map((row) => row.map(csvCell).join(',')).join('\r\n');

export const moneyToCsvAmount = (amount: bigint, currency: string) => {
  if (!isCurrencyCode(currency)) {
    return `${amount}`;
  }

  const decimalDigits = CURRENCIES[currency as CurrencyCode].decimalDigits;
  const sign = 0n > amount ? '-' : '';
  const absoluteAmount = 0n > amount ? -amount : amount;

  if (0 === decimalDigits) {
    return `${sign}${absoluteAmount}`;
  }

  const multiplier = 10n ** BigInt(decimalDigits);
  const units = absoluteAmount / multiplier;
  const decimals = `${absoluteAmount % multiplier}`.padStart(decimalDigits, '0');

  return `${sign}${units}.${decimals}`;
};

export const createCsvFileName = ({
  prefix,
  groupName,
  date = new Date(),
}: {
  prefix: string;
  groupName: string;
  date?: Date;
}) => {
  const slug = groupName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const datePart = date.toISOString().slice(0, 10);

  return `${prefix}-${slug || 'group'}-${datePart}.csv`;
};

export const buildTravelExpensesCsv = (expenses: TravelExpenseCsvExpense[]) =>
  toCsv([
    [
      'Expense ID',
      'Date',
      'Description',
      'Paid By',
      'Payment Source',
      'Group Currency',
      'Settlement Amount',
      'Original Amount',
      'Original Currency',
      'Exchange Rate',
      'Split Type',
      'Participants',
      'Participant Count',
      'Category',
      'Created By',
      'Notes',
    ],
    ...expenses.map((expense) => {
      const originalCurrency = expense.originalCurrency ?? expense.currency;
      const originalAmount = expense.originalAmount ?? expense.amount;
      const participants = expense.expenseParticipants
        .map((participant) => csvUserName(participant.user))
        .join(', ');

      return [
        expense.id,
        csvDate(expense.expenseDate),
        expense.name,
        csvUserName(expense.paidByUser),
        expense.card?.name ?? '',
        expense.currency,
        moneyToCsvAmount(expense.amount, expense.currency),
        moneyToCsvAmount(originalAmount, originalCurrency),
        originalCurrency,
        expense.conversionRate ?? 1,
        expense.splitType,
        participants,
        expense.expenseParticipants.length,
        expense.category,
        csvUserName(expense.addedByUser),
        expense.expenseNotes.map((note) => note.note).join('\n'),
      ];
    }),
  ]);

export const buildPaymentSourceAnalyticsCsv = (expenses: PaymentSourceAnalyticsCsvExpense[]) =>
  toCsv([
    [
      'Date',
      'Expense',
      'Payment Source',
      'Original Currency',
      'Original Amount',
      'FX Rate',
      'Settlement Amount',
      'Settlement Currency',
    ],
    ...expenses.map((expense) => {
      const originalCurrency = expense.originalCurrency ?? expense.currency;
      const originalAmount = expense.originalAmount ?? expense.amount;

      return [
        csvDate(expense.expenseDate),
        expense.name,
        expense.card?.name ?? '',
        originalCurrency,
        moneyToCsvAmount(originalAmount, originalCurrency),
        expense.conversionRate ?? 1,
        moneyToCsvAmount(expense.amount, expense.currency),
        expense.currency,
      ];
    }),
  ]);
