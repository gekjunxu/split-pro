import { getAppUrl, normalizeAppBasePath, withAppBasePath } from './appBasePath';

describe('normalizeAppBasePath', () => {
  it.each([
    [undefined, ''],
    ['', ''],
    ['/', ''],
    ['splitprointegration', '/splitprointegration'],
    ['/splitprointegration/', '/splitprointegration'],
    ['//splitprointegration///', '/splitprointegration'],
  ])('normalizes %p to %p', (input, expected) => {
    expect(normalizeAppBasePath(input)).toBe(expected);
  });
});

describe('withAppBasePath', () => {
  it('leaves root deployments unchanged', () => {
    expect(withAppBasePath('/api/trpc', '')).toBe('/api/trpc');
  });

  it('prefixes app-relative URLs with the configured base path', () => {
    expect(withAppBasePath('/api/trpc', '/splitprointegration')).toBe(
      '/splitprointegration/api/trpc',
    );
    expect(withAppBasePath('icons/logo.svg', '/splitprointegration')).toBe(
      '/splitprointegration/icons/logo.svg',
    );
  });

  it('does not add a duplicate prefix or alter external URLs', () => {
    expect(withAppBasePath('/splitprointegration/api/trpc', '/splitprointegration')).toBe(
      '/splitprointegration/api/trpc',
    );
    expect(withAppBasePath('https://cdn.example.com/logo.svg', '/splitprointegration')).toBe(
      'https://cdn.example.com/logo.svg',
    );
    expect(withAppBasePath('/splitprointegration?next=/home', '/splitprointegration')).toBe(
      '/splitprointegration?next=/home',
    );
  });

  it('preserves query strings when prefixing an API URL', () => {
    expect(withAppBasePath('/api/locale?locale=fr', '/splitprointegration')).toBe(
      '/splitprointegration/api/locale?locale=fr',
    );
  });
});

describe('getAppUrl', () => {
  it('keeps preview invite URLs under the app base path', () => {
    expect(
      getAppUrl(
        '/join-group?groupId=group-public-id',
        'https://prodesk.tail960ba6.ts.net',
        '/splitprointegration',
      ),
    ).toBe(
      'https://prodesk.tail960ba6.ts.net/splitprointegration/join-group?groupId=group-public-id',
    );
  });

  it('keeps shared app URLs rooted in the configured deployment', () => {
    expect(getAppUrl('/', 'https://prodesk.tail960ba6.ts.net', '/splitprointegration')).toBe(
      'https://prodesk.tail960ba6.ts.net/splitprointegration/',
    );
    expect(getAppUrl('/', 'https://prodesk.tail960ba6.ts.net', '')).toBe(
      'https://prodesk.tail960ba6.ts.net/',
    );
  });
});
