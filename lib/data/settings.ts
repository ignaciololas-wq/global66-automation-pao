import 'server-only';
import { createAdminClient } from '@/lib/supabase/server';

// app_settings key-value store (logo_url, brand colors, feature flags).
// Lectura pública (RLS allow SELECT a todos).

export async function getAppSettings(): Promise<Record<string, any>> {
  const sb = createAdminClient();
  const { data, error } = await sb.from('app_settings').select('key, value');
  if (error) return {};
  const out: Record<string, any> = {};
  for (const row of (data ?? []) as { key: string; value: any }[]) {
    out[row.key] = row.value;
  }
  return out;
}

export async function getLogoUrl(): Promise<string | null> {
  const settings = await getAppSettings();
  return settings.logo_url?.url ?? null;
}
