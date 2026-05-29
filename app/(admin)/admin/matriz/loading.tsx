import { PageHeaderSkeleton, TableSkeleton } from '@/components/admin/skeletons';

export default function Loading() {
  return (
    <div className="space-y-5">
      <PageHeaderSkeleton />
      <div className="flex gap-1 border-b border-border pb-1">
        <div className="h-8 w-28 animate-pulse rounded bg-border/60" />
        <div className="h-8 w-28 animate-pulse rounded bg-border/60" />
        <div className="h-8 w-28 animate-pulse rounded bg-border/60" />
      </div>
      <TableSkeleton cols={5} rows={6} />
    </div>
  );
}
