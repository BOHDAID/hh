import { Skeleton } from "@/components/ui/skeleton";

const ProductCardSkeleton = () => (
  <div className="glass rounded-2xl overflow-hidden">
    {/* Image */}
    <Skeleton className="w-full aspect-[4/3]" />
    {/* Content */}
    <div className="p-4 space-y-3">
      {/* Category badge */}
      <Skeleton className="h-5 w-20 rounded-full" />
      {/* Title */}
      <Skeleton className="h-5 w-3/4" />
      {/* Description */}
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-2/3" />
      {/* Price & Button */}
      <div className="flex items-center justify-between pt-2">
        <Skeleton className="h-7 w-24" />
        <Skeleton className="h-9 w-28 rounded-lg" />
      </div>
    </div>
  </div>
);

export const ProductGridSkeleton = ({ count = 6 }: { count?: number }) => (
  <div className="grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
    {Array.from({ length: count }).map((_, i) => (
      <ProductCardSkeleton key={i} />
    ))}
  </div>
);

export default ProductCardSkeleton;
