'use client';

import { useEffect } from 'react';
import Link from 'next/link';

// Error boundary del detalle de contrato.
export default function ContractDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[contract-detail-error]', error);
  }, [error]);

  return (
    <div className="max-w-lg mx-auto mt-16">
      <div className="card text-center space-y-4">
        <h1 className="text-xl text-ink">No se pudo cargar el contrato</h1>
        <p className="text-muted text-sm">
          Hubo un problema al obtener los datos del contrato. Vuelve a intentarlo.
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
          <Link href="/admin/contracts" className="btn-secondary">
            Volver a contratos
          </Link>
        </div>
      </div>
    </div>
  );
}
