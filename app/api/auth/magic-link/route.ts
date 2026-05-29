// POST /api/auth/magic-link — manda magic link al email. Auto-crea user.
// Email se entrega via n8n webhook (preferido) o Resend.

import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { SITE_URL } from '@/lib/config';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const email = (body?.email ?? '').trim().toLowerCase();
    if (!email) {
      return NextResponse.json({ error: 'email required' }, { status: 400 });
    }

    const admin = createAdminClient();
    // Client-side handler: lee fragment (#access_token) o query (token_hash/code).
    // El server route /api/auth/callback no puede ver el fragment que manda
    // Supabase por default → "missing code or token_hash". /auth/confirm sí.
    const redirectTo = `${SITE_URL}/auth/confirm`;

    // Buscar usuario; auto-crear si no existe.
    let user;
    try {
      const { data, error } = await (admin.auth as any).admin.listUsers();
      if (error) throw error;
      user = (data.users as any[]).find(
        (u) => (u.email ?? '').toLowerCase() === email,
      );
    } catch (e: any) {
      return NextResponse.json(
        { error: 'listUsers failed: ' + e.message },
        { status: 500 },
      );
    }

    if (!user) {
      const { data, error } = await (admin.auth as any).admin.createUser({
        email,
        email_confirm: true,
      });
      if (error) {
        return NextResponse.json(
          { error: 'createUser failed: ' + error.message },
          { status: 500 },
        );
      }
      user = data.user;
    }

    // Email delivery — orden de preferencia:
    //  1. n8n webhook custom (si N8N_EMAIL_WEBHOOK_URL existe y no está vacío)
    //  2. Resend API (si RESEND_API_KEY existe)
    //  3. Supabase Auth built-in (default — Supabase manda el mail con su SMTP)
    const webhookUrl = (process.env.N8N_EMAIL_WEBHOOK_URL ?? '').trim();
    const webhookSecret = (process.env.N8N_EMAIL_WEBHOOK_SECRET ?? '').trim();
    const resendKey = (process.env.RESEND_API_KEY ?? '').trim();

    // Si tenemos custom webhook O Resend → generamos link y mandamos nosotros.
    if (webhookUrl || resendKey) {
      let magicLink;
      try {
        const { data, error } = await (admin.auth as any).admin.generateLink({
          type: 'magiclink',
          email,
          options: { redirectTo },
        });
        if (error) throw error;
        const hashedToken = data?.properties?.hashed_token;
        if (hashedToken) {
          const params = new URLSearchParams({
            token_hash: hashedToken,
            type: 'email',
            next: '/admin',
          });
          magicLink = `${redirectTo}?${params.toString()}`;
        } else {
          magicLink = data?.properties?.action_link;
        }
        if (!magicLink) throw new Error('no link returned');
      } catch (e: any) {
        return NextResponse.json(
          { error: 'generateLink failed: ' + e.message },
          { status: 500 },
        );
      }

      const from = process.env.EMAIL_FROM ?? 'Global66 Contratos <onboarding@resend.dev>';
      const subject = 'Tu acceso a Global66 Contratos';
      const html = `<p>Click el siguiente link para entrar. Válido por 1 hora.</p>
        <p><a href="${magicLink}" style="background:#1F49B6;color:white;padding:14px 32px;border-radius:99px;text-decoration:none;font-weight:600">Entrar →</a></p>
        <p style="color:#999;font-size:12px;word-break:break-all">Si el botón no funciona, copia: ${magicLink}</p>`;
      const text = `Tu link de acceso: ${magicLink}`;

      try {
        if (webhookUrl) {
          const r = await fetch(webhookUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(webhookSecret ? { 'X-Webhook-Secret': webhookSecret } : {}),
            },
            body: JSON.stringify({
              to: [email], from, subject, html, text,
              replyTo: process.env.EMAIL_REPLY_TO,
              tags: ['magic-link', 'auth'],
            }),
          });
          if (!r.ok) throw new Error(`webhook ${r.status}: ${(await r.text()).slice(0, 200)}`);
        } else {
          const r = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              from, to: [email], subject, html, text,
              reply_to: process.env.EMAIL_REPLY_TO,
            }),
          });
          if (!r.ok) throw new Error(`resend ${r.status}: ${(await r.text()).slice(0, 200)}`);
        }
      } catch (e: any) {
        // No devolver el magic_link en la respuesta — es una credencial de
        // login y puede quedar en logs. Detalle al server, mensaje genérico al cliente.
        console.error('[magic-link] email delivery failed:', e.message);
        return NextResponse.json(
          { error: 'No se pudo enviar el enlace. Intentá de nuevo en unos minutos.' },
          { status: 500 },
        );
      }
      return NextResponse.json({ ok: true, sent: true, via: webhookUrl ? 'n8n' : 'resend' });
    }

    // Default: Supabase Auth manda el mail por su cuenta (SMTP built-in o configurado en dashboard).
    // Usa signInWithOtp via cliente con anon key — esto encola el mail desde Supabase Auth.
    try {
      const { createClient } = await import('@supabase/supabase-js');
      const { SUPABASE_URL, SUPABASE_ANON_KEY } = await import('@/lib/config');
      const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      const { error } = await anon.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: redirectTo, shouldCreateUser: true },
      });
      if (error) throw error;
    } catch (e: any) {
      return NextResponse.json(
        { error: 'Supabase signInWithOtp failed: ' + e.message },
        { status: 500 },
      );
    }
    return NextResponse.json({ ok: true, sent: true, via: 'supabase' });
  } catch (e: any) {
    return NextResponse.json(
      { error: 'magic-link handler crash: ' + e.message },
      { status: 500 },
    );
  }
}
