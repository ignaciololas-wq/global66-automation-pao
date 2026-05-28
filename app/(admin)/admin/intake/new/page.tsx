import Link from 'next/link';
import { IntakeForm } from './intake-form';

export default function IntakeNewPage() {
  return (
    <div className="space-y-5 max-w-3xl mx-auto">
      <div>
        <Link href="/admin/workflows" className="text-muted text-sm hover:text-brand-500">
          ← Solicitudes
        </Link>
      </div>
      <div>
        <h2 className="text-2xl font-display font-bold">Nueva solicitud de contrato</h2>
        <p className="text-muted text-sm mt-1">
          Iniciamos el flujo de alta. Si el proveedor es nuevo, le mandamos un email para que complete su perfil.
        </p>
      </div>
      <IntakeForm />
    </div>
  );
}
