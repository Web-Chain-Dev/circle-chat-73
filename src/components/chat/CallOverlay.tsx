import { useEffect, useRef, useState } from "react";
import { Camera, Mic, MicOff, Phone, PhoneOff, RefreshCw, VideoOff, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar } from "./Avatar";
import { formatDuration } from "@/lib/chat";
import type { useCall } from "@/hooks/use-call";

type Controls = ReturnType<typeof useCall>;
function Stream({ stream, muted = false, video = false, className }: { stream: MediaStream | null; muted?: boolean; video?: boolean; className?: string }) {
  const ref = useRef<HTMLVideoElement & HTMLAudioElement>(null);
  const [blocked, setBlocked] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.srcObject = stream;
    if (stream) void el.play().then(() => setBlocked(false)).catch(() => setBlocked(true));
    return () => { el.srcObject = null; };
  }, [stream]);
  return <>
    {video ? <video ref={ref} autoPlay playsInline muted={muted} className={className} /> : <audio ref={ref} autoPlay muted={muted} />}
    {blocked && !muted && <Button variant="secondary" onClick={() => { void ref.current?.play().then(() => setBlocked(false)); }} className="absolute left-4 top-4"><Volume2 /> Enable call sound</Button>}
  </>;
}

export function CallOverlay({ controls }: { controls: Controls }) {
  const { call, accept, end, mute, camera, switchCamera } = controls;
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  if (!call) return null;
  const incoming = call.phase === "incoming";
  const status = incoming ? `Incoming ${call.kind} call` : call.phase === "preparing" ? "Starting call…" : call.phase === "ringing" ? "Ringing…" : call.phase === "connecting" ? "Connecting…" : formatDuration((now - (call.startedAt ?? now)) / 1000);
  const video = call.kind === "video";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 p-3 backdrop-blur-md">
      <section role="dialog" aria-modal="true" aria-label={incoming ? "Incoming call" : "Active call"} className="relative flex h-[min(680px,90dvh)] w-full max-w-3xl flex-col overflow-hidden rounded-lg border bg-card shadow-bubble">
        <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-background">
          <Stream stream={call.remote} video={video} className="absolute inset-0 h-full w-full object-contain" />
          {(!video || !call.remote) && <div className="flex flex-col items-center gap-5"><Avatar name={call.peer.display_name} color={call.peer.avatar_color} size={112} /><h2 className="max-w-full break-words px-6 text-center text-2xl font-medium">{call.peer.display_name}</h2></div>}
          {video && call.local && <div className="absolute bottom-4 right-4 h-36 w-24 overflow-hidden rounded-lg border bg-card sm:h-44 sm:w-32"><Stream stream={call.local} muted video className="h-full w-full -scale-x-100 object-cover" />{call.cameraOff && <div className="absolute inset-0 flex items-center justify-center bg-card"><VideoOff className="text-muted-foreground" /></div>}</div>}
        </div>
        <footer className="shrink-0 space-y-5 border-t px-4 py-6 text-center">
          <div aria-live="polite"><p className="truncate font-medium">{call.peer.display_name}</p><p className="text-sm tabular-nums text-muted-foreground">{status}</p></div>
          <div className="flex flex-wrap items-center justify-center gap-3">
            {incoming ? <>
              <Button variant="destructive" className="h-12 px-5" onClick={() => void end("reject")}><PhoneOff /> Decline</Button>
              <Button className="h-12 px-5" onClick={() => void accept()}><Phone /> Answer</Button>
            </> : <>
              <Button variant={call.muted ? "default" : "secondary"} size="icon" className="h-12 w-12 rounded-full" disabled={!call.local} aria-label={call.muted ? "Unmute microphone" : "Mute microphone"} title={call.muted ? "Unmute microphone" : "Mute microphone"} aria-pressed={call.muted} onClick={mute}>{call.muted ? <MicOff /> : <Mic />}</Button>
              {video && <>
                <Button variant={call.cameraOff ? "default" : "secondary"} size="icon" className="h-12 w-12 rounded-full" disabled={!call.local} aria-label={call.cameraOff ? "Turn camera on" : "Turn camera off"} title={call.cameraOff ? "Turn camera on" : "Turn camera off"} aria-pressed={call.cameraOff} onClick={camera}>{call.cameraOff ? <VideoOff /> : <Camera />}</Button>
                <Button variant="secondary" size="icon" className="h-12 w-12 rounded-full" disabled={!call.local} aria-label="Switch camera" title="Switch camera" onClick={() => void switchCamera()}><RefreshCw /></Button>
              </>}
              <Button variant="destructive" size="icon" className="h-12 w-12 rounded-full" aria-label="End call" title="End call" onClick={() => void end()}><PhoneOff /></Button>
            </>}
          </div>
        </footer>
      </section>
    </div>
  );
}