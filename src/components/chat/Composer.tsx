import { useEffect, useRef, useState } from "react";
import { Camera, Lock, Mic, Send, Smile, Paperclip, Trash2, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { formatDuration, pickMime } from "@/lib/chat";
import { cn } from "@/lib/utils";

type Props = {
  onText: (text: string) => Promise<void>;
  onMedia: (kind: "voice" | "video", blob: Blob, duration: number, mime: string) => Promise<void>;
};

const MAX_VIDEO = 60;
const CANCEL_DX = 90;
const LOCK_DY = 70;

export function Composer({ onText, onMedia }: Props) {
  const [text, setText] = useState("");
  const [mode, setMode] = useState<"voice" | "video">("voice");
  const [recording, setRecording] = useState(false);
  const [locked, setLocked] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [cancelHint, setCancelHint] = useState(false);
  const [lockProgress, setLockProgress] = useState(0);
  const [preview, setPreview] = useState<MediaStream | null>(null);

  const recRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const startedAt = useRef(0);
  const holdTimer = useRef<number | null>(null);
  const pressed = useRef(false);
  const lockedRef = useRef(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const cancelled = useRef(false);
  const previewRef = useRef<HTMLVideoElement>(null);
  const tick = useRef<number | null>(null);

  useEffect(() => () => cleanup(), []);

  // Attach the camera stream whenever the preview element exists (fixes preview sometimes staying blank).
  useEffect(() => {
    const v = previewRef.current;
    if (!v || !preview) return;
    if (v.srcObject !== preview) v.srcObject = preview;
    v.play().catch(() => {});
  }, [preview, recording]);

  function cleanup() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (tick.current) clearInterval(tick.current);
    tick.current = null;
    lockedRef.current = false;
    setPreview(null);
    setRecording(false);
    setLocked(false);
    setElapsed(0);
    setCancelHint(false);
    setLockProgress(0);
  }

  async function start() {
    const kind = mode;
    const video = kind === "video";
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
      rec.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
      rec.onstop = async () => {
        const duration = (Date.now() - startedAt.current) / 1000;
        const type = rec.mimeType || mime || (video ? "video/webm" : "audio/webm");
        const blob = new Blob(chunks.current, { type });
        cleanup();
        if (cancelled.current || duration < 0.6) return;
        try { await onMedia(kind, blob, duration, type); } catch (e) { toast.error((e as Error).message); }
      };
      recRef.current = rec;
      startedAt.current = Date.now();
      rec.start(250);
      if (video) setPreview(stream);
      setRecording(true);
      tick.current = window.setInterval(() => {
        const s = (Date.now() - startedAt.current) / 1000;
        setElapsed(s);
        if (video && s >= MAX_VIDEO) stop();
      }, 100);
    } catch {
      toast.error(video ? "Camera access is needed for video messages" : "Microphone access is needed for voice messages");
    }
  }

  function stop(cancel = false) {
    cancelled.current = cancel;
    const r = recRef.current;
    recRef.current = null;
    if (r && r.state !== "inactive") r.stop();
    else cleanup();
  }

  function onDown(e: React.PointerEvent) {
    if (lockedRef.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pressed.current = true;
    startX.current = e.clientX;
    startY.current = e.clientY;
    holdTimer.current = window.setTimeout(() => { holdTimer.current = null; start(); }, 220);
  }
  function onMove(e: React.PointerEvent) {
    if (!recording || lockedRef.current || !pressed.current) return;
    const dx = startX.current - e.clientX;
    const dy = startY.current - e.clientY;
    if (dy > LOCK_DY) {
      lockedRef.current = true;
      setLocked(true);
      setCancelHint(false);
      setLockProgress(0);
      return;
    }
    setLockProgress(Math.max(0, Math.min(1, dy / LOCK_DY)));
    setCancelHint(dx > CANCEL_DX);
  }
  function onUp(e: React.PointerEvent) {
    if (!pressed.current) return;
    pressed.current = false;
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
      setMode((m) => (m === "voice" ? "video" : "voice"));
      return;
    }
    if (lockedRef.current) return; // keep recording; send via the send button
    stop(startX.current - e.clientX > CANCEL_DX);
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
            <video ref={previewRef} autoPlay muted playsInline className="h-full w-full -scale-x-100 rounded-full bg-muted object-cover" />
            <svg viewBox="0 0 100 100" className="absolute -inset-2 h-[calc(100%+1rem)] w-[calc(100%+1rem)] -rotate-90">
              <circle cx="50" cy="50" r="49" fill="none" stroke="currentColor" strokeWidth="1" className="text-primary"
                strokeDasharray={2 * Math.PI * 49} strokeDashoffset={2 * Math.PI * 49 * (1 - elapsed / MAX_VIDEO)} strokeLinecap="round" />
            </svg>
          </div>
        </div>
      )}
      <div className="relative z-50 mx-auto flex w-full max-w-3xl items-end gap-2 px-3 pb-4 md:px-6">
        <div className="flex min-h-[54px] flex-1 items-center gap-1 rounded-2xl bg-card px-2 shadow-bubble">
          {recording ? (
            <div className="flex flex-1 items-center gap-3 px-3">
              {locked && (
                <button type="button" onClick={() => stop(true)} className="rounded-full p-1.5 text-destructive hover:bg-destructive/10" title="Discard">
                  <Trash2 className="h-5 w-5" />
                </button>
              )}
              <span className="rec-pulse h-2.5 w-2.5 rounded-full bg-destructive" />
              <span className="tabular-nums">{formatDuration(elapsed)}</span>
              {!locked && (
                <span className={cn("ml-auto text-sm transition-colors", cancelHint ? "text-destructive" : "text-muted-foreground")}>
                  {cancelHint ? "Release to cancel" : "‹ Slide left to cancel"}
                </span>
              )}
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
        {hasText && !recording ? (
          <button
            onClick={sendText}
            className="flex h-[54px] w-[54px] shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-bubble transition-transform hover:scale-105"
          >
            <Send className="h-6 w-6" />
          </button>
        ) : locked ? (
          <button
            type="button"
            onClick={() => stop(false)}
            title="Send"
            className="flex h-[54px] w-[54px] shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-bubble transition-transform hover:scale-105"
          >
            <Send className="h-6 w-6" />
          </button>
        ) : (
          <div className="relative shrink-0">
            {recording && (
              <div
                className="pointer-events-none absolute bottom-full left-1/2 mb-6 flex -translate-x-1/2 flex-col items-center gap-1 rounded-full bg-card px-2 py-3 text-muted-foreground shadow-bubble"
                style={{ transform: `translate(-50%, ${-lockProgress * 24}px)` }}
              >
                <Lock className={cn("h-5 w-5", lockProgress > 0.6 && "text-primary")} />
                <ChevronUp className="h-4 w-4 animate-bounce" />
              </div>
            )}
            <button
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={() => { pressed.current = false; if (!lockedRef.current) stop(true); }}
              onContextMenu={(e) => e.preventDefault()}
              title={mode === "voice" ? "Hold to record voice, tap to switch to video" : "Hold to record video, tap to switch to voice"}
              className={cn(
                "flex h-[54px] w-[54px] touch-none select-none items-center justify-center rounded-full shadow-bubble transition-all",
                recording ? "scale-125 bg-primary text-primary-foreground" : "bg-card text-primary hover:bg-primary hover:text-primary-foreground",
              )}
            >
              {mode === "voice" ? <Mic className="h-6 w-6" /> : <Camera className="h-6 w-6" />}
            </button>
          </div>
        )}
      </div>
    </>
  );
}
