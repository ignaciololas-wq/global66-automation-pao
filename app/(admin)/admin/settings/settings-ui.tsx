'use client';
import { useState, useRef, useTransition } from 'react';
import { saveBannerAction, removeLogoAction, uploadLogoAction } from './actions';
import type { BannerSettings } from '@/lib/data/settings';

export function SettingsUI({ logoUrl: initialLogo, banner: initialBanner }: { logoUrl: string | null; banner: BannerSettings | null }) {
  const [logoUrl, setLogoUrl] = useState(initialLogo);
  const [banner, setBanner] = useState<BannerSettings>(initialBanner ?? { enabled: false, text: '', link: '', bg_color: '#1F49B6' });
  const [pending, startTransition] = useTransition();
  const [logoStatus, setLogoStatus] = useState('');
  const [bannerStatus, setBannerStatus] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  function onPickLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const fd = new FormData();
    fd.set('file', f);
    setLogoStatus('Subiendo…');
    startTransition(async () => {
      try {
        const r = await uploadLogoAction(fd);
        setLogoUrl(r.url);
        setLogoStatus('✓ Logo actualizado');
        setTimeout(() => setLogoStatus(''), 2500);
      } catch (err: any) {
        setLogoStatus('Error: ' + err.message);
      }
    });
  }

  function removeLogo() {
    if (!confirm('¿Quitar el logo actual?')) return;
    startTransition(async () => {
      try {
        await removeLogoAction();
        setLogoUrl(null);
        setLogoStatus('Logo removido');
        setTimeout(() => setLogoStatus(''), 2500);
      } catch (err: any) {
        setLogoStatus('Error: ' + err.message);
      }
    });
  }

  function saveBanner() {
    const fd = new FormData();
    fd.set('enabled', String(banner.enabled));
    fd.set('text', banner.text);
    fd.set('link', banner.link);
    fd.set('bg_color', banner.bg_color);
    setBannerStatus('Guardando…');
    startTransition(async () => {
      try {
        await saveBannerAction(fd);
        setBannerStatus('✓ Banner guardado');
        setTimeout(() => setBannerStatus(''), 2500);
      } catch (err: any) {
        setBannerStatus('Error: ' + err.message);
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="card">
        <h3 className="font-display font-bold text-lg mb-1">Logo de la plataforma</h3>
        <p className="text-muted text-sm mb-4">Aparece arriba a la izquierda del sidebar. PNG/JPG/WebP/SVG, máx 2MB. Idealmente cuadrado (32×32 o más).</p>
        <div className="flex items-center gap-6">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-brand-400 to-emerald-400 flex items-center justify-center overflow-hidden flex-shrink-0">
            {logoUrl ? (
              <img src={logoUrl} className="w-full h-full object-cover" alt="Logo actual" />
            ) : (
              <span className="text-white font-display font-extrabold text-4xl">G</span>
            )}
          </div>
          <div className="flex-1">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              hidden
              onChange={onPickLogo}
              disabled={pending}
            />
            <button type="button" onClick={() => fileInputRef.current?.click()} className="btn-primary text-sm" disabled={pending}>
              {logoUrl ? 'Cambiar logo' : 'Subir logo'}
            </button>
            {logoUrl && (
              <button type="button" onClick={removeLogo} className="ml-2 text-sm text-red-600 hover:text-red-700" disabled={pending}>Quitar</button>
            )}
            {logoStatus && <div className="text-xs mt-2 text-muted">{logoStatus}</div>}
          </div>
        </div>
      </div>

      <div className="card">
        <h3 className="font-display font-bold text-lg mb-1">Banner superior</h3>
        <p className="text-muted text-sm mb-4">Mensaje destacado arriba de la app. Botón X de cierre por usuario (dismiss persistente).</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
          <label className="block">
            <span className="text-xs font-semibold text-ink mb-1 block">Texto</span>
            <input type="text" value={banner.text} onChange={(e) => setBanner({ ...banner, text: e.target.value })} maxLength={200} placeholder="Ej: 🚀 Nueva versión disponible" className="w-full px-3 py-2 border border-border rounded-lg text-sm" />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-ink mb-1 block">Link (opcional)</span>
            <input type="text" value={banner.link} onChange={(e) => setBanner({ ...banner, link: e.target.value })} placeholder="https://..." className="w-full px-3 py-2 border border-border rounded-lg text-sm" />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-ink mb-1 block">Color de fondo</span>
            <input type="color" value={banner.bg_color} onChange={(e) => setBanner({ ...banner, bg_color: e.target.value })} className="w-full h-11 border border-border rounded-lg cursor-pointer" />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-ink mb-1 block">Estado</span>
            <select value={String(banner.enabled)} onChange={(e) => setBanner({ ...banner, enabled: e.target.value === 'true' })} className="w-full px-3 py-2 border border-border rounded-lg text-sm">
              <option value="false">Inactivo</option>
              <option value="true">Activo</option>
            </select>
          </label>
        </div>
        <div className="flex items-center gap-3">
          <button type="button" onClick={saveBanner} disabled={pending} className="btn-primary text-sm">Guardar banner</button>
          {bannerStatus && <div className="text-xs text-muted">{bannerStatus}</div>}
        </div>

        <div className="mt-5">
          <div className="text-xs text-muted uppercase tracking-wider font-semibold mb-2">Preview</div>
          <div className="px-5 py-3 rounded-lg text-white flex justify-between items-center text-sm font-medium" style={{ background: banner.bg_color }}>
            <span>{banner.text || '— sin texto —'}</span>
            <span className="opacity-70">✕</span>
          </div>
        </div>
      </div>
    </div>
  );
}
