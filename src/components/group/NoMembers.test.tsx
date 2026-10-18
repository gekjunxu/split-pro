/** @jest-environment jsdom */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';

import NoMembers from './NoMembers';

jest.mock('./AddMembers', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => children,
}));

const originalBasePath = process.env.NEXT_PUBLIC_APP_BASE_PATH;

describe('NoMembers', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_APP_BASE_PATH = '/splitprointegration';
  });

  afterEach(() => {
    if (undefined === originalBasePath) {
      delete process.env.NEXT_PUBLIC_APP_BASE_PATH;
    } else {
      process.env.NEXT_PUBLIC_APP_BASE_PATH = originalBasePath;
    }
  });

  it('copies group invitation links inside the configured app base path', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    render(
      <NoMembers
        group={
          {
            id: 1,
            publicId: 'group-public-id',
            archivedAt: null,
            groupUsers: [],
          } as never
        }
        enableSendingInvites={false}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /invite link/i }));

    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(
        'http://localhost/splitprointegration/join-group?groupId=group-public-id',
      ),
    );
  });
});
