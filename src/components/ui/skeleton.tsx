import { cn } from "@/lib/utils";
export const Skeleton = ({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) => (
  <div aria-hidden="true" className={cn("animate-pulse rounded-md bg-muted", className)} {...p} />
);
