// Server Component: lee logo de app_settings y renderiza con fallback.
import { getLogoUrl } from '@/lib/data/settings';

export async function BrandLogo() {
  const url = await getLogoUrl().catch(() => null);
  return (
    <div className="flex items-center gap-2.5 px-3 pt-2 pb-7">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="Global66" className="w-8 h-8 rounded-lg object-cover" />
      ) : (
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-400 to-mint grid place-items-center font-display font-extrabold text-lg text-white">
          G
        </div>
      )}
      <div className="font-display font-extrabold text-[15px] leading-tight">
        global66
        <small className="block text-brand-200 font-medium text-[11px]">contratos</small>
      </div>
    </div>
  );
}
