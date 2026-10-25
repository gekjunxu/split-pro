/** @jest-environment jsdom */

import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';

jest.mock('next/head', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock('~/components/Account/CashExchangeDialog', () => ({
  CashExchangeDialog: () => null,
}));
jest.mock('~/components/Layout/MainLayout', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock('~/components/ui/popover', () => ({
  Popover: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PopoverContent: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
    <div {...props}>{children}</div>
  ),
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock('~/utils/api', () => ({ api: {} }));
jest.mock('~/utils/i18n/server', () => ({
  withI18nStaticProps: () => () => ({ props: {} }),
}));

import { AnalyticsScopePicker } from './card-analytics';

beforeAll(() => {
  HTMLElement.prototype.scrollIntoView = jest.fn();
});

describe('AnalyticsScopePicker', () => {
  it('opens as a themed menu and reports the selected scope', () => {
    const onValueChange = jest.fn();

    render(
      <AnalyticsScopePicker
        options={[
          { value: 'all', label: 'All trips' },
          { value: 'viet', label: 'Viet' },
        ]}
        value="all"
        onValueChange={onValueChange}
      />,
    );

    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.click(screen.getByRole('option', { name: 'Viet' }));

    expect(onValueChange).toHaveBeenCalledWith('viet');
  });
});
