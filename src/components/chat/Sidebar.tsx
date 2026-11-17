import { enablePush } from "@/lib/push-client";
import { toast } from "sonner";
import { Bell } from "lucide-react";
import { useEffect, useState } from "react";
import { Menu, Search, LogOut, ArrowLeft, Users, UserPen } from "lucide-react";
import { NewGroupDialog } from "./NewGroupDialog";
import { ProfileDialog } from "./ProfileDialog";
import { supabase } from "@/integrations/supabase/client";
import { Avatar } from "./Avatar";
import { type Conversation, type Profile, PROFILE_COLS, formatListTime, previewText } from "@/lib/chat";
import { cn } from "@/lib/utils";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Props = {
  me: Profile | null;
  meId: string;
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onStartChat: (userId: string) => void;
  onCreateGroup: (title: string, members: string[]) => Promise<boolean>;
  onProfileSaved: () => Promise<void>;
};

export function Sidebar({ me, meId, conversations, activeId, onSelect, onStartChat, onCreateGroup, onProfileSaved }: Props) {
  const [groupOpen, setGroupOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Profile[]>([]);
  const searching = q.trim().length > 0;

  useEffect(() => {
    if (!searching) { setResults([]); return; }
    const t = setTimeout(async () => {
      const term = q.trim().replace(/[%,]/g, "");
      const { data } = await supabase
        .rpc("search_profiles", { _term: term });
      setResults((data ?? []) as Profile[]);
    }, 250);
    return () => clearTimeout(t);
  }, [q, searching]);

  return (
    <aside className="flex h-full w-full flex-col bg-sidebar md:w-[380px] md:border-r">
      <div className="flex items-center gap-2 px-3 py-2">
        {searching ? (
          <button onClick={() => setQ("")} className="rounded-full p-2.5 text-muted-foreground hover:bg-accent">
            <ArrowLeft className="h-5 w-5" />
          </button>
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger className="rounded-full p-2.5 text-muted-foreground hover:bg-accent">
              <Menu className="h-5 w-5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuLabel className="flex items-center gap-3">
                {me && <Avatar name={me.display_name} color={me.avatar_color} path={me.avatar_path} size={36} />}
                <div className="min-w-0">
                  <div className="truncate">{me?.display_name}</div>
                  <div className="truncate text-xs font-normal text-muted-foreground">@{me?.username}</div>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setGroupOpen(true)}>
                <Users className="mr-2 h-4 w-4" /> New group
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setProfileOpen(true)}>
                <UserPen className="mr-2 h-4 w-4" /> Edit profile
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={async () => {
                try {
                  const r = await enablePush(meId);
                  const msg = {
                    enabled: "Notifications are on for this device",
                    denied: "Notifications are blocked — allow them for this site in your browser settings",
                    "open-in-new-tab": "Open the app in its own tab to turn on notifications",
                    "ios-install": "On iPhone: tap Share → Add to Home Screen, open the app from there, then try again",
                    unsupported: "This browser can't show notifications",
                  }[r];
                  (r === "enabled" ? toast.success : toast.error)(msg);
                } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't turn on notifications"); }
              }}>
                <Bell className="mr-2 h-4 w-4" /> Enable notifications
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => supabase.auth.signOut()}>
                <LogOut className="mr-2 h-4 w-4" /> Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search people"
            className="h-11 w-full rounded-full border-2 border-transparent bg-input pl-11 pr-4 text-sm outline-none placeholder:text-muted-foreground focus:border-primary"
          />
        </div>
      </div>

      <div className="thin-scroll flex-1 overflow-y-auto px-2 pb-2">
        {searching ? (
          <>
            <div className="px-3 py-2 text-sm font-medium text-muted-foreground">Global search</div>
            {results.length === 0 && <div className="px-3 py-6 text-center text-sm text-muted-foreground">No users found</div>}
            {results.map((p) => (
              <button
                key={p.id}
                onClick={() => { onStartChat(p.id); setQ(""); }}
                className="flex w-full items-center gap-3 rounded-xl p-2 text-left hover:bg-accent"
              >
                <Avatar name={p.display_name} color={p.avatar_color} path={p.avatar_path} size={48} />
                <div className="min-w-0">
                  <div className="truncate font-medium">{p.id === meId ? "Saved Messages" : p.display_name}</div>
                  <div className="truncate text-sm text-muted-foreground">@{p.username}</div>
                </div>
              </button>
            ))}
          </>
        ) : conversations.length === 0 ? (
          <div className="px-6 py-16 text-center text-sm text-muted-foreground">
            No chats yet. Search for people above to start a conversation.
          </div>
        ) : (
          conversations.map((c) => {
            const active = c.id === activeId;
            const self = !c.is_group && c.peer.id === meId;
            return (
              <button
                key={c.id}
                onClick={() => onSelect(c.id)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl p-2 text-left transition-colors",
                  active ? "bg-sidebar-accent text-primary-foreground" : "hover:bg-accent",
                )}
              >
                <Avatar name={self ? "Saved Messages" : c.peer.display_name} color={c.peer.avatar_color} path={self ? null : c.peer.avatar_path} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate font-medium">{self ? "Saved Messages" : c.peer.display_name}</span>
                    <span className={cn("shrink-0 text-xs", active ? "text-primary-foreground/80" : "text-muted-foreground")}>
                      {c.last && formatListTime(c.last.created_at)}
                    </span>
                  </div>
                  <div className={cn("truncate text-sm", active ? "text-primary-foreground/80" : "text-muted-foreground")}>
                    {c.last && c.last.sender_id === meId && !self && (
                      <span className={active ? "" : "text-foreground"}>You: </span>
                    )}
                    {c.last && c.is_group && c.last.sender_id !== meId && (
                      <span className={active ? "" : "text-foreground"}>{c.members.find((p) => p.id === c.last?.sender_id)?.display_name ?? "Someone"}: </span>
                    )}
                    {previewText(c.last)}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
      <NewGroupDialog open={groupOpen} onOpenChange={setGroupOpen} meId={meId} onCreate={onCreateGroup} />
      <ProfileDialog open={profileOpen} onOpenChange={setProfileOpen} me={me} onSaved={onProfileSaved} />
    </aside>
  );
}
