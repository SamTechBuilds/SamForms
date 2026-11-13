import { cn } from "@/lib/utils";

export interface SwitchProps { checked: boolean; onCheckedChange: (v: boolean) => void; id?: string; disabled?: boolean; "aria-label"?: string; "aria-labelledby"?: string; className?: string }
export function Switch({ checked, onCheckedChange, className, ...rest }: SwitchProps) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onCheckedChange(!checked)} {...rest}
      className={cn("relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
        checked ? "bg-primary" : "bg-input", className)}>
      <span className={cn("block h-5 w-5 rounded-full bg-background shadow transition-transform", checked ? "translate-x-5" : "translate-x-0")} />
    </button>
  );
}
