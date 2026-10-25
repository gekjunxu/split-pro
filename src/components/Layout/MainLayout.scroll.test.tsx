/** @jest-environment jsdom */

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { type NextRouter, useRouter } from 'next/router';

import MainLayout from './MainLayout';

jest.mock('next-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({
    children,
    href,
    className,
  }: React.PropsWithChildren<{ href: string; className?: string }>) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

jest.mock('next/router', () => ({
  useRouter: jest.fn(),
}));

class TestResizeObserver implements ResizeObserver {
  disconnect() {}

  observe(_target: Element, _options?: ResizeObserverOptions) {}

  takeRecords(): ResizeObserverEntry[] {
    return [];
  }

  unobserve(_target: Element) {}
}

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

const mockedUseRouter = jest.mocked(useRouter);

it('does not overwrite a user scroll that happens before delayed restoration', () => {
  jest.useFakeTimers();

  const routeHandlers = new Map<string, () => void>();
  const routeEvents: NextRouter['events'] = {
    on: (eventName, handler) => {
      routeHandlers.set(eventName, () => handler());
    },
    off: () => {},
    emit: () => {},
  };
  const router: NextRouter = {
    route: '/groups/[groupId]',
    pathname: '/groups/[groupId]',
    query: {},
    asPath: '/groups/scroll-state-test',
    basePath: '',
    isLocaleDomain: false,
    isFallback: false,
    isReady: true,
    isPreview: false,
    events: routeEvents,
    push: jest.fn(() => Promise.resolve(true)),
    replace: jest.fn(() => Promise.resolve(true)),
    reload: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
    prefetch: jest.fn(() => Promise.resolve()),
    beforePopState: jest.fn(),
  };
  mockedUseRouter.mockReturnValue(router);

  const animationFrames: FrameRequestCallback[] = [];
  const requestAnimationFrame = jest
    .spyOn(window, 'requestAnimationFrame')
    .mockImplementation((callback) => {
      animationFrames.push(callback);
      return animationFrames.length;
    });
  const previousActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const previousResizeObserver = globalThis.ResizeObserver;
  const previousScrollTo = window.scrollTo;
  globalThis.ResizeObserver = TestResizeObserver;
  window.scrollTo = jest.fn();

  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  try {
    act(() => {
      root.render(
        <MainLayout title="Group">
          <div className="h-[2000px]">Expenses</div>
        </MainLayout>,
      );
    });

    const mainLayout = container.querySelector<HTMLDivElement>('#mainlayout');
    if (!mainLayout) {
      throw new Error('Main layout was not rendered');
    }
    mainLayout.scrollTop = 452.57;
    act(() => routeHandlers.get('routeChangeStart')?.());
    mainLayout.scrollTop = 0;

    router.pathname = '/expenses/[expenseId]';
    router.asPath = '/expenses/1';
    act(() => {
      root.render(
        <MainLayout title="Expense">
          <div>Expense detail</div>
        </MainLayout>,
      );
    });

    router.pathname = '/groups/[groupId]';
    router.asPath = '/groups/scroll-state-test';
    act(() => {
      root.render(
        <MainLayout title="Group">
          <div className="h-[2000px]">Expenses</div>
        </MainLayout>,
      );
    });

    mainLayout.scrollTop = 90;
    mainLayout.dispatchEvent(new Event('wheel'));
    mainLayout.dispatchEvent(new Event('scroll'));

    const restoreFrame = animationFrames[animationFrames.length - 1];
    act(() => restoreFrame?.(0));
    act(() => {
      jest.advanceTimersByTime(100);
    });

    expect(mainLayout.scrollTop).toBe(90);
  } finally {
    act(() => root.unmount());
    document.body.removeChild(container);
    requestAnimationFrame.mockRestore();
    globalThis.ResizeObserver = previousResizeObserver;
    window.scrollTo = previousScrollTo;
    globalThis.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
    jest.useRealTimers();
    mockedUseRouter.mockReset();
  }
});

it('keeps saving scroll after a rapid return before the route effect settles', () => {
  jest.useFakeTimers();

  const routeHandlers = new Map<string, () => void>();
  const routeEvents: NextRouter['events'] = {
    on: (eventName, handler) => {
      routeHandlers.set(eventName, () => handler());
    },
    off: () => {},
    emit: () => {},
  };
  const router: NextRouter = {
    route: '/groups/[groupId]',
    pathname: '/groups/[groupId]',
    query: {},
    asPath: '/groups/scroll-state-test',
    basePath: '',
    isLocaleDomain: false,
    isFallback: false,
    isReady: true,
    isPreview: false,
    events: routeEvents,
    push: jest.fn(() => Promise.resolve(true)),
    replace: jest.fn(() => Promise.resolve(true)),
    reload: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
    prefetch: jest.fn(() => Promise.resolve()),
    beforePopState: jest.fn(),
  };
  mockedUseRouter.mockReturnValue(router);

  const animationFrames: FrameRequestCallback[] = [];
  const requestAnimationFrame = jest
    .spyOn(window, 'requestAnimationFrame')
    .mockImplementation((callback) => {
      animationFrames.push(callback);
      return animationFrames.length;
    });
  const previousActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const previousResizeObserver = globalThis.ResizeObserver;
  const previousScrollTo = window.scrollTo;
  globalThis.ResizeObserver = TestResizeObserver;
  window.scrollTo = jest.fn();

  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  try {
    act(() => {
      root.render(
        <MainLayout title="Group">
          <div className="h-[2000px]">Expenses</div>
        </MainLayout>,
      );
    });

    const mainLayout = container.querySelector<HTMLDivElement>('#mainlayout');
    if (!mainLayout) {
      throw new Error('Main layout was not rendered');
    }

    mainLayout.scrollTop = 452;
    act(() => routeHandlers.get('routeChangeStart')?.());
    act(() => routeHandlers.get('routeChangeComplete')?.());
    act(() => routeHandlers.get('routeChangeStart')?.());
    act(() => routeHandlers.get('routeChangeComplete')?.());

    mainLayout.scrollTop = 900;
    act(() => {
      mainLayout.dispatchEvent(new Event('wheel'));
      mainLayout.dispatchEvent(new Event('scroll'));
      routeHandlers.get('routeChangeStart')?.();
      routeHandlers.get('routeChangeComplete')?.();
    });

    router.pathname = '/expenses/[expenseId]';
    router.asPath = '/expenses/1';
    act(() => {
      root.render(
        <MainLayout title="Expense">
          <div>Expense detail</div>
        </MainLayout>,
      );
    });

    router.pathname = '/groups/[groupId]';
    router.asPath = '/groups/scroll-state-test';
    act(() => {
      root.render(
        <MainLayout title="Group">
          <div className="h-[2000px]">Expenses</div>
        </MainLayout>,
      );
    });

    const restoreFrame = animationFrames[animationFrames.length - 1];
    act(() => restoreFrame?.(0));

    expect(mainLayout.scrollTop).toBe(900);
  } finally {
    act(() => root.unmount());
    document.body.removeChild(container);
    requestAnimationFrame.mockRestore();
    globalThis.ResizeObserver = previousResizeObserver;
    window.scrollTo = previousScrollTo;
    globalThis.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
    jest.useRealTimers();
    mockedUseRouter.mockReset();
  }
});
