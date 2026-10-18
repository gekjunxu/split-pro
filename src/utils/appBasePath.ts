export const normalizeAppBasePath = (basePath?: string) => {
  if (!basePath) {
    return '';
  }

  const trimmedBasePath = basePath.trim().replace(/^\/+|\/+$/g, '');

  return '' === trimmedBasePath ? '' : `/${trimmedBasePath}`;
};

export const appBasePath = normalizeAppBasePath(process.env.NEXT_PUBLIC_APP_BASE_PATH);

export const withAppBasePath = (url: string, basePath = process.env.NEXT_PUBLIC_APP_BASE_PATH) => {
  const normalizedBasePath = normalizeAppBasePath(basePath);

  if ('' === normalizedBasePath || /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(url)) {
    return url;
  }

  const suffixIndex = url.search(/[?#]/);
  const pathname = -1 === suffixIndex ? url : url.slice(0, suffixIndex);
  const suffix = -1 === suffixIndex ? '' : url.slice(suffixIndex);
  const normalizedPathname = pathname.startsWith('/') ? pathname : `/${pathname}`;

  if (
    normalizedPathname === normalizedBasePath ||
    normalizedPathname.startsWith(`${normalizedBasePath}/`)
  ) {
    return url;
  }

  return `${normalizedBasePath}${normalizedPathname}${suffix}`;
};
