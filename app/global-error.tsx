'use client';

import { useEffect } from 'react';

// Global error boundary — reemplaza el root layout cuando hay un crash a nivel
// raíz (incluido el propio layout). Por eso debe renderizar <html> y <body>.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[global-error]', error);
  }, [error]);

  return (
    <html lang="es">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#f5f7fe',
          color: '#132046',
          fontFamily: 'Inter, system-ui, sans-serif',
          padding: '24px',
        }}
      >
        <div
          style={{
            maxWidth: '440px',
            width: '100%',
            background: '#ffffff',
            border: '1px solid #E9EDF8',
            borderRadius: '12px',
            padding: '32px',
            boxShadow: '0 1px 3px rgba(19,32,70,0.04), 0 8px 24px rgba(19,32,70,0.06)',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              fontFamily: 'Montserrat, sans-serif',
              fontWeight: 800,
              fontSize: '18px',
              color: '#1F49B6',
              marginBottom: '12px',
            }}
          >
            Global66 Contratos
          </div>
          <h1
            style={{
              fontFamily: 'Montserrat, sans-serif',
              fontWeight: 700,
              fontSize: '22px',
              margin: '0 0 8px',
            }}
          >
            Ocurrió un error inesperado
          </h1>
          <p style={{ color: '#565656', fontSize: '14px', lineHeight: 1.6, margin: '0 0 24px' }}>
            La aplicación encontró un problema y no pudo continuar. Vuelve a intentarlo.
          </p>
          {error?.digest && (
            <p style={{ color: '#565656', fontSize: '12px', margin: '0 0 24px' }}>
              Código de referencia: <code>{error.digest}</code>
            </p>
          )}
          <button
            type="button"
            onClick={() => reset()}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '10px 20px',
              borderRadius: '999px',
              border: 'none',
              background: '#1F49B6',
              color: '#ffffff',
              fontWeight: 600,
              fontSize: '14px',
              cursor: 'pointer',
            }}
          >
            Reintentar
          </button>
        </div>
      </body>
    </html>
  );
}
