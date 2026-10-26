import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { canCall, isFreshOffer, type CallKind, type CallPhase } from "@/lib/call-rules";
import type { Conversation, Profile } from "@/lib/chat";
import type { Json, Tables } from "@/integrations/supabase/types";

type Signal = Tables<"call_signals">;
export type CallState = {
  id: string; conversationId: string; peer: Profile; kind: CallKind; phase: CallPhase;
  local: MediaStream | null; remote: MediaStream | null; startedAt: number | null;
  muted: boolean; cameraOff: boolean;
};
const iceServers: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun.cloudflare.com:3478" },
];

export function useCall(meId: string) {
  const [call, setCall] = useState<CallState | null>(null);
  const [ready, setReady] = useState(false);
  const current = useRef<CallState | null>(null);
  const pc = useRef<RTCPeerConnection | null>(null);
  const offer = useRef<RTCSessionDescriptionInit | null>(null);
  const candidates = useRef(new Map<string, RTCIceCandidateInit[]>());
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const accepting = useRef(false);
  const mounted = useRef(true);
  const update = (next: CallState | null) => { current.current = next; if (mounted.current) setCall(next); };
  const patch = (changes: Partial<CallState>) => { if (current.current) update({ ...current.current, ...changes }); };

  async function send(c: CallState, kind: Signal["kind"], payload: unknown = {}) {
    const { error } = await supabase.from("call_signals").insert({
      call_id: c.id, conversation_id: c.conversationId, sender_id: meId,
      recipient_id: c.peer.id, kind, payload: payload as Json,
    });
    if (error) throw error;
  }
  function cleanup() {
    if (timeout.current) clearTimeout(timeout.current);
    timeout.current = null;
    pc.current?.close(); pc.current = null;
    current.current?.local?.getTracks().forEach(t => t.stop());
    current.current?.remote?.getTracks().forEach(t => t.stop());
    candidates.current.clear(); offer.current = null; accepting.current = false;
    update(null);
  }
  async function end(kind: "end" | "reject" = "end") {
    const c = current.current;
    cleanup();
    if (c) await send(c, kind).catch(() => toast.error("Could not notify the other person"));
  }
  function armTimeout(id: string, milliseconds: number, message: string) {
    if (timeout.current) clearTimeout(timeout.current);
    timeout.current = setTimeout(() => {
      if (current.current?.id === id) { toast(message); void end(); }
    }, milliseconds);
  }
  async function media(c: CallState) {
    if (!navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection === "undefined") {
      throw new Error("Calls need a browser with camera and microphone support over HTTPS");
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: c.kind === "video" ? { facingMode: "user" } : false });
    if (current.current?.id !== c.id || !mounted.current) { stream.getTracks().forEach(t => t.stop()); return null; }
    patch({ local: stream });
    const connection = new RTCPeerConnection({ iceServers });
    pc.current = connection;
    stream.getTracks().forEach(t => connection.addTrack(t, stream));
    const remote = new MediaStream();
    connection.ontrack = event => {
      if (current.current?.id !== c.id) return;
      if (!remote.getTracks().some(t => t.id === event.track.id)) remote.addTrack(event.track);
      patch({ remote });
    };
    connection.onicecandidate = event => {
      if (event.candidate && current.current?.id === c.id) {
        void send(c, "ice", event.candidate.toJSON()).catch(() => {});
      }
    };
    connection.onconnectionstatechange = () => {
      if (current.current?.id !== c.id) return;
      if (connection.connectionState === "connected") {
        if (timeout.current) clearTimeout(timeout.current);
        patch({ phase: "connected", startedAt: current.current.startedAt ?? Date.now() });
      } else if (connection.connectionState === "failed") {
        toast.error("Call could not connect on this network. Try another Wi-Fi or mobile connection."); void end();
      } else if (connection.connectionState === "disconnected") {
        patch({ phase: "connecting" }); armTimeout(c.id, 15000, "Call connection was lost");
      }
    };
    return connection;
  }
  async function flush(id: string, connection: RTCPeerConnection) {
    const queued = candidates.current.get(id) ?? [];
    candidates.current.delete(id);
    for (const candidate of queued) await connection.addIceCandidate(candidate);
  }
  async function start(conv: Conversation, kind: CallKind) {
    if (!ready) { toast.error("Calls are reconnecting. Try again in a moment."); return; }
    if (!canCall(meId, conv.peer.id, Boolean(current.current))) return;
    const c: CallState = { id: crypto.randomUUID(), conversationId: conv.id, peer: conv.peer, kind, phase: "preparing", local: null, remote: null, startedAt: null, muted: false, cameraOff: false };
    update(c); armTimeout(c.id, 60000, "Call cancelled");
    try {
      const connection = await media(c);
      if (!connection) return;
      await connection.setLocalDescription(await connection.createOffer());
      if (current.current?.id !== c.id) return;
      await send(c, "offer", { kind, description: connection.localDescription?.toJSON() });
      patch({ phase: "ringing" }); armTimeout(c.id, 45000, "No answer");
    } catch (error) {
      if (current.current?.id !== c.id) return;
      toast.error(error instanceof DOMException ? "Camera or microphone permission was denied or the device is unavailable" : "Could not start the call");
      void end();
    }
  }
  async function accept() {
    const c = current.current; const description = offer.current;
    if (!c || c.phase !== "incoming" || !description || accepting.current) return;
    accepting.current = true; patch({ phase: "connecting" });
    armTimeout(c.id, 35000, "Call could not connect");
    try {
      const connection = await media(c);
      if (!connection) return;
      await connection.setRemoteDescription(description);
      await flush(c.id, connection);
      await connection.setLocalDescription(await connection.createAnswer());
      if (current.current?.id === c.id) await send(c, "answer", connection.localDescription?.toJSON());
    } catch {
      if (current.current?.id === c.id) { toast.error("Could not answer. Check camera and microphone permissions."); void end("reject"); }
    } finally { accepting.current = false; }
  }
  async function receive(s: Signal) {
    if (s.recipient_id !== meId) return;
    if (s.kind === "offer") {
      if (!isFreshOffer(s.created_at) || current.current?.id === s.call_id) return;
      const payload = s.payload as { kind?: string; description?: RTCSessionDescriptionInit };
      if (!payload.description || payload.description.type !== "offer" || !["voice", "video"].includes(payload.kind ?? "")) return;
      const { data: profile } = await supabase.from("profiles").select("id, display_name, username, avatar_color").eq("id", s.sender_id).single();
      if (!profile || !mounted.current) return;
      const incoming: CallState = { id: s.call_id, conversationId: s.conversation_id, peer: profile, kind: payload.kind as CallKind, phase: "incoming", local: null, remote: null, startedAt: null, muted: false, cameraOff: false };
      if (current.current) { await send(incoming, "busy"); return; }
      offer.current = payload.description; update(incoming);
      armTimeout(incoming.id, Math.max(1000, 45000 - (Date.now() - Date.parse(s.created_at))), "Missed call");
      return;
    }
    if (s.kind === "ice") {
      if (current.current && current.current.id !== s.call_id) return;
      const candidate = s.payload as RTCIceCandidateInit;
      if (typeof candidate.candidate !== "string") return;
      if (current.current?.id === s.call_id && pc.current?.remoteDescription) await pc.current.addIceCandidate(candidate);
      else {
        if (candidates.current.size > 20) candidates.current.clear();
        const queue = candidates.current.get(s.call_id) ?? [];
        if (queue.length < 100) candidates.current.set(s.call_id, [...queue, candidate]);
      }
      return;
    }
    if (current.current?.id !== s.call_id || current.current.peer.id !== s.sender_id) return;
    if (s.kind === "answer" && pc.current && pc.current.signalingState === "have-local-offer") {
      await pc.current.setRemoteDescription(s.payload as unknown as RTCSessionDescriptionInit);
      await flush(s.call_id, pc.current);
      patch({ phase: "connecting" }); armTimeout(s.call_id, 35000, "Call could not connect");
    } else if (["end", "reject", "busy"].includes(s.kind)) {
      toast(s.kind === "busy" ? "They’re on another call" : s.kind === "reject" ? "Call declined" : "Call ended"); cleanup();
    }
  }
  useEffect(() => {
    mounted.current = true;
    const seen = new Set<string>(); let alive = true; let polling = false;
    let chain = Promise.resolve();
    const enqueue = (s: Signal) => {
      if (!alive || seen.has(s.id)) return;
      seen.add(s.id);
      chain = chain.then(async () => {
        if (!alive) return;
        try { await receive(s); } catch { if (current.current?.id === s.call_id) { toast.error("Call connection failed"); void end(); } }
        await supabase.from("call_signals").delete().eq("id", s.id);
      }).catch(() => {});
    };
    const poll = async () => {
      if (polling || !alive) return;
      polling = true;
      const { data, error } = await supabase.from("call_signals").select("*").eq("recipient_id", meId).order("created_at").limit(200);
      if (alive) { setReady(!error); data?.forEach(enqueue); }
      polling = false;
    };
    const channel = supabase.channel(`calls-${meId}-${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "call_signals", filter: `recipient_id=eq.${meId}` }, p => enqueue(p.new as Signal))
      .subscribe(() => { void poll(); });
    void poll();
    const interval = setInterval(() => { void poll(); }, 1500);
    const onLeave = () => { const c = current.current; if (c) void send(c, "end"); cleanup(); };
    window.addEventListener("pagehide", onLeave);
    return () => {
      alive = false; mounted.current = false; clearInterval(interval);
      window.removeEventListener("pagehide", onLeave);
      const c = current.current; if (c) void send(c, "end").catch(() => {});
      cleanup(); void supabase.removeChannel(channel);
    };
  }, [meId]);

  function mute() {
    const c = current.current; if (!c?.local) return;
    c.local.getAudioTracks().forEach(t => { t.enabled = c.muted; }); patch({ muted: !c.muted });
  }
  function camera() {
    const c = current.current; if (!c?.local) return;
    c.local.getVideoTracks().forEach(t => { t.enabled = c.cameraOff; }); patch({ cameraOff: !c.cameraOff });
  }
  async function switchCamera() {
    const c = current.current; const connection = pc.current;
    const old = c?.local?.getVideoTracks()[0];
    if (!c?.local || !old || !connection) return;
    const facingMode = old.getSettings().facingMode === "environment" ? "user" : "environment";
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: facingMode } } });
      const track = stream.getVideoTracks()[0];
      if (!track || current.current?.id !== c.id) { stream.getTracks().forEach(t => t.stop()); return; }
      const sender = connection.getSenders().find(s => s.track?.kind === "video");
      if (!sender) { stream.getTracks().forEach(t => t.stop()); return; }
      track.enabled = !c.cameraOff;
      await sender.replaceTrack(track);
      old.stop(); c.local.removeTrack(old); c.local.addTrack(track);
      patch({ local: new MediaStream(c.local.getTracks()) });
    } catch { stream?.getTracks().forEach(t => t.stop()); toast.error("Could not switch camera"); }
  }
  return { call, ready, start, accept, end, mute, camera, switchCamera };
}