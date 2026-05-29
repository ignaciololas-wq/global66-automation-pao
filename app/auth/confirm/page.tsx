'use client';

// Handler universal de magic link. Cubre los 3 formatos que Supabase puede mandar:
//  1. Fragment implicit:  /auth/confirm#access_token=...&refresh_token=...   (signInWithOtp default)
//  2. Query token_hash:   /auth/confirm?token_hash=...&type=email            (generateLink server-side)
//  3. Query code (PKCE):  /auth/confirm?code=...                             (pkce flow)
// El fragment (#) NUNCA llega al server — por eso un Server Route handler veía
// "missing code or token_hash". Acá corremos en el browser y leemos location.hash.
// El browser client de @supabase/ssr escribe las cookies que el server lee después.

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function ConfirmPage() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const sb = createClient();
      const qp = new URLSearchParams(window.location.search);
      const hashStr = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : '';
      const hp = new URLSearchParams(hashStr);

      const next = sanitizeNext(qp.get('next') ?? hp.get('next'));
      const errDesc =
        hp.get('error_description') ?? qp.get('error_description') ?? hp.get('error') ?? qp.get('error');
      if (errDesc) { setError(decodeURIComponent(errDesc)); return; }

      try {
        // 1. Fragment implicit — tokens ya verificados por Supabase.
        const access_token = hp.get('access_token');
        const refresh_token = hp.get('refresh_token');
        if (access_token && refresh_token) {
          const { error } = await sb.auth.setSession({ access_token, refresh_token });
          if (error) throw error;
          return done(next);
        }

        // 2. Query token_hash — verificar OTP en el cliente.
        const token_hash = qp.get('token_hash');
        if (token_hash) {
          const type = (qp.get('type') ?? 'email') as
            | 'email' | 'signup' | 'invite' | 'magiclink' | 'recovery' | 'email_change';
          const { error } = await sb.auth.verifyOtp({ type, token_hash });
          if (error) throw error;
          return done(next);
        }

        // 3. Query code (PKCE).
        const code = qp.get('code');
        if (code) {
          const { error } = await sb.auth.exchangeCodeForSession(code);
          if (error) throw error;
          return done(next);
        }

        setError('Link inválido o incompleto. Pide uno nuevo.');
      } catch (e: any) {
        setError(e?.message ?? 'Error al validar el link');
      }
    })();
  }, []);

  function done(next: string) {
    // Hard nav para que el server lea las cookies recién escritas.
    window.location.replace(next);
  }

  return (
    <div className="min-h-screen grid place-items-center bg-bg px-6">
      <div className="text-center max-w-sm">
        {!error ? (
          <>
            <div className="w-10 h-10 mx-auto mb-4 rounded-full border-2 border-brand-500 border-t-transparent animate-spin" />
            <h1 className="font-display font-bold text-lg">Validando tu acceso…</h1>
            <p className="text-muted text-sm mt-1">Un segundo, te estamos ingresando.</p>
          </>
        ) : (
          <>
            <div className="text-danger text-3xl mb-2">⚠</div>
            <h1 className="font-display font-bold text-lg mb-1">No pudimos validar el link</h1>
            <p className="text-muted text-sm mb-4">{error}</p>
            <a href="/login" className="btn-primary inline-block">Pedir un nuevo link</a>
          </>
        )}
      </div>
    </div>
  );
}

function sanitizeNext(next: string | null): string {
  if (!next) return '/admin';
  // Anti open-redirect: solo paths internos.
  return next.startsWith('/') && !next.startsWith('//') ? next : '/admin';
}
