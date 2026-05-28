import { getMatrizSnapshot } from '@/lib/data/matriz';
import { MatrizUI } from './matriz-ui';
import { getCurrentUser } from '@/lib/auth';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function MatrizPage() {
  const auth = await getCurrentUser();
  if (!auth.ok) redirect('/login?next=/admin/matriz');
  if (!auth.roles.includes('admin')) {
    return (
      <div className="card text-center py-10">
        <h2 className="text-xl font-display font-bold mb-2">Solo admin</h2>
        <p className="text-muted text-sm">Esta vista es solo para administradores. Pídele a alguien que te asigne el rol.</p>
      </div>
    );
  }

  const snapshot = await getMatrizSnapshot();
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-display font-bold">Matriz de sociedades</h2>
        <p className="text-muted text-sm mt-1">
          Sociedades, apoderados y documentos requeridos. Estos datos alimentan el flujo de firma y el portal del proveedor.
        </p>
      </div>
      <MatrizUI sociedades={snapshot.sociedades} apoderadosBySociedad={snapshot.apoderadosBySociedad} docsBySociedad={snapshot.docsBySociedad} />
    </div>
  );
}
