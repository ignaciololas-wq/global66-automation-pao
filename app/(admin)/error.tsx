'use client';

import { useEffect } from 'react';
import Link from 'next/link';

// Error boundary del área admin — captura crashes dentro del layout admin
// (sidebar visible). Mantiene el chrome y muestra una card branded.
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[admin-error]', error);
  }, [error]);

  return (
    <div className="max-w-lg mx-auto mt-16">
      <div className="card text-center space-y-4">
        <h1 className="text-xl text-ink">Algo salió mal en esta sección</h1>
        <p className="text-muted text-sm">
          No pudimos completar la operación. Puedes reintentar o volver al inicio.
        </p>
        {error?.message && (
          <p className="text-danger text-sm font-mono break-words bg-brand-50 rounded-lg px-3 py-2">
            {error.message}
          </p>
        )}
        {error?.digest && (
          <p className="text-muted text-xs">Código de referencia: {error.digest}</p>
        )}
        <div className="flex items-center justify-center gap-3 pt-2">
          <button type="button" onClick={() => reset()} className="btn-primary">
            Reintentar
          </button>
          <Link href="/admin" className="btn-secondary">
            Ir al inicio
          </Link>
        </div>
      </div>
    </div>
  );
}
