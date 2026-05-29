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

export interface BannerSettings {
  enabled: boolean;
  text: string;
  link: string;
  bg_color: string;
}

export async function getBanner(): Promise<BannerSettings | null> {
  const settings = await getAppSettings();
  const b = settings.banner;
  if (!b) return null;
  return {
    enabled: !!b.enabled,
    text: String(b.text ?? ''),
    link: String(b.link ?? ''),
    bg_color: String(b.bg_color ?? '#1F49B6'),
  };
}

export async function saveSetting(key: string, value: any, updatedBy?: string) {
  const sb = createAdminClient();
  const { error } = await sb.from('app_settings').upsert(
    { key, value, updated_at: new Date().toISOString(), updated_by: updatedBy ?? null },
    { onConflict: 'key' },
  );
  if (error) throw new Error(error.message);
}

export async function uploadLogo(buffer: Buffer, mimeType: string): Promise<string> {
  const sb = createAdminClient();
  const ext = mimeType.split('/')[1].replace('jpeg', 'jpg').replace('svg+xml', 'svg');
  const path = `brand/logo-${Date.now()}.${ext}`;
  const { error } = await sb.storage.from('avatars').upload(path, buffer, {
    contentType: mimeType,
    upsert: true,
  });
  if (error) throw new Error('storage.upload: ' + error.message);
  const { data: pub } = sb.storage.from('avatars').getPublicUrl(path);
  return pub.publicUrl;
}
