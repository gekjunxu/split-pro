/** @jest-environment jsdom */

import { render, screen } from '@testing-library/react';
import React from 'react';

import { NativeSelect } from './native-select';

it('uses the dark native control palette with the app theme', () => {
  render(
    <NativeSelect aria-label="Trip">
      <option value="all">All trips</option>
    </NativeSelect>,
  );

  expect(screen.getByRole('combobox')).toHaveStyle('color-scheme: dark');
});
