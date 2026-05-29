import { requireAdmin } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { getAppSettings, getBanner } from '@/lib/data/settings';
import { SettingsUI } from './settings-ui';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const auth = await requireAdmin();
  if (!auth.ok) redirect('/admin');

  const settings = await getAppSettings();
  const banner = await getBanner();
  const logoUrl = settings.logo_url?.url ?? null;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-display font-bold">Configuración</h2>
        <p className="text-muted text-sm mt-1">Branding y settings de plataforma · solo admins</p>
      </div>
      <SettingsUI logoUrl={logoUrl} banner={banner} />
    </div>
  );
}
