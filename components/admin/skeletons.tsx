// Skeletons para loading.tsx — se muestran al instante en navegación mientras
// el Server Component hace su SSR + queries. Matchean el layout real para que
// no haya salto cuando llega el contenido.

export function Shimmer({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-border/60 ${className}`} />;
}

export function PageHeaderSkeleton({ action = false }: { action?: boolean }) {
  return (
    <div className="flex justify-between items-center">
      <div className="space-y-2">
        <Shimmer className="h-7 w-48" />
        <Shimmer className="h-3.5 w-32" />
      </div>
      {action && <Shimmer className="h-9 w-36 rounded-pill" />}
    </div>
  );
}

export function TableSkeleton({ cols, rows = 8 }: { cols: number; rows?: number }) {
  return (
    <div className="card overflow-hidden p-0">
      <div className="bg-brand-50 flex gap-4 px-3.5 py-3 border-b border-border">
        {Array.from({ length: cols }).map((_, i) => (
          <Shimmer key={i} className="h-3 flex-1" />
        ))}
      </div>
      <div>
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex gap-4 px-3.5 py-3.5 border-t border-border">
            {Array.from({ length: cols }).map((_, c) => (
              <Shimmer key={c} className={`h-3.5 flex-1 ${c === 0 ? 'max-w-[180px]' : ''}`} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function ListPageSkeleton({ cols, action = false }: { cols: number; action?: boolean }) {
  return (
    <div className="space-y-5">
      <PageHeaderSkeleton action={action} />
      <TableSkeleton cols={cols} />
    </div>
  );
}

export function CardGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card space-y-2">
          <Shimmer className="h-3 w-20" />
          <Shimmer className="h-7 w-28" />
        </div>
      ))}
    </div>
  );
}

export function DetailPageSkeleton() {
  return (
    <div className="space-y-5">
      <Shimmer className="h-4 w-40" />
      <div className="flex justify-between items-center">
        <div className="space-y-2">
          <Shimmer className="h-7 w-64" />
          <Shimmer className="h-3.5 w-48" />
        </div>
        <Shimmer className="h-6 w-24 rounded-pill" />
      </div>
      <Shimmer className="h-44 w-full rounded-2xl" />
      <CardGridSkeleton count={4} />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(360px,1fr))] gap-4">
        <Shimmer className="h-48 rounded-2xl" />
        <Shimmer className="h-48 rounded-2xl" />
      </div>
    </div>
  );
}
