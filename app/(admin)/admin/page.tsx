export default function AdminDashboard() {
  return (
    <div>
      <h2 className="text-2xl font-bold mb-2">Buen día 👋</h2>
      <p className="text-muted mb-6">
        Plataforma migrada a Next.js. Dashboard real se implementa en PR-NEXT5.
      </p>
      <div className="card">
        <h3 className="mb-2">Bootstrap Next.js completo</h3>
        <ul className="text-sm space-y-1 text-muted list-disc list-inside">
          <li>App Router</li>
          <li>TypeScript</li>
          <li>Tailwind con paleta brand</li>
          <li>Supabase SSR (PR-NEXT2)</li>
          <li>Migración endpoints + UI (PR-NEXT3 a 10)</li>
        </ul>
      </div>
    </div>
  );
}
