export default function Loading() {
  return (
    <main className="min-h-screen grid place-items-center bg-bg px-5 py-10">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 rounded-full bg-brand-900 text-white grid place-items-center font-display font-bold text-xl">
          G
        </div>
        <div
          className="h-8 w-8 rounded-full border-2 border-brand-200 border-t-brand-900 animate-spin"
          role="status"
          aria-label="Cargando"
        />
        <p className="text-muted text-sm">Cargando tu formulario...</p>
      </div>
    </main>
  );
}
