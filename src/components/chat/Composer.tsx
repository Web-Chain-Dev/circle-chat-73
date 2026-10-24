import { useEffect, useRef, useState } from "react";
import { Camera, Mic, Send, Smile, Paperclip } from "lucide-react";
import { toast } from "sonner";
import { formatDuration, pickMime } from "@/lib/chat";
import { cn } from "@/lib/utils";

type Props = {
  onText: (text: string) => Promise<void>;
  onMedia: (kind: "voice" | "video", blob: Blob, duration: number, mime: string) => Promise<void>;
};

const MAX_VIDEO = 60;

export function Composer({ onText, onMedia }: Props) {
  const [text, setText] = useState("");
  const [mode, setMode] = useState<"voice" | "video">("voice");
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [cancelHint, setCancelHint] = useState(false);

  const recRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const startedAt = useRef(0);
  const holdTimer = useRef<number | null>(null);
  const pressed = useRef(false);
  const startX = useRef(0);
  const cancelled = useRef(false);
  const previewRef = useRef<HTMLVideoElement>(null);
  const tick = useRef<number | null>(null);

  useEffect(() => () => cleanup(), []);

  function cleanup() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (tick.current) clearInterval(tick.current);
    tick.current = null;
    setRecording(false);
    setElapsed(0);
    setCancelHint(false);
  }

  async function start() {
    const video = mode === "video";
    try {
      const stream = await navigator.mediaDevices.getUserMedia(
        video ? { audio: true, video: { facingMode: "user", width: 480, height: 480 } } : { audio: true },
      );
      if (!pressed.current) { stream.getTracks().forEach((t) => t.stop()); return; }
      streamRef.current = stream;
      const mime = pickMime(video);
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunks.current = [];
      cancelled.current = false;
      rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      rec.onstop = async () => {
        const duration = (Date.now() - startedAt.current) / 1000;
        const type = rec.mimeType || mime || (video ? "video/webm" : "audio/webm");
        const blob = new Blob(chunks.current, { type });
        cleanup();
        if (cancelled.current || duration < 0.6) return;
        try { await onMedia(mode, blob, duration, type); } catch (e) { toast.error((e as Error).message); }
      };
      recRef.current = rec;
      startedAt.current = Date.now();
      rec.start(250);
      setRecording(true);
      tick.current = window.setInterval(() => {
        const s = (Date.now() - startedAt.current) / 1000;
        setElapsed(s);
        if (video && s >= MAX_VIDEO) stop();
      }, 100);
      if (video) requestAnimationFrame(() => {
        if (previewRef.current) previewRef.current.srcObject = stream;
      });
    } catch {
      toast.error(video ? "Camera access is needed for video messages" : "Microphone access is needed for voice messages");
    }
  }

  function stop(cancel = false) {
    cancelled.current = cancel;
    const r = recRef.current;
    if (r && r.state !== "inactive") r.stop();
    else cleanup();
    recRef.current = null;
  }

  function onDown(e: React.PointerEvent) {
    e.currentTarget.setPointerCapture(e.pointerId);
    pressed.current = true;
    startX.current = e.clientX;
    holdTimer.current = window.setTimeout(() => { holdTimer.current = null; start(); }, 220);
  }
  function onMove(e: React.PointerEvent) {
    if (!recording) return;
    setCancelHint(startX.current - e.clientX > 90);
  }
  function onUp(e: React.PointerEvent) {
    pressed.current = false;
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
      setMode((m) => (m === "voice" ? "video" : "voice"));
      return;
    }
    stop(startX.current - e.clientX > 90);
  }

  async function sendText() {
    const t = text.trim();
    if (!t) return;
    setText("");
    try { await onText(t); } catch (e) { toast.error((e as Error).message); setText(t); }
  }

  const hasText = text.trim().length > 0;

  return (
    <>
      {recording && mode === "video" && (
        <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-background/70 backdrop-blur-sm">
          <div className="relative h-72 w-72 md:h-80 md:w-80">
            <video ref={previewRef} autoPlay muted playsInline className="h-full w-full -scale-x-100 rounded-full object-cover" />
            <svg viewBox="0 0 100 100" className="absolute -inset-2 h-[calc(100%+1rem)] w-[calc(100%+1rem)] -rotate-90">
              <circle cx="50" cy="50" r="49" fill="none" stroke="currentColor" strokeWidth="1" className="text-primary"
                strokeDasharray={2 * Math.PI * 49} strokeDashoffset={2 * Math.PI * 49 * (1 - elapsed / MAX_VIDEO)} strokeLinecap="round" />
            </svg>
          </div>
        </div>
      )}
      <div className="mx-auto flex w-full max-w-3xl items-end gap-2 px-3 pb-4 md:px-6">
        <div className="flex min-h-[54px] flex-1 items-center gap-1 rounded-2xl bg-card px-2 shadow-bubble">
          {recording ? (
            <div className="flex flex-1 items-center gap-3 px-3">
              <span className="rec-pulse h-2.5 w-2.5 rounded-full bg-destructive" />
              <span className="tabular-nums">{formatDuration(elapsed)}</span>
              <span className={cn("ml-auto text-sm transition-colors", cancelHint ? "text-destructive" : "text-muted-foreground")}>
                {cancelHint ? "Release to cancel" : "‹ Slide left to cancel"}
              </span>
            </div>
          ) : (
            <>
              <button className="rounded-full p-2 text-muted-foreground hover:text-foreground" type="button">
                <Smile className="h-6 w-6" />
              </button>
              <textarea
                rows={1}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendText(); }
                }}
                placeholder="Message"
                className="max-h-40 flex-1 resize-none bg-transparent py-3.5 text-[15px] outline-none placeholder:text-muted-foreground"
              />
              <button className="rounded-full p-2 text-muted-foreground hover:text-foreground" type="button">
                <Paperclip className="h-6 w-6" />
              </button>
            </>
          )}
        </div>
        {hasText ? (
          <button
            onClick={sendText}
            className="flex h-[54px] w-[54px] shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-bubble transition-transform hover:scale-105"
          >
            <Send className="h-6 w-6" />
          </button>
        ) : (
          <button
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={() => { pressed.current = false; stop(true); }}
            onContextMenu={(e) => e.preventDefault()}
            title={mode === "voice" ? "Hold to record voice, tap to switch to video" : "Hold to record video, tap to switch to voice"}
            className={cn(
              "flex h-[54px] w-[54px] shrink-0 touch-none select-none items-center justify-center rounded-full shadow-bubble transition-all",
              recording ? "scale-125 bg-primary text-primary-foreground" : "bg-card text-primary hover:bg-primary hover:text-primary-foreground",
            )}
          >
            {mode === "voice" ? <Mic className="h-6 w-6" /> : <Camera className="h-6 w-6" />}
          </button>
        )}
      </div>
    </>
  );
}
