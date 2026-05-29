'use server';
import { revalidatePath } from 'next/cache';
import { saveSetting, uploadLogo } from '@/lib/data/settings';
import { requireAdmin } from '@/lib/auth';

async function ensureAdmin() {
  const auth = await requireAdmin();
  if (!auth.ok) throw new Error('forbidden — admin only');
  return auth;
}

export async function saveBannerAction(formData: FormData) {
  const auth = await ensureAdmin();
  const value = {
    enabled: formData.get('enabled') === 'true',
    text: String(formData.get('text') ?? '').trim(),
    link: String(formData.get('link') ?? '').trim(),
    bg_color: String(formData.get('bg_color') ?? '#1F49B6'),
  };
  await saveSetting('banner', value, auth.email ?? undefined);
  revalidatePath('/admin/settings');
  revalidatePath('/', 'layout');
}

export async function removeLogoAction() {
  const auth = await ensureAdmin();
  await saveSetting('logo_url', {}, auth.email ?? undefined);
  revalidatePath('/admin/settings');
  revalidatePath('/', 'layout');
}

export async function uploadLogoAction(formData: FormData) {
  const auth = await ensureAdmin();
  const file = formData.get('file') as File | null;
  if (!file || file.size === 0) throw new Error('file requerido');
  if (file.size > 2 * 1024 * 1024) throw new Error('max 2MB');
  const allowed = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];
  if (!allowed.includes(file.type)) throw new Error('solo png/jpg/webp/svg');
  const arrayBuf = await file.arrayBuffer();
  const url = await uploadLogo(Buffer.from(arrayBuf), file.type);
  await saveSetting('logo_url', { url }, auth.email ?? undefined);
  revalidatePath('/admin/settings');
  revalidatePath('/', 'layout');
  return { url };
}
