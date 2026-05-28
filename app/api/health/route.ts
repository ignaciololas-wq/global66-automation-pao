import { NextResponse } from 'next/server';
import { AUTH_ENABLED, ADMIN_EMAILS, SITE_URL } from '@/lib/config';

export async function GET() {
  return NextResponse.json({
    ok: true,
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
  });
}
