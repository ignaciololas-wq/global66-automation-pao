import Link from 'next/link';

// Página 404 raíz — Server Component (sin props ni 'use client').
export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-brand-50 p-6">
      <div className="card max-w-md w-full text-center space-y-4">
        <div className="font-display font-extrabold text-brand-500 text-lg">
          Global66 Contratos
        </div>
        <div className="font-display font-bold text-brand-200 text-6xl leading-none">404</div>
        <h1 className="text-xl text-ink">Página no encontrada</h1>
        <p className="text-muted text-sm">
          La página que buscas no existe o fue movida.
        </p>
        <div className="pt-2">
          <Link href="/admin" className="btn-primary">
            Ir al inicio
          </Link>
        </div>
      </div>
    </div>
  );
}
