import { PageHeaderSkeleton, Shimmer } from '@/components/admin/skeletons';

export default function Loading() {
  return (
    <div className="space-y-5 max-w-3xl mx-auto">
      <Shimmer className="h-4 w-28" />
      <PageHeaderSkeleton />
      <Shimmer className="h-96 w-full rounded-2xl" />
    </div>
  );
}
