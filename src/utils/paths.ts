const configuredBasePath = process.env.NEXT_PUBLIC_BASE_PATH?.trim() ?? '';

export const appBasePath = configuredBasePath
  ? `/${configuredBasePath.replace(/^\/+|\/+$/g, '')}`
  : '';

export const withBasePath = (path: string) => {
  if (
    !appBasePath ||
    !path.startsWith('/') ||
    path === appBasePath ||
    path.startsWith(`${appBasePath}/`)
  ) {
    return path;
  }

  return `${appBasePath}${path}`;
};

export const getAppUrlFromNextAuthUrl = (nextAuthUrl: string) =>
  nextAuthUrl.replace(/\/api\/auth\/?$/, '');
