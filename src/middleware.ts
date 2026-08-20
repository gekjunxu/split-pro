import { type NextRequest, NextResponse } from 'next/server';
import { appBasePath } from '~/utils/paths';

const PUBLIC_FILE = /\.(.*)$/;

export function middleware(req: NextRequest) {
  const requestPath = req.nextUrl.pathname;
  const pathname =
    appBasePath && (requestPath === appBasePath || requestPath.startsWith(`${appBasePath}/`))
      ? requestPath.slice(appBasePath.length) || '/'
      : requestPath;

  if (pathname.startsWith('/_next') || pathname.includes('/api/') || PUBLIC_FILE.test(pathname)) {
    return;
  }

  if (pathname.startsWith('/pt')) {
    return NextResponse.redirect(
      new URL(`${appBasePath}${pathname.replace('/pt', '/pt-PT')}${req.nextUrl.search}`, req.url),
    );
  }

  if (req.nextUrl.locale === 'default') {
    const locale = req.cookies.get('NEXT_LOCALE')?.value ?? 'en';

    return NextResponse.redirect(
      new URL(`${appBasePath}/${locale}${pathname}${req.nextUrl.search}`, req.url),
    );
  }
}
