// GET y POST /api/auth/logout — limpia cookies + redirect (GET) o JSON (POST).
import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { SITE_URL } from '@/lib/config';

async function doSignOut() {
  try {
    const supabase = await createServerClient();
    await supabase.auth.signOut();
  } catch {
    // ignore
  }
}

export async function GET(request: NextRequest) {
  await doSignOut();
  const next = new URL(request.url).searchParams.get('next') ?? '/login';
  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/login';
  const target = new URL(safeNext + (safeNext.includes('?') ? '&' : '?') + 'logout=' + Date.now(), SITE_URL);
  return NextResponse.redirect(target);
}

export async function POST() {
  await doSignOut();
  return NextResponse.json({ ok: true });
}
