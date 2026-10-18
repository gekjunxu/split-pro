import { type NextRequest, NextResponse } from 'next/server';

const PUBLIC_FILE = /\.(.*)$/;

export function proxy(req: NextRequest) {
  if (
    req.nextUrl.pathname.startsWith('/_next') ||
    req.nextUrl.pathname.includes('/api/') ||
    PUBLIC_FILE.test(req.nextUrl.pathname)
  ) {
    return undefined;
  }

  if (req.nextUrl.pathname.startsWith('/pt')) {
    const destination = req.nextUrl.clone();
    destination.pathname = req.nextUrl.pathname.replace('/pt', '/pt-PT');

    return NextResponse.redirect(destination);
  }

  if (req.nextUrl.locale === 'default') {
    const locale = req.cookies.get('NEXT_LOCALE')?.value ?? 'en';

    const destination = req.nextUrl.clone();
    destination.pathname = `/${locale}${req.nextUrl.pathname}`;

    return NextResponse.redirect(destination);
  }

  return undefined;
}
