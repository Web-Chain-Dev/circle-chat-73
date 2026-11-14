import { cn } from "@/lib/utils";
import { useSignedUrl } from "@/lib/chat";

export function Avatar({ name, color, size = 54, className, path }: { name: string; color: string; size?: number; className?: string; path?: string | null | undefined }) {
  const url = useSignedUrl(path ?? null, "avatars");
  const initials = name.split(/\s+/).map((p) => p[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
  if (url) {
    return <img src={url} alt={name} className={cn("shrink-0 rounded-full object-cover", className)} style={{ width: size, height: size }} />;
  }
  return (
    <div
      className={cn(`av-${color} flex shrink-0 items-center justify-center rounded-full font-medium text-primary-foreground select-none`, className)}
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {initials || "?"}
    </div>
  );
}
