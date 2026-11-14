import { useEffect, useRef, useState } from "react";
import { Camera } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar } from "./Avatar";
import { type Profile } from "@/lib/chat";
import { normalizeUsername, usernameError } from "@/lib/profile-rules";

type Props = { open: boolean; onOpenChange: (o: boolean) => void; me: Profile | null; onSaved: () => Promise<void> };

export function ProfileDialog({ open, onOpenChange, me, onSaved }: Props) {
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  useEffect(() => { if (open && me) { setName(me.display_name); setUsername(me.username ?? ""); } }, [open, me]);
  if (!me) return null;

  async function uploadAvatar(f: File | undefined) {
    if (!f || !me) return;
    if (!f.type.startsWith("image/")) { toast.error("Please choose an image"); return; }
    if (f.size > 5 * 1024 * 1024) { toast.error("Image must be under 5 MB"); return; }
    setBusy(true);
    const path = `${me.id}/${crypto.randomUUID()}`;
    const up = await supabase.storage.from("avatars").upload(path, f, { contentType: f.type });
    if (up.error) { toast.error(up.error.message); setBusy(false); return; }
    const { error } = await supabase.from("profiles").update({ avatar_path: path }).eq("id", me.id);
    if (error) toast.error(error.message); else { await onSaved(); toast.success("Profile picture updated"); }
    setBusy(false);
  }

  async function save() {
    if (!me) return;
    const u = normalizeUsername(username);
    const err = usernameError(u);
    if (err) { toast.error(err); return; }
    if (!name.trim()) { toast.error("Name can't be empty"); return; }
    setBusy(true);
    const { error } = await supabase.from("profiles").update({ display_name: name.trim().slice(0, 64), username: u }).eq("id", me.id);
    setBusy(false);
    if (error) { toast.error(error.code === "23505" ? "That username is taken" : error.message); return; }
    await onSaved();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Edit profile</DialogTitle></DialogHeader>
        <div className="flex justify-center">
          <button type="button" onClick={() => file.current?.click()} disabled={busy} className="group relative rounded-full" aria-label="Change profile picture">
            <Avatar name={me.display_name} color={me.avatar_color} path={me.avatar_path} size={96} />
            <span className="absolute inset-0 flex items-center justify-center rounded-full bg-background/50 opacity-0 transition-opacity group-hover:opacity-100">
              <Camera className="h-7 w-7" />
            </span>
          </button>
          <input ref={file} type="file" accept="image/*" hidden onChange={(e) => { void uploadAvatar(e.target.files?.[0]); e.target.value = ""; }} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pname">Name</Label>
          <Input id="pname" value={name} onChange={(e) => setName(e.target.value)} maxLength={64} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="puser">Username</Label>
          <Input id="puser" value={username} onChange={(e) => setUsername(e.target.value)} maxLength={32} />
          <p className="text-xs text-muted-foreground">5–32 characters: letters, numbers and underscores.</p>
        </div>
        <DialogFooter><Button onClick={save} disabled={busy}>Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
