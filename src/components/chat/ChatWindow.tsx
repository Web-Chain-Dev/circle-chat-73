import { useEffect, useLayoutEffect, useRef } from "react";
import { ArrowLeft, MoreVertical, Phone, Search, Video } from "lucide-react";
import { toast } from "sonner";
import { Avatar } from "./Avatar";
import { MessageBubble } from "./MessageBubble";
import { Composer } from "./Composer";
import { type Conversation, type Message } from "@/lib/chat";

type Props = {
  conv: Conversation;
  meId: string;
  messages: Message[];
  onBack: () => void;
  onText: (t: string) => Promise<void>;
  onMedia: (kind: "voice" | "video", blob: Blob, duration: number, mime: string) => Promise<void>;
};

function dayLabel(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return "Today";
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { month: "long", day: "numeric" });
}

export function ChatWindow({ conv, meId, messages, onBack, onText, onMedia }: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const self = conv.peer.id === meId;
  const name = self ? "Saved Messages" : conv.peer.display_name;

  useLayoutEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, conv.id]);

  useEffect(() => {}, []);

  const soon = (what: string) => toast(`${what} are coming soon`);

  let lastDay = "";
  return (
    <section className="flex h-full min-w-0 flex-1 flex-col chat-bg">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b bg-chat-header px-2 md:px-4">
        <button onClick={onBack} className="rounded-full p-2 text-muted-foreground hover:bg-accent md:hidden">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <Avatar name={name} color={conv.peer.avatar_color} size={40} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium leading-tight">{name}</div>
          <div className="truncate text-sm text-muted-foreground">{self ? "your cloud notes" : `@${conv.peer.username}`}</div>
        </div>
        {!self && (
          <>
            <button onClick={() => soon("Voice calls")} title="Voice call" className="rounded-full p-2.5 text-muted-foreground hover:bg-accent hover:text-foreground">
              <Phone className="h-5 w-5" />
            </button>
            <button onClick={() => soon("Video calls")} title="Video call" className="rounded-full p-2.5 text-muted-foreground hover:bg-accent hover:text-foreground">
              <Video className="h-5 w-5" />
            </button>
          </>
        )}
        <button className="hidden rounded-full p-2.5 text-muted-foreground hover:bg-accent sm:block"><Search className="h-5 w-5" /></button>
        <button className="rounded-full p-2.5 text-muted-foreground hover:bg-accent"><MoreVertical className="h-5 w-5" /></button>
      </header>

      <div ref={scroller} className="thin-scroll flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-3xl flex-col gap-1.5 px-3 py-4 md:px-6">
          {messages.length === 0 && (
            <div className="mx-auto mt-24 rounded-2xl bg-background/60 px-6 py-4 text-center text-sm text-muted-foreground">
              No messages here yet. Say hi 👋
            </div>
          )}
          {messages.map((m) => {
            const day = dayLabel(m.created_at);
            const showDay = day !== lastDay;
            lastDay = day;
            return (
              <div key={m.id}>
                {showDay && (
                  <div className="my-2 flex justify-center">
                    <span className="rounded-full bg-background/60 px-3 py-0.5 text-sm font-medium">{day}</span>
                  </div>
                )}
                <MessageBubble m={m} mine={m.sender_id === meId} />
              </div>
            );
          })}
        </div>
      </div>

      <Composer onText={onText} onMedia={onMedia} />
    </section>
  );
}
