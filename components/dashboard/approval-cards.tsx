interface ApprovalRow {
  team: string;
  avg_hours_to_decide: number | null;
  approved: number;
  rejected: number;
}

export function ApprovalCards({ approvals }: { approvals: ApprovalRow[] }) {
  return (
    <div className="card">
      <h3 className="font-display font-bold text-base mb-3.5">Tiempo de aprobación por equipo</h3>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
        {approvals.length === 0 ? (
          <div className="col-span-full text-center text-muted py-8">
            Aún sin decisiones registradas
          </div>
        ) : (
          approvals.map((a) => (
            <div key={a.team} className="bg-brand-50 border border-border rounded-xl px-4 py-3.5">
              <div className="text-[11px] uppercase tracking-wider text-muted font-semibold mb-1.5">
                {a.team}
              </div>
              <div className="font-display text-[26px] font-bold leading-none text-brand-800">
                {a.avg_hours_to_decide ?? '—'}
                <small className="text-[11px] text-muted font-medium ml-1">h promedio</small>
              </div>
              <div className="flex gap-1.5 mt-2.5">
                <span className="pill pill-green text-[11px]">✓ {a.approved} OK</span>
                <span className="pill pill-red text-[11px]">✗ {a.rejected}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
