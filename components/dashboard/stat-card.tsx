export function StatCard({
  label,
  value,
  small,
  delta,
}: {
  label: string;
  value: string | number;
  small?: string;
  delta?: string;
}) {
  return (
    <div className="card hover:shadow-card transition-shadow">
      <div className="text-[12px] uppercase tracking-wider text-muted font-semibold mb-2">{label}</div>
      <div className="font-display text-[32px] font-bold leading-none text-brand-800" style={{ letterSpacing: '-0.025em' }}>
        {value}
        {small && <small className="text-[14px] text-muted font-medium ml-1.5">{small}</small>}
      </div>
      {delta && <div className="text-emerald-600 text-xs mt-2 font-medium">{delta}</div>}
    </div>
  );
}
