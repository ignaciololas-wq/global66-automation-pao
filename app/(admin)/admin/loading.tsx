import { CardGridSkeleton, Shimmer } from '@/components/admin/skeletons';

export default function Loading() {
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Shimmer className="h-8 w-52" />
        <Shimmer className="h-3.5 w-72" />
      </div>
      <CardGridSkeleton count={4} />
      <Shimmer className="h-40 w-full rounded-2xl" />
      <Shimmer className="h-32 w-full rounded-2xl" />
      <Shimmer className="h-56 w-full rounded-2xl" />
    </div>
  );
}
