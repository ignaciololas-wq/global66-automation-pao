'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';

export default function LoginForm() {
  const sp = useSearchParams();
  const initialError = sp?.get('auth_error');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(
    initialError ? { kind: 'err', text: initialError } : null,
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch('/api/auth/magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        setMsg({ kind: 'err', text: data.error ?? 'Error envío magic link' });
      } else {
        setMsg({
          kind: 'ok',
          text: 'Revisa tu email — te enviamos un link de acceso. Expira en 1 hora.',
        });
      }
    } catch (err: any) {
      setMsg({ kind: 'err', text: err.message ?? 'Error de red' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <div>
        <label className="label">Email corporativo</label>
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="tu.nombre@global66.com"
          className="input"
        />
      </div>
      <button type="submit" disabled={busy} className="btn-primary mt-1">
        {busy ? 'Enviando…' : 'Recibir magic link →'}
      </button>
      {msg && (
        <div
          className={`text-sm px-3 py-2 rounded-lg ${
            msg.kind === 'ok'
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              : 'bg-red-50 text-red-700 border border-red-200'
          }`}
        >
          {msg.text}
        </div>
      )}
      <p className="text-xs text-muted text-center mt-2">
        Solo emails @global66.com autorizados pueden ingresar.
      </p>
    </form>
  );
}
