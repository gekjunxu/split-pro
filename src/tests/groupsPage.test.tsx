/** @jest-environment jsdom */

import { screen } from '@testing-library/react';
import React from 'react';

import { renderWithProviders } from '~/tests/helpers/render';
import { createTestUser } from '~/tests/helpers/user';

jest.mock('~/components/group/CreateGroup', () => ({
  CreateGroup: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('~/utils/api', () => ({
  api: {
    group: {
      getAllGroupsWithBalances: {
        useQuery: () => ({ data: [], isPending: false }),
      },
    },
  },
}));
jest.mock('next/head', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('next-themes', () => ({
  ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
}));

import GroupsPage from '~/pages/groups';

it('renders the add-group icon at a visible size', () => {
  renderWithProviders(
    <GroupsPage
      user={{
        ...createTestUser(),
        name: 'Alex Example',
        email: 'alex@example.test',
        image: '',
        defaultCurrency: 'USD',
        bankingId: '',
        obapiProviderId: '',
      }}
    />,
  );

  const addGroupButton = screen.getByRole('button', { name: 'Create a group' });
  expect(addGroupButton.querySelector('svg')).toHaveClass('h-6', 'w-6');
});
