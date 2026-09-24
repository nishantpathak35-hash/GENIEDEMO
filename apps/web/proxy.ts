import { NextResponse, type NextRequest } from 'next/server';

/**
 * Sign-in keeps the address it was sent from.
 *
 * `docs/design/03-navigation.html`: sign-in always lands at All projects on
 * the firm's Today — and a person sent to sign in from a pasted link is sent
 * back to that link afterwards, not to Today. The shell layout cannot see the
 * path it was asked for, so the redirect happens here, before any screen
 * renders, carrying the path in `next`. Only a path on this origin is ever
 * carried: `signIn` refuses anything else.
 *
 * Not an authorization check — the server does those on every read. There is
 * no reason to render sixty screens' worth of refusals to someone who has not
 * signed in, and this is where that is decided once.
 */
export function proxy(request: NextRequest): NextResponse {
  const { pathname, search } = request.nextUrl;
  if (pathname.startsWith('/sign-in')) return NextResponse.next();
  const credential = request.cookies.get('cog_credential')?.value;
  if (credential !== undefined && credential.length > 0) return NextResponse.next();
  const url = request.nextUrl.clone();
  url.pathname = '/sign-in';
  url.search = '';
  const here = `${pathname}${search}`;
  if (here !== '/') url.searchParams.set('next', here);
  return NextResponse.redirect(url);
}

export const config = {
  // every page; never a static file or Next's own routes
  matcher: ['/((?!_next|favicon\.ico|.*\.(?:png|svg|woff2|ico)$).*)'],
};
