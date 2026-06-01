import { getMatrizSnapshot, listApprovers, listApproverCountries } from '@/lib/data/matriz';
import { listUsers } from '@/lib/data/users';
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

  const [snapshot, approvers, approverCountries, users] = await Promise.all([
    getMatrizSnapshot(),
    listApprovers(),
    listApproverCountries(),
    listUsers(),
  ]);
  const aprobadores = users
    .filter((u) => u.roles.includes('aprobador') && u.email)
    .map((u) => ({ id: u.id, email: u.email, display_name: u.display_name }));
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-display font-bold">Matriz de sociedades</h2>
        <p className="text-muted text-sm mt-1">
          Sociedades, apoderados, documentos y aprobadores por país. Estos datos alimentan el flujo de firma, el portal del proveedor y las aprobaciones internas.
        </p>
      </div>
      <MatrizUI
        sociedades={snapshot.sociedades}
        apoderadosBySociedad={snapshot.apoderadosBySociedad}
        docsBySociedad={snapshot.docsBySociedad}
        approvers={approvers}
        approverCountries={approverCountries}
        aprobadores={aprobadores}
      />
    </div>
  );
}
