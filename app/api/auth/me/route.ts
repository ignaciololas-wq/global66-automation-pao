import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { AUTH_ENABLED, ADMIN_EMAILS, SITE_URL } from '@/lib/config';

export async function GET() {
  const auth = await getCurrentUser();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error, auth_enabled: AUTH_ENABLED },
      { status: auth.status ?? 401 },
    );
  }
  return NextResponse.json({
    ok: true,
    auth_enabled: AUTH_ENABLED,
    bypass: auth.bypass,
    email: auth.email,
    user_id: auth.user_id,
    roles: auth.roles,
    sociedades: auth.sociedades,
    display_name: auth.display_name,
    avatar_url: auth.avatar_url,
    admin_emails_count: ADMIN_EMAILS.length,
    site_url: SITE_URL,
  });
}
