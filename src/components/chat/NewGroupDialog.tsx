import { useEffect, useState } from "react";
import { Check, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar } from "./Avatar";
import { type Profile, PROFILE_COLS } from "@/lib/chat";
import { cn } from "@/lib/utils";

type Props = { open: boolean; onOpenChange: (o: boolean) => void; meId: string; onCreate: (title: string, members: string[]) => Promise<boolean> };

export function NewGroupDialog({ open, onOpenChange, meId, onCreate }: Props) {
  const [title, setTitle] = useState("");
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Profile[]>([]);
  const [picked, setPicked] = useState<Map<string, Profile>>(new Map());
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (!open) { setTitle(""); setQ(""); setPicked(new Map()); } }, [open]);
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(async () => {
      const term = q.trim().replace(/[%,]/g, "");
      let req = supabase.from("profiles").select(PROFILE_COLS).neq("id", meId).limit(30);
      if (term) req = req.or(`display_name.ilike.%${term}%,username.ilike.%${term}%`);
      const { data } = await req;
      setResults((data ?? []) as Profile[]);
    }, 200);
    return () => clearTimeout(t);
  }, [q, open, meId]);

  const toggle = (p: Profile) => setPicked((prev) => {
    const n = new Map(prev);
    if (n.has(p.id)) n.delete(p.id); else n.set(p.id, p);
    return n;
  });

  async function create() {
    setBusy(true);
    const ok = await onCreate(title.trim(), [...picked.keys()]);
    setBusy(false);
    if (ok) onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>New group</DialogTitle></DialogHeader>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Group name" maxLength={80} />
        {picked.size > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {[...picked.values()].map((p) => (
              <button key={p.id} onClick={() => toggle(p)} className="rounded-full bg-primary/20 px-3 py-1 text-sm">{p.display_name} ×</button>
            ))}
          </div>
        )}
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Add people" className="pl-9" />
        </div>
        <div className="thin-scroll max-h-72 overflow-y-auto">
          {results.map((p) => {
            const on = picked.has(p.id);
            return (
              <button key={p.id} onClick={() => toggle(p)} className="flex w-full items-center gap-3 rounded-xl p-2 text-left hover:bg-accent">
                <Avatar name={p.display_name} color={p.avatar_color} path={p.avatar_path} size={40} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{p.display_name}</div>
                  <div className="truncate text-sm text-muted-foreground">@{p.username}</div>
                </div>
                <span className={cn("flex h-6 w-6 items-center justify-center rounded-full border-2", on ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground")}>
                  {on && <Check className="h-4 w-4" />}
                </span>
              </button>
            );
          })}
          {results.length === 0 && <div className="py-6 text-center text-sm text-muted-foreground">No users found</div>}
        </div>
        <DialogFooter>
          <Button onClick={create} disabled={busy || !title.trim() || picked.size === 0}>Create group</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
