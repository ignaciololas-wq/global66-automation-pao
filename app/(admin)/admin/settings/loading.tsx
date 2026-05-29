import { PageHeaderSkeleton, Shimmer } from '@/components/admin/skeletons';

export default function Loading() {
  return (
    <div className="space-y-5">
      <PageHeaderSkeleton />
      <div className="space-y-6">
        <Shimmer className="h-40 w-full rounded-2xl" />
        <Shimmer className="h-72 w-full rounded-2xl" />
      </div>
    </div>
  );
}
