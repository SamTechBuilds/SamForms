import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface CheckboxProps {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  id?: string;
  disabled?: boolean;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  className?: string;
}

export function Checkbox({ checked, onCheckedChange, className, ...rest }: CheckboxProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={() => onCheckedChange(!checked)}
      {...rest}
      className={cn(
        "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
        checked ? "border-primary bg-primary text-primary-foreground" : "border-input bg-background",
        className,
      )}
    >
      {checked && <Check className="h-3 w-3" strokeWidth={3} aria-hidden="true" />}
    </button>
  );
}
