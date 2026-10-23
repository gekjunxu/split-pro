/** @jest-environment jsdom */

import { act, screen } from '@testing-library/react';
import React from 'react';

import { renderWithProviders } from '~/tests/helpers/render';
import { createMockRouter } from '~/tests/helpers/router';
import MainLayout from './MainLayout';

class TestResizeObserver implements ResizeObserver {
  disconnect() {}

  observe(_target: Element, _options?: ResizeObserverOptions) {}

  takeRecords(): ResizeObserverEntry[] {
    return [];
  }

  unobserve(_target: Element) {}
}

it('marks the active navigation section for nested routes', () => {
  renderWithProviders(
    <MainLayout title="Overview">
      <p>Content</p>
    </MainLayout>,
    {
      router: createMockRouter({ pathname: '/groups/[groupId]', asPath: '/groups/7' }),
    },
  );
  expect(screen.getByText('Content')).toBeInTheDocument();
  screen.getAllByRole('link', { name: 'Groups' }).forEach((link) => {
    expect(link).toHaveAttribute('href', '/groups');
    expect(link.querySelector('span')).toHaveClass('text-cyan-500');
  });
  screen.getAllByRole('link', { name: 'Balances' }).forEach((link) => {
    expect(link.querySelector('span')).not.toHaveClass('text-cyan-500');
  });
});

it('does not overwrite the retained list position after returning from an expense', () => {
  const router = createMockRouter({
    pathname: '/groups/[groupId]',
    asPath: '/groups/scroll-state-test',
  });
  const { container, rerender } = renderWithProviders(
    <MainLayout title="Group">
      <div style={{ height: '2000px' }}>Expenses</div>
    </MainLayout>,
    { router },
  );
  const mainLayout = container.querySelector('#mainlayout') as HTMLDivElement;
  const routeChangeStart = (router.events.on as jest.Mock).mock.calls.find(
    ([eventName]) => 'routeChangeStart' === eventName,
  )?.[1] as (() => void) | undefined;
  const requestAnimationFrame = jest
    .spyOn(window, 'requestAnimationFrame')
    .mockImplementation((callback) => {
      callback(0);
      return 1;
    });
  const previousResizeObserver = globalThis.ResizeObserver;
  globalThis.ResizeObserver = TestResizeObserver;
  jest.useFakeTimers();

  try {
    mainLayout.scrollTop = 452.57;
    expect(routeChangeStart).toBeDefined();
    act(() => routeChangeStart?.());

    router.pathname = '/expenses/[expenseId]';
    router.asPath = '/expenses/1';
    act(() => {
      rerender(
        <MainLayout title="Expense">
          <div>Expense detail</div>
        </MainLayout>,
      );
    });

    router.pathname = '/groups/[groupId]';
    router.asPath = '/groups/scroll-state-test';
    act(() => {
      rerender(
        <MainLayout title="Group">
          <div style={{ height: '2000px' }}>Expenses</div>
        </MainLayout>,
      );
    });

    expect(mainLayout.scrollTop).toBe(452.57);

    mainLayout.scrollTop = 700;
    act(() => {
      jest.advanceTimersByTime(2000);
    });
    expect(mainLayout.scrollTop).toBe(700);
  } finally {
    jest.useRealTimers();
    requestAnimationFrame.mockRestore();
    globalThis.ResizeObserver = previousResizeObserver;
  }
});
