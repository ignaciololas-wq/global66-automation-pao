import Link from 'next/link';

export default function Home() {
  return (
    <main className="min-h-screen grid place-items-center bg-gradient-to-br from-brand-50 to-white px-5 py-10">
      <div className="text-center max-w-md">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-400 to-mint text-white font-extrabold text-3xl shadow-lift mb-6">
          G
        </div>
        <h1 className="font-display text-3xl font-bold text-ink mb-2">
          Plataforma Contratos
        </h1>
        <p className="text-muted mb-8">
          Sistema interno de gestión de contratos con proveedores de Global66
        </p>
        <Link href="/admin" className="btn-primary">
          Entrar a la plataforma →
        </Link>
      </div>
    </main>
  );
}
