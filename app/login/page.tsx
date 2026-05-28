import { Suspense } from 'react';
import LoginForm from './login-form';

export const dynamic = 'force-dynamic';

export default function LoginPage() {
  return (
    <main className="min-h-screen grid place-items-center bg-gradient-to-br from-brand-50 to-white px-5 py-10">
      <div className="w-full max-w-md card shadow-lift">
        <div className="flex items-center justify-center gap-2.5 mb-5">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-brand-400 to-mint grid place-items-center font-display font-extrabold text-white text-xl">
            G
          </div>
          <div className="font-display font-extrabold text-lg leading-tight">
            global66<small className="block text-muted font-medium text-xs">contratos</small>
          </div>
        </div>
        <h1 className="text-center font-display text-2xl mb-2">Iniciar sesión</h1>
        <p className="text-center text-muted text-sm mb-6">
          Plataforma interna de gestión de contratos con proveedores
        </p>
        <Suspense fallback={<div className="text-center text-muted text-sm">Cargando…</div>}>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
