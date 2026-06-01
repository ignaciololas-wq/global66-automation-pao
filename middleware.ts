// Refresh Supabase session cookies on each request + opcional protect rutas.
// AUTH_ENABLED=false → bypass total, deja pasar todo (dev mode).

import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

const AUTH_ENABLED = (process.env.AUTH_ENABLED ?? 'false').toLowerCase() === 'true';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.SUPABASE_ANON_KEY ??
  process.env.SUPABASE_PUBLISHABLE_KEY ??
  '';

const PUBLIC_PATHS = ['/', '/login', '/auth', '/p', '/api/auth', '/api/settings', '/api/slack'];

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return response;

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  // Refrescar sesión (token-rotation transparente).
  const { data: { user } } = await supabase.auth.getUser();

  if (AUTH_ENABLED && !user && !isPublic(request.nextUrl.pathname)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.searchParams.set('next', request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: [
    // Todas las rutas excepto static/image optimization/favicon.
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
