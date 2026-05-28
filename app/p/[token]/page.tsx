import { notFound } from 'next/navigation';
import { findProviderByToken, listSociedadDocumentsForProvider, listProviderUploads, findRunsForProvider } from '@/lib/data/providers';
import { ProviderForm } from './provider-form';

export const dynamic = 'force-dynamic';

export default async function ProviderPublicPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const provider = await findProviderByToken(token);
  if (!provider) notFound();

  const runs = await findRunsForProvider(provider.id);
  const sociedad = runs[0]?.sociedad_contratante ?? provider.sociedad_contratante ?? null;
  const [requiredDocs, uploads] = await Promise.all([
    listSociedadDocumentsForProvider(sociedad),
    listProviderUploads(provider.id),
  ]);

  return (
    <div className="min-h-screen bg-bg">
      <header className="bg-brand-900 text-white">
        <div className="max-w-3xl mx-auto px-6 py-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white text-brand-900 grid place-items-center font-display font-bold">G</div>
            <div>
              <div className="font-display font-bold text-lg">Global66</div>
              <div className="text-xs text-white/70">Portal de proveedores</div>
            </div>
          </div>
          <div className="text-right text-xs text-white/70">
            <div>{provider.razon_social}</div>
            <div>{provider.tax_id}</div>
          </div>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-6 py-8 space-y-5">
        <div>
          <h1 className="text-2xl font-display font-bold">Hola {provider.razon_social} 👋</h1>
          <p className="text-muted text-sm mt-1.5">
            Necesitamos algunos datos para avanzar con tu contrato. {sociedad ? <>Vas a contratar con <strong>{sociedad}</strong>.</> : null}
            {' '}Tomarás unos 5 minutos.
          </p>
        </div>
        <ProviderForm token={token} provider={provider} requiredDocs={requiredDocs} uploads={uploads} />
        <footer className="text-center text-xs text-muted pt-4">
          ¿Dudas? Escribinos a <a href="mailto:proveedores@global66.com" className="text-brand-500">proveedores@global66.com</a>
        </footer>
      </main>
    </div>
  );
}
