import { listUsers } from '@/lib/data/users';
import { requireAdmin } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { formatDateTime } from '@/lib/format';
import { UsersTable } from './users-ui';

export const dynamic = 'force-dynamic';

export default async function UsersPage() {
  const auth = await requireAdmin();
  if (!auth.ok) redirect('/admin');

  const users = await listUsers().catch(() => []);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-display font-bold">Gestión de usuarios</h2>
        <p className="text-muted text-sm mt-1">{users.length} usuarios registrados · solo admins pueden modificar</p>
      </div>
      <UsersTable users={users} />
    </div>
  );
}
