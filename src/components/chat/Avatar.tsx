import { cn } from "@/lib/utils";

export function Avatar({ name, color, size = 54, className }: { name: string; color: string; size?: number; className?: string }) {
  const initials = name.split(/\s+/).map((p) => p[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
  return (
    <div
      className={cn(`av-${color} flex shrink-0 items-center justify-center rounded-full font-medium text-primary-foreground select-none`, className)}
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {initials || "?"}
    </div>
  );
}
