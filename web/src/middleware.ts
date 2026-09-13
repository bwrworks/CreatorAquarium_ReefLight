import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifySessionToken } from './lib/auth-server';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public static assets, favicon, login page, and login auth API
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api/auth/login') ||
    pathname === '/login' ||
    pathname === '/favicon.ico' ||
    pathname === '/manifest.json' ||
    pathname === '/spectrum-reference.jpg'
  ) {
    return NextResponse.next();
  }

  // Check cryptographic session cookie
  const sessionCookie = request.cookies.get('reef_session')?.value;
  const { valid } = await verifySessionToken(sessionCookie);

  if (!valid) {
    // If accessing an API endpoint, return 401 Unauthorized
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized session' }, { status: 401 });
    }

    // Otherwise redirect browser to /login
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('from', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for static files
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
