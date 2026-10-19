import type { DataEntity } from '@actual-app/core/types/models';
import { renderHook } from '@testing-library/react';

import type { QueryDataEntity } from '#components/reports/ReportOptions';
import { SpreadsheetProvider, useSpreadsheet } from '#hooks/useSpreadsheet';

import { createCustomSpreadsheet } from './custom-spreadsheet';
import { fetchSpreadsheetQueryData } from './fetchSpreadsheetQueryData';

vi.mock('@actual-app/core/platform/client/connection', () => ({
  send: vi.fn().mockResolvedValue({ filters: [] }),
  listen: vi.fn(() => vi.fn()),
}));
vi.mock('./fetchSpreadsheetQueryData');

const transaction: QueryDataEntity = {
  date: '2026-01',
  category: 'category',
  categoryHidden: false,
  categoryGroup: 'group',
  categoryGroupHidden: false,
  account: 'account',
  accountOffBudget: false,
  payee: 'payee',
  transferAccount: '',
  notes: '#red #circle',
  amount: -100,
};

it.each([
  { categoryHidden: true },
  { categoryGroupHidden: true },
  { accountOffBudget: true },
  { category: null },
])(
  'does not create empty combinations from excluded transactions %j',
  async excluded => {
    vi.mocked(fetchSpreadsheetQueryData).mockResolvedValue({
      assets: [],
      debts: [
        { ...transaction, ...excluded },
        { ...transaction, notes: '#red', amount: -50 },
        { ...transaction, notes: '#red', amount: -25, date: '2026-02' },
      ],
    });
    const { result } = renderHook(useSpreadsheet, {
      wrapper: SpreadsheetProvider,
    });
    const setData = vi.fn<(data: DataEntity) => void>();
    await createCustomSpreadsheet({
      startDate: '2026-01',
      endDate: '2026-02',
      interval: 'Monthly',
      categories: { list: [], grouped: [] },
      conditions: [],
      conditionsOp: 'and',
      showEmpty: true,
      showOffBudget: false,
      showHiddenCategories: false,
      showUncategorized: false,
      trimIntervals: false,
      groupBy: 'Tag',
      tags: [
        { id: 'red', tag: 'red' },
        { id: 'circle', tag: 'circle' },
      ],
    })(result.current, setData);

    const data = setData.mock.calls[0][0];
    expect(data.data?.map(group => group.name)).toEqual(
      expect.arrayContaining(['#red', '#circle', 'Untagged']),
    );
    expect(data.data).toHaveLength(3);
    expect(data.totalDebts).toBe(-75);
    expect(data.intervalData.map(interval => interval.totalDebts)).toEqual([
      -50, -25,
    ]);
  },
);

it('includes transactions from the rest of the last week in weekly reports', async () => {
  const weeklyTransactions = [
    { ...transaction, date: '2024-09-30', amount: -100 },
    // Falls in the week of 2024-10-28, i.e. after the selected end date.
    { ...transaction, date: '2024-10-30', amount: -25 },
  ];

  // Mirror `makeQuery`, which filters transactions by the requested range.
  vi.mocked(fetchSpreadsheetQueryData).mockImplementation(
    async ({ endDate }) => ({
      assets: [],
      debts: weeklyTransactions.filter(t => t.date <= endDate),
    }),
  );

  const { result } = renderHook(useSpreadsheet, {
    wrapper: SpreadsheetProvider,
  });
  const setData = vi.fn<(data: DataEntity) => void>();
  await createCustomSpreadsheet({
    startDate: '2024-09-30',
    endDate: '2024-10-28',
    interval: 'Weekly',
    categories: { list: [], grouped: [] },
    conditions: [],
    conditionsOp: 'and',
    showEmpty: true,
    showOffBudget: false,
    showHiddenCategories: false,
    showUncategorized: false,
    trimIntervals: false,
    groupBy: 'Tag',
    tags: [{ id: 'red', tag: 'red' }],
    firstDayOfWeekIdx: '1',
  })(result.current, setData);

  const data = setData.mock.calls[0][0];
  expect(data.intervalData.map(interval => interval.totalDebts)).toEqual([
    -100, 0, 0, 0, -25,
  ]);
  expect(data.intervalData.at(-1)?.intervalEndDate).toBe('2024-11-03');
});
