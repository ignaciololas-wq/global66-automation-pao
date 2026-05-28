// GET /api/auth/callback — intercambia code (PKCE) o token_hash (OTP) por sesión.
// Set cookies via supabase ssr client + redirect a next.

import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { SITE_URL } from '@/lib/config';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const tokenHash = url.searchParams.get('token_hash');
  const type = (url.searchParams.get('type') ?? 'magiclink') as
    | 'signup' | 'invite' | 'magiclink' | 'recovery' | 'email_change';
  const next = url.searchParams.get('next') ?? '/admin';
  const errParam = url.searchParams.get('error_description') ?? url.searchParams.get('error');

  function redirectErr(msg: string) {
    const target = new URL('/login', SITE_URL);
    target.searchParams.set('auth_error', msg);
    return NextResponse.redirect(target);
  }

  if (errParam) return redirectErr(errParam);
  if (!code && !tokenHash) return redirectErr('missing code or token_hash');

  const supabase = await createServerClient();

  try {
    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) return redirectErr(error.message);
    } else if (tokenHash) {
      const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
      if (error) return redirectErr(error.message);
    }
  } catch (e: any) {
    return redirectErr(e.message);
  }

  // Validar next path (anti open-redirect).
  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/admin';
  return NextResponse.redirect(new URL(safeNext, SITE_URL));
}
