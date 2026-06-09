import {
  buildPaymentSourceAnalyticsCsv,
  buildTravelExpensesCsv,
  createCsvFileName,
  moneyToCsvAmount,
  toCsv,
  type TravelExpenseCsvExpense,
} from '~/lib/csvExport';

const john = { id: 1, name: 'John', email: 'john@example.com' };
const jane = { id: 2, name: 'Jane', email: 'jane@example.com' };

const expense = (
  overrides: Partial<TravelExpenseCsvExpense> = {},
): TravelExpenseCsvExpense => ({
  id: 'expense-1',
  expenseDate: new Date('2026-05-12T08:00:00.000Z'),
  name: 'Ichiran Ramen',
  paidByUser: john,
  addedByUser: jane,
  card: { name: 'Trust Visa' },
  currency: 'SGD',
  amount: 1098n,
  originalAmount: 1200n,
  originalCurrency: 'JPY',
  conversionRate: 0.00915,
  splitType: 'EQUAL',
  category: 'Dining',
  expenseParticipants: [{ user: john }, { user: jane }],
  expenseNotes: [{ note: 'Lunch, Tokyo' }],
  ...overrides,
});

describe('csvExport', () => {
  it('escapes commas, quotes, and newlines using RFC4180-style cells', () => {
    const csv = toCsv([
      ['Description', 'Notes'],
      ['Ichiran, Ramen', 'Paid "cash"\nReceipt kept'],
    ]);

    expect(csv).toBe(
      '"Description","Notes"\r\n"Ichiran, Ramen","Paid ""cash""\nReceipt kept"',
    );
  });

  it('formats minor-unit money values as plain decimal spreadsheet values', () => {
    expect(moneyToCsvAmount(1098n, 'SGD')).toBe('10.98');
    expect(moneyToCsvAmount(1200n, 'JPY')).toBe('1200');
    expect(moneyToCsvAmount(-546n, 'SGD')).toBe('-5.46');
  });

  it('creates stable dated filenames from group names', () => {
    expect(
      createCsvFileName({
        prefix: 'expenses',
        groupName: 'Japan Trip!',
        date: new Date('2026-06-09T12:00:00.000Z'),
      }),
    ).toBe('expenses-japan-trip-2026-06-09.csv');
  });

  it('builds travel expense rows with paid and settlement currency fields', () => {
    const csv = buildTravelExpensesCsv([expense()]);
    const expectedRow = [
      '"expense-1"',
      '"2026-05-12"',
      '"Ichiran Ramen"',
      '"John"',
      '"Trust Visa"',
      '"SGD"',
      '"10.98"',
      '"1200"',
      '"JPY"',
      '"0.00915"',
      '"EQUAL"',
      '"John, Jane"',
      '"2"',
      '"Dining"',
      '"Jane"',
      '"Lunch, Tokyo"',
    ].join(',');

    expect(csv).toContain(expectedRow);
  });

  it('falls back to settlement values for non-overseas expenses', () => {
    const csv = buildTravelExpensesCsv([
      expense({
        amount: 546n,
        originalAmount: null,
        originalCurrency: null,
        conversionRate: null,
      }),
    ]);

    expect(csv).toContain('"SGD","5.46","5.46","SGD","1"');
  });

  it('builds a lean payment source analytics CSV', () => {
    const csv = buildPaymentSourceAnalyticsCsv([expense()]);
    const expectedHeader = [
      '"Date"',
      '"Expense"',
      '"Payment Source"',
      '"Original Currency"',
      '"Original Amount"',
      '"FX Rate"',
      '"Settlement Amount"',
      '"Settlement Currency"',
    ].join(',');
    const expected = [
      expectedHeader,
      '"2026-05-12","Ichiran Ramen","Trust Visa","JPY","1200","0.00915","10.98","SGD"',
    ].join('\r\n');

    expect(csv).toBe(expected);
  });
});
