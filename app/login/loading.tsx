export default function Loading() {
  return (
    <main className="min-h-screen grid place-items-center bg-gradient-to-br from-brand-50 to-white px-5 py-10">
      <div className="flex flex-col items-center gap-4">
        <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-brand-400 to-mint grid place-items-center font-display font-extrabold text-white text-xl">
          G
        </div>
        <div
          className="h-8 w-8 rounded-full border-2 border-brand-200 border-t-brand-500 animate-spin"
          role="status"
          aria-label="Cargando"
        />
        <p className="text-muted text-sm">Cargando…</p>
      </div>
    </main>
  );
}
