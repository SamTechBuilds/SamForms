import * as React from "react";
import * as M from "@radix-ui/react-dropdown-menu";
import { cn } from "@/lib/utils";

export const DropdownMenu = M.Root;
export const DropdownMenuTrigger = M.Trigger;
export function DropdownMenuContent({ className, align = "end", ...p }: React.ComponentPropsWithoutRef<typeof M.Content>) {
  return (
    <M.Portal>
      <M.Content align={align} sideOffset={4} {...p}
        className={cn("z-50 min-w-[11rem] overflow-hidden rounded-md border bg-card p-1 text-card-foreground shadow-md", className)} />
    </M.Portal>
  );
}
export function DropdownMenuItem({ className, destructive, ...p }: React.ComponentPropsWithoutRef<typeof M.Item> & { destructive?: boolean }) {
  return <M.Item {...p} className={cn("flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none data-[disabled]:pointer-events-none data-[highlighted]:bg-accent data-[disabled]:opacity-50",
    destructive && "text-destructive", className)} />;
}
export const DropdownMenuSeparator = ({ className, ...p }: React.ComponentPropsWithoutRef<typeof M.Separator>) => <M.Separator className={cn("my-1 h-px bg-border", className)} {...p} />;
export const DropdownMenuLabel = ({ className, ...p }: React.ComponentPropsWithoutRef<typeof M.Label>) => <M.Label className={cn("px-2 py-1.5 text-xs font-medium text-muted-foreground", className)} {...p} />;
