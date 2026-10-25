import { useEffect, useState } from "react";
import { Menu, Search, LogOut, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Avatar } from "./Avatar";
import { type Conversation, type Profile, formatListTime, previewText } from "@/lib/chat";
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
};

export function Sidebar({ me, meId, conversations, activeId, onSelect, onStartChat }: Props) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Profile[]>([]);
  const searching = q.trim().length > 0;

  useEffect(() => {
    if (!searching) { setResults([]); return; }
    const t = setTimeout(async () => {
      const term = q.trim().replace(/[%,]/g, "");
      const { data } = await supabase
        .from("profiles")
        .select("id, display_name, username, avatar_color")
        .or(`display_name.ilike.%${term}%,username.ilike.%${term}%`)
        .limit(20);
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
                {me && <Avatar name={me.display_name} color={me.avatar_color} size={36} />}
                <div className="min-w-0">
                  <div className="truncate">{me?.display_name}</div>
                  <div className="truncate text-xs font-normal text-muted-foreground">@{me?.username}</div>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
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
                <Avatar name={p.display_name} color={p.avatar_color} size={48} />
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
            const self = c.peer.id === meId;
            return (
              <button
                key={c.id}
                onClick={() => onSelect(c.id)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl p-2 text-left transition-colors",
                  active ? "bg-sidebar-accent text-primary-foreground" : "hover:bg-accent",
                )}
              >
                <Avatar name={self ? "Saved Messages" : c.peer.display_name} color={c.peer.avatar_color} />
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
                    {previewText(c.last)}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </aside>
  );
}
