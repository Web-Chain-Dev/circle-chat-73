import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Sidebar } from "@/components/chat/Sidebar";
import { ChatWindow } from "@/components/chat/ChatWindow";
import { type Conversation, type Message, type Profile } from "@/lib/chat";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/chat")({
  head: () => ({
    meta: [
      { title: "Chats — Courier" },
      { name: "description", content: "Your conversations on Courier." },
      { property: "og:title", content: "Chats — Courier" },
      { property: "og:description", content: "Your conversations on Courier." },
    ],
  }),
  component: ChatPage,
});

type Row = {
  id: string;
  last_message_at: string;
  conversation_members: { user_id: string; profiles: Profile | null }[];
};

function ChatPage() {
  const { user } = Route.useRouteContext();
  const meId = user.id;
  const [me, setMe] = useState<Profile | null>(null);
  const [convs, setConvs] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const activeRef = useRef<string | null>(null);
  activeRef.current = activeId;

  const loadConvs = useCallback(async () => {
    const { data } = await supabase
      .from("conversations")
      .select("id, last_message_at, conversation_members(user_id, profiles(id, display_name, username, avatar_color))")
      .order("last_message_at", { ascending: false });
    const rows = (data ?? []) as unknown as Row[];
    const ids = rows.map((r) => r.id);
    const lasts = new Map<string, Message>();
    if (ids.length) {
      const { data: msgs } = await supabase
        .from("messages").select("*").in("conversation_id", ids)
        .order("created_at", { ascending: false }).limit(300);
      (msgs as Message[] | null)?.forEach((m) => { if (!lasts.has(m.conversation_id)) lasts.set(m.conversation_id, m); });
    }
    setConvs(rows.map((r) => {
      const other = r.conversation_members.find((x) => x.user_id !== meId) ?? r.conversation_members[0];
      return {
        id: r.id,
        last_message_at: r.last_message_at,
        peer: other?.profiles ?? { id: other?.user_id ?? "", display_name: "Unknown", username: null, avatar_color: "blue" },
        last: lasts.get(r.id),
      };
    }));
  }, [meId]);

  useEffect(() => {
    supabase.from("profiles").select("id, display_name, username, avatar_color").eq("id", meId).single()
      .then(({ data }) => setMe(data as Profile));
    loadConvs();
  }, [meId, loadConvs]);

  useEffect(() => {
    if (!activeId) { setMessages([]); return; }
    supabase.from("messages").select("*").eq("conversation_id", activeId)
      .order("created_at", { ascending: true }).limit(500)
      .then(({ data }) => { if (activeRef.current === activeId) setMessages((data ?? []) as Message[]); });
  }, [activeId]);

  useEffect(() => {
    const channel = supabase
      .channel(`messages-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
        const m = payload.new as Message;
        if (m.conversation_id === activeRef.current) {
          setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
        }
        loadConvs();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loadConvs]);

  const addLocal = (m: Message) => {
    setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
    loadConvs();
  };

  async function startChat(userId: string) {
    const { data, error } = await supabase.rpc("get_or_create_dm", { _other: userId });
    if (error) return toast.error(error.message);
    await loadConvs();
    setActiveId(data as string);
  }

  async function sendText(body: string) {
    if (!activeId) return;
    const { data, error } = await supabase.from("messages")
      .insert({ conversation_id: activeId, sender_id: meId, kind: "text", body }).select().single();
    if (error) throw error;
    addLocal(data as Message);
  }

  async function sendMedia(kind: "voice" | "video", blob: Blob, duration: number, mime: string) {
    if (!activeId) return;
    const ext = mime.includes("mp4") ? (kind === "voice" ? "m4a" : "mp4") : mime.includes("ogg") ? "ogg" : "webm";
    const path = `${activeId}/${crypto.randomUUID()}.${ext}`;
    const up = await supabase.storage.from("media").upload(path, blob, { contentType: mime.split(";")[0] ?? mime });
    if (up.error) throw up.error;
    const { data, error } = await supabase.from("messages")
      .insert({ conversation_id: activeId, sender_id: meId, kind, media_path: path, duration: Math.round(duration * 10) / 10 })
      .select().single();
    if (error) throw error;
    addLocal(data as Message);
  }

  const active = convs.find((c) => c.id === activeId) ?? null;

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <div className={cn("h-full w-full md:block md:w-auto", active ? "hidden" : "block")}>
        <Sidebar me={me} meId={meId} conversations={convs} activeId={activeId} onSelect={setActiveId} onStartChat={startChat} />
      </div>
      {active ? (
        <ChatWindow conv={active} meId={meId} messages={messages} onBack={() => setActiveId(null)} onText={sendText} onMedia={sendMedia} />
      ) : (
        <div className="hidden flex-1 items-center justify-center chat-bg md:flex">
          <div className="flex items-center gap-2 rounded-full bg-background/60 px-4 py-1.5 text-sm">
            <MessageCircle className="h-4 w-4" /> Select a chat to start messaging
          </div>
        </div>
      )}
    </div>
  );
}
