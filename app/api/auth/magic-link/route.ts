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
    const redirectTo = `${SITE_URL}/api/auth/callback`;

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
          type: 'magiclink',
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

    // Enviar email vía n8n webhook si está configurado, sino skip (devolver magic_link para testing).
    const webhookUrl = process.env.N8N_EMAIL_WEBHOOK_URL;
    const webhookSecret = process.env.N8N_EMAIL_WEBHOOK_SECRET;
    if (webhookUrl) {
      try {
        const r = await fetch(webhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(webhookSecret ? { 'X-Webhook-Secret': webhookSecret } : {}),
          },
          body: JSON.stringify({
            to: [email],
            from: process.env.EMAIL_FROM ?? 'Global66 Contratos <onboarding@resend.dev>',
            subject: 'Tu acceso a Global66 Contratos',
            html: `<p>Click el siguiente link para entrar. Válido por 1 hora.</p>
                   <p><a href="${magicLink}" style="background:#1F49B6;color:white;padding:14px 32px;border-radius:99px;text-decoration:none;font-weight:600">Entrar →</a></p>
                   <p style="color:#999;font-size:12px;word-break:break-all">Si el botón no funciona, copia: ${magicLink}</p>`,
            text: `Tu link de acceso: ${magicLink}`,
            replyTo: process.env.EMAIL_REPLY_TO,
            tags: ['magic-link', 'auth'],
          }),
        });
        if (!r.ok) throw new Error(`webhook ${r.status}: ${(await r.text()).slice(0, 200)}`);
      } catch (e: any) {
        return NextResponse.json(
          {
            error: 'email delivery failed: ' + e.message,
            magic_link: process.env.NODE_ENV !== 'production' ? magicLink : undefined,
          },
          { status: 500 },
        );
      }
    }

    return NextResponse.json({ ok: true, sent: !!webhookUrl });
  } catch (e: any) {
    return NextResponse.json(
      { error: 'magic-link handler crash: ' + e.message },
      { status: 500 },
    );
  }
}
