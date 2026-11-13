import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const alertVariants = cva("relative w-full rounded-lg border p-4 text-sm", {
  variants: { variant: { default: "bg-background", destructive: "border-destructive/40 text-destructive bg-destructive/5" } },
  defaultVariants: { variant: "default" },
});
export const Alert = ({ className, variant, ...p }: React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>) => (
  <div role="alert" className={cn(alertVariants({ variant }), className)} {...p} />
);
