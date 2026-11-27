import { NextResponse, type NextRequest } from 'next/server';

/**
 * CSP con nonce per richiesta: solo gli script che Next marca con il nonce possono girare.
 * Un XSS che inietta <script> o un attributo onclick viene bloccato dal browser.
 */
export function middleware(req: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const isProd = process.env.NODE_ENV === 'production';
  const api = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isProd ? '' : " 'unsafe-eval'"}`,
    "style-src 'self' 'unsafe-inline'", // gli stili inline di React/Tailwind; gli script restano strettissimi
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self' ${api}`,
    "media-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isProd ? ['upgrade-insecure-requests'] : []),
  ].join('; ');

  const headers = new Headers(req.headers);
  headers.set('x-nonce', nonce);
  headers.set('content-security-policy', csp);

  const res = NextResponse.next({ request: { headers } });
  res.headers.set('Content-Security-Policy', csp);
  return res;
}

export const config = {
  matcher: [{ source: '/((?!_next/static|_next/image|favicon.ico).*)', missing: [{ type: 'header', key: 'next-router-prefetch' }] }],
};
