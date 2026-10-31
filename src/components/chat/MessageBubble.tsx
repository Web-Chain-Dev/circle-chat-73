import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Pause, Play, Volume2, VolumeX } from "lucide-react";
import { type Message, formatDuration, formatTime, useSignedUrl } from "@/lib/chat";
import { cn } from "@/lib/utils";

export function MessageBubble({ m, mine }: { m: Message; mine: boolean }) {
  if (m.kind === "video") return <VideoNote m={m} mine={mine} />;
  return (
    <div className={cn("flex", mine ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "relative max-w-[min(75%,480px)] rounded-2xl px-3 py-1.5 shadow-bubble",
          mine ? "rounded-br-md bg-bubble-out text-bubble-out-foreground" : "rounded-bl-md bg-bubble-in",
        )}
      >
        {m.kind === "voice" ? <VoiceBody m={m} mine={mine} /> : (
          <span className="whitespace-pre-wrap break-words text-[15px] leading-snug">{m.body}</span>
        )}
        <Meta m={m} mine={mine} inline={m.kind === "text"} />
      </div>
    </div>
  );
}

function Meta({ m, mine, inline }: { m: Message; mine: boolean; inline?: boolean }) {
  return (
    <span className={cn("ml-2 inline-flex items-center gap-0.5 text-[11px] text-bubble-meta", inline ? "float-right mt-1.5 translate-y-1" : "")}>
      {formatTime(m.created_at)}
      {mine && <Check className="h-3.5 w-3.5" />}
    </span>
  );
}

function VoiceBody({ m, mine }: { m: Message; mine: boolean }) {
  const url = useSignedUrl(m.media_path);
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [time, setTime] = useState(0);
  const total = m.duration ?? 0;

  const bars = useMemo(() => {
    let seed = [...m.id].reduce((a, c) => a + c.charCodeAt(0), 0);
    return Array.from({ length: 36 }, () => {
      seed = (seed * 9301 + 49297) % 233280;
      return 0.2 + (seed / 233280) * 0.8;
    });
  }, [m.id]);

  // Recorded webm files have no duration/cues; streaming them over ranged requests often plays silently.
  // Download the whole file once and play it from memory instead.
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => () => { if (blobUrl) URL.revokeObjectURL(blobUrl); }, [blobUrl]);

  const toggle = async () => {
    const a = audio.current;
    if (!a || !url) return;
    if (!a.paused) { a.pause(); return; }
    if (!blobUrl) {
      setLoading(true);
      try {
        const res = await fetch(url);
        const blob = await res.blob();
        const local = URL.createObjectURL(blob);
        a.src = local;
        a.load();
        setBlobUrl(local);
      } catch { /* fall back to streaming */ }
      setLoading(false);
    }
    a.play().catch(() => {});
  };

  return (
    <div className="flex items-center gap-3 py-1 pr-1">
      <button
        onClick={toggle}
        disabled={!url}
        className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-full", mine ? "bg-bubble-out-foreground text-bubble-out" : "bg-primary text-primary-foreground")}
      >
        {playing ? <Pause className="h-5 w-5 fill-current" /> : <Play className="ml-0.5 h-5 w-5 fill-current" />}
      </button>
      <div className="min-w-[160px]">
        <div className="flex h-6 items-center gap-[2px]">
          {bars.map((h, i) => (
            <span
              key={i}
              className={cn("w-[3px] rounded-full", i / bars.length < progress ? (mine ? "bg-bubble-out-foreground" : "bg-primary") : "bg-bubble-meta/50")}
              style={{ height: `${h * 100}%` }}
            />
          ))}
        </div>
        <div className="mt-0.5 flex items-center justify-between text-[11px] text-bubble-meta">
          <span>{formatDuration(playing || time ? time : total)}</span>
          <Meta m={m} mine={mine} />
        </div>
      </div>
      {url && (
        <audio
          ref={audio}
          src={url}
          preload="metadata"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => { setPlaying(false); setProgress(0); setTime(0); }}
          onTimeUpdate={(e) => {
            const a = e.currentTarget;
            const d = isFinite(a.duration) ? a.duration : total;
            setTime(a.currentTime);
            setProgress(d ? a.currentTime / d : 0);
          }}
        />
      )}
    </div>
  );
}

function VideoNote({ m, mine }: { m: Message; mine: boolean }) {
  const url = useSignedUrl(m.media_path);
  const ref = useRef<HTMLVideoElement>(null);
  const [sound, setSound] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const v = ref.current;
    if (v && url) v.play().catch(() => {});
  }, [url]);

  const toggle = () => {
    const v = ref.current;
    if (!v) return;
    if (!sound) {
      v.muted = false; v.loop = false; v.currentTime = 0; v.play(); setSound(true);
    } else {
      v.muted = true; v.loop = true; v.play(); setSound(false);
    }
  };

  const R = 48.5;
  const C = 2 * Math.PI * R;

  return (
    <div className={cn("flex", mine ? "justify-end" : "justify-start")}>
      <div className="relative">
        <button onClick={toggle} className="relative block h-60 w-60 overflow-hidden rounded-full bg-muted shadow-bubble">
          {url && (
            <video
              ref={ref}
              src={url}
              muted
              loop
              playsInline
              className="h-full w-full object-cover"
              onEnded={() => { const v = ref.current; if (v) { v.muted = true; v.loop = true; v.play(); } setSound(false); }}
              onTimeUpdate={(e) => {
                const v = e.currentTarget;
                const d = isFinite(v.duration) ? v.duration : m.duration ?? 0;
                setProgress(d ? v.currentTime / d : 0);
              }}
            />
          )}
          {sound && (
            <svg viewBox="0 0 100 100" className="pointer-events-none absolute inset-0 -rotate-90">
              <circle cx="50" cy="50" r={R} fill="none" stroke="currentColor" strokeWidth="1.5" className="text-primary-foreground/90"
                strokeDasharray={C} strokeDashoffset={C * (1 - progress)} strokeLinecap="round" />
            </svg>
          )}
        </button>
        <span className="absolute bottom-2 left-3 flex items-center gap-1 rounded-full bg-background/60 px-2 py-0.5 text-[11px] text-foreground">
          {formatDuration(m.duration ?? 0)}
          {sound ? <Volume2 className="h-3 w-3" /> : <VolumeX className="h-3 w-3" />}
        </span>
        <span className="absolute bottom-2 right-3 rounded-full bg-background/60 px-2 py-0.5 text-[11px] text-foreground">
          {formatTime(m.created_at)}
        </span>
      </div>
    </div>
  );
}
