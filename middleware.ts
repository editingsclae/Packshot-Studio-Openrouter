import { NextRequest, NextResponse } from 'next/server';
import { AUTH_COOKIE_NAME, verifySessionToken } from '@/lib/auth';

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const isApiRoute = pathname === '/api' || pathname.startsWith('/api/');
  const appPassword = process.env.APP_PASSWORD;

  if (!appPassword) {
    if (process.env.NODE_ENV === 'production') {
      if (isApiRoute) {
        return NextResponse.json(
          {
            error:
              'Server misconfigured: APP_PASSWORD environment variable must be set in production.',
          },
          { status: 503 }
        );
      }
      return new NextResponse(
        '503 Service Unavailable: APP_PASSWORD is not configured in production.',
        {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        }
      );
    }
    return NextResponse.next();
  }

  if (pathname === '/login') {
    return NextResponse.next();
  }

  const cookieToken = req.cookies.get(AUTH_COOKIE_NAME)?.value;
  const isAuthenticated = await verifySessionToken(cookieToken, appPassword);

  if (isAuthenticated) {
    return NextResponse.next();
  }

  if (isApiRoute) {
    return NextResponse.json(
      { error: 'Authentication required. Please sign in at /login.' },
      { status: 401 }
    );
  }

  const loginUrl = req.nextUrl.clone();
  loginUrl.pathname = '/login';
  const intended = `${pathname}${search}`;
  loginUrl.search = intended && intended !== '/' ? `?next=${encodeURIComponent(intended)}` : '';
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
