import { NextResponse } from 'next/server';
import { AUTH_ENABLED, ADMIN_EMAILS, SITE_URL } from '@/lib/config';
import { createAdminClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  // Flags estaticos (config + presencia de keys).
  const base = {
    ts: new Date().toISOString(),
    runtime: 'next-app-router',
    auth_enabled: AUTH_ENABLED,
    admin_emails_count: ADMIN_EMAILS.length,
    site_url: SITE_URL,
    keys: {
      anthropic: !!(process.env.ANTHROPIC_API_KEY ?? process.env.ANHTROPIC_API_KEY ?? process.env.CLAUDE_API_KEY),
      gemini: !!process.env.GEMINI_API_KEY,
      n8n_email: !!process.env.N8N_EMAIL_WEBHOOK_URL,
      slack: !!process.env.SLACK_BOT_TOKEN,
      resend: !!process.env.RESEND_API_KEY,
    },
  };

  // Ping real a la base de datos: query liviano (head + count) contra sociedades.
  const startedAt = performance.now();
  try {
    const sb = createAdminClient();
    const { error } = await sb
      .from('sociedades')
      .select('id', { count: 'exact', head: true });

    const latency_ms = Math.round(performance.now() - startedAt);

    if (error) {
      return NextResponse.json(
        { ok: false, ...base, db: { ok: false, latency_ms }, error: error.message },
        { status: 503 },
      );
    }

    return NextResponse.json({
      ok: true,
      ...base,
      db: { ok: true, latency_ms },
    });
  } catch (err) {
    const latency_ms = Math.round(performance.now() - startedAt);
    const message = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json(
      { ok: false, ...base, db: { ok: false, latency_ms }, error: message },
      { status: 503 },
    );
  }
}
