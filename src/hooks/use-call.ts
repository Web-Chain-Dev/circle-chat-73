import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { canCall, isForDevice, isFreshOffer, type CallKind, type CallPhase } from "@/lib/call-rules";
import type { Conversation, Profile } from "@/lib/chat";
import type { Json, Tables } from "@/integrations/supabase/types";

type Signal = Tables<"call_signals">;
/** Every signal payload names the sending tab and, once known, the receiving tab. */
type Envelope = {
  from?: string; to?: string | null; kind?: string; answeredBy?: string;
  description?: RTCSessionDescriptionInit | undefined; candidate?: RTCIceCandidateInit;
};
export type CallState = {
  id: string; conversationId: string; peer: Profile; kind: CallKind; phase: CallPhase;
  local: MediaStream | null; remote: MediaStream | null; startedAt: number | null;
  muted: boolean; cameraOff: boolean;
};
// STUN + public community TURN relays for NAT/firewall traversal (zero signup, no card)
const iceServers: RTCIceServer[] = [
  { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302", "stun:stun2.l.google.com:19302"] },
  { urls: "stun:stun.cloudflare.com:3478" },
  { urls: "stun:global.stun.twilio.com:3478" },
  {
    urls: ["turn:turn.evan-brass.net:3478", "turn:turn.evan-brass.net:3478?transport=tcp"],
    username: "user",
    credential: "password",
  },
  {
    urls: ["turn:turn.bettercrewl.ink:3478?transport=udp", "turn:turn.bettercrewl.ink:3478?transport=tcp"],
    username: "M9DRVaByiujoXeuYAAAG",
    credential: "TpHR9HQNZ8taxjb3",
  },
];

/** Resolves once ICE gathering finishes (or after `ms`), so the SDP carries most candidates in one message. */
function gathered(connection: RTCPeerConnection, ms = 2500) {
  return new Promise<void>(resolve => {
    if (connection.iceGatheringState === "complete") return resolve();
    const done = () => { clearTimeout(timer); connection.removeEventListener("icegatheringstatechange", check); resolve(); };
    const check = () => { if (connection.iceGatheringState === "complete") done(); };
    const timer = setTimeout(done, ms);
    connection.addEventListener("icegatheringstatechange", check);
  });
}

export function useCall(meId: string) {
  const [call, setCall] = useState<CallState | null>(null);
  const [ready, setReady] = useState(false);
  const device = useRef(crypto.randomUUID());
  const current = useRef<CallState | null>(null);
  const peerDevice = useRef<string | null>(null);
  const pc = useRef<RTCPeerConnection | null>(null);
  const descriptionSent = useRef(false);
  const offer = useRef<RTCSessionDescriptionInit | null>(null);
  const candidates = useRef(new Map<string, RTCIceCandidateInit[]>());
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const accepting = useRef(false);
  const mounted = useRef(true);
  const update = (next: CallState | null) => { current.current = next; if (mounted.current) setCall(next); };
  const patch = (changes: Partial<CallState>) => { if (current.current) update({ ...current.current, ...changes }); };

  async function send(c: CallState, kind: Signal["kind"], data: Envelope = {}, to: string | null = peerDevice.current) {
    const { error } = await supabase.from("call_signals").insert({
      call_id: c.id, conversation_id: c.conversationId, sender_id: meId,
      recipient_id: c.peer.id, kind, payload: { ...data, from: device.current, to } as unknown as Json,
    });
    if (error) throw error;
  }
  function cleanup() {
    const c = current.current;
    if (timeout.current) clearTimeout(timeout.current);
    timeout.current = null;
    pc.current?.close(); pc.current = null;
    c?.local?.getTracks().forEach(t => t.stop());
    c?.remote?.getTracks().forEach(t => t.stop());
    candidates.current.clear(); offer.current = null; accepting.current = false;
    peerDevice.current = null; descriptionSent.current = false;
    update(null);
    // Remove this tab's leftover signals for the finished call a little later, after the last one is delivered.
    if (c) setTimeout(() => { void supabase.from("call_signals").delete().eq("call_id", c.id).eq("sender_id", meId); }, 8000);
  }
  async function end(kind: "end" | "reject" = "end") {
    const c = current.current; const to = peerDevice.current;
    cleanup();
    if (c) await send(c, kind, {}, to).catch(() => toast.error("Could not notify the other person"));
  }
  function armTimeout(id: string, milliseconds: number, message: string) {
    if (timeout.current) clearTimeout(timeout.current);
    timeout.current = setTimeout(() => {
      if (current.current?.id === id) { toast(message); void end(); }
    }, milliseconds);
  }
  async function addCandidate(connection: RTCPeerConnection, candidate: RTCIceCandidateInit) {
    // One bad or end-of-gathering candidate must never end the whole call.
    if (!candidate.candidate) return;
    try { await connection.addIceCandidate(candidate); } catch { /* ignore */ }
  }
  async function media(c: CallState) {
    if (!navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection === "undefined") {
      throw new Error("Calls need a browser with camera and microphone support over HTTPS");
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: c.kind === "video" ? { facingMode: "user" } : false });
    if (current.current?.id !== c.id || !mounted.current) { stream.getTracks().forEach(t => t.stop()); return null; }
    patch({ local: stream });
    const connection = new RTCPeerConnection({ iceServers, iceCandidatePoolSize: 4 });
    pc.current = connection; descriptionSent.current = false;
    stream.getTracks().forEach(t => connection.addTrack(t, stream));
    connection.ontrack = event => {
      if (current.current?.id !== c.id) return;
      const tracks = current.current.remote?.getTracks() ?? [];
      if (!tracks.some(t => t.id === event.track.id)) tracks.push(event.track);
      patch({ remote: new MediaStream(tracks) });
    };
    connection.onicecandidate = event => {
      // Candidates gathered before the offer/answer went out are already inside its SDP.
      if (event.candidate?.candidate && descriptionSent.current && current.current?.id === c.id) {
        void send(c, "ice", { candidate: event.candidate.toJSON() }).catch(() => {});
      }
    };
    connection.onconnectionstatechange = () => {
      if (current.current?.id !== c.id) return;
      if (connection.connectionState === "connected") {
        if (timeout.current) clearTimeout(timeout.current);
        timeout.current = null;
        patch({ phase: "connected", startedAt: current.current.startedAt ?? Date.now() });
      } else if (connection.connectionState === "failed") {
        toast.error("Call could not connect between these two networks."); void end();
      } else if (connection.connectionState === "disconnected") {
        patch({ phase: "connecting" }); armTimeout(c.id, 15000, "Call connection was lost");
      }
    };
    return connection;
  }
  async function flush(id: string, connection: RTCPeerConnection) {
    const queued = candidates.current.get(id) ?? [];
    candidates.current.delete(id);
    for (const candidate of queued) await addCandidate(connection, candidate);
  }
  async function start(conv: Conversation, kind: CallKind) {
    if (!ready) { toast.error("Calls are reconnecting. Try again in a moment."); return; }
    if (!canCall(meId, conv.peer.id, Boolean(current.current))) return;
    const c: CallState = { id: crypto.randomUUID(), conversationId: conv.id, peer: conv.peer, kind, phase: "preparing", local: null, remote: null, startedAt: null, muted: false, cameraOff: false };
    peerDevice.current = null;
    update(c); armTimeout(c.id, 60000, "Call cancelled");
    try {
      const connection = await media(c);
      if (!connection) return;
      await connection.setLocalDescription(await connection.createOffer());
      await gathered(connection);
      if (current.current?.id !== c.id) return;
      descriptionSent.current = true;
      // The offer goes to every open tab of the other person; whichever answers becomes the peer device.
      await send(c, "offer", { kind, description: connection.localDescription?.toJSON() }, null);
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
      await gathered(connection);
      if (current.current?.id !== c.id) return;
      descriptionSent.current = true;
      await send(c, "answer", { description: connection.localDescription?.toJSON() });
    } catch {
      if (current.current?.id === c.id) { toast.error("Could not answer. Check camera and microphone permissions."); void end("reject"); }
    } finally { accepting.current = false; }
  }
  /** Returns true when the signal was meant for this tab and can be removed from the queue. */
  async function receive(s: Signal): Promise<boolean> {
    if (s.recipient_id !== meId) return false;
    const p = (s.payload ?? {}) as Envelope;
    const c = current.current;
    if (!isForDevice(p.to, device.current)) {
      // Another of my tabs picked up this call: stop ringing here.
      if (c?.id === s.call_id && c.phase === "incoming") cleanup();
      return false;
    }
    if (s.kind === "offer") {
      if (!isFreshOffer(s.created_at) || c?.id === s.call_id || !p.from) return false;
      if (!p.description || p.description.type !== "offer" || !["voice", "video"].includes(p.kind ?? "")) return false;
      const { data: profile } = await supabase.from("profiles").select("id, display_name, username, avatar_color").eq("id", s.sender_id).single();
      if (!profile || !mounted.current) return false;
      const incoming: CallState = { id: s.call_id, conversationId: s.conversation_id, peer: profile, kind: p.kind as CallKind, phase: "incoming", local: null, remote: null, startedAt: null, muted: false, cameraOff: false };
      if (current.current) { await send(incoming, "busy", {}, p.from); return false; }
      offer.current = p.description; peerDevice.current = p.from; update(incoming);
      armTimeout(incoming.id, 45000, "Missed call");
      return false;
    }
    if (s.kind === "ice") {
      if (c && c.id !== s.call_id) return true;
      if (peerDevice.current && p.from !== peerDevice.current) return true;
      const candidate = p.candidate;
      if (!candidate || typeof candidate.candidate !== "string") return true;
      if (c?.id === s.call_id && pc.current?.remoteDescription) await addCandidate(pc.current, candidate);
      else {
        if (candidates.current.size > 20) candidates.current.clear();
        const queue = candidates.current.get(s.call_id) ?? [];
        if (queue.length < 100) candidates.current.set(s.call_id, [...queue, candidate]);
      }
      return Boolean(p.to);
    }
    if (c?.id !== s.call_id || c.peer.id !== s.sender_id) return Boolean(p.to);
    if (s.kind === "end" && p.answeredBy) {
      if (p.answeredBy !== device.current && c.phase === "incoming") cleanup();
      return false;
    }
    if (peerDevice.current && p.from !== peerDevice.current) {
      // A second tab of the callee answered or declined after another tab already did; ignore it.
      return Boolean(p.to);
    }
    if (s.kind === "answer" && pc.current && pc.current.signalingState === "have-local-offer" && p.description) {
      peerDevice.current = p.from ?? null;
      await pc.current.setRemoteDescription(p.description);
      await flush(s.call_id, pc.current);
      patch({ phase: "connecting" }); armTimeout(s.call_id, 35000, "Call could not connect");
      // Tell the callee's other tabs to stop ringing.
      if (p.from) void send(c, "end", { answeredBy: p.from }, null).catch(() => {});
    } else if (["end", "reject", "busy"].includes(s.kind)) {
      const ringing = c.phase === "ringing" || c.phase === "preparing";
      toast(s.kind === "busy" ? "They’re on another call" : s.kind === "reject" ? "Call declined" : "Call ended");
      cleanup();
      // If one of their tabs declined, make sure the rest stop ringing too.
      if (ringing && s.kind !== "end") void send(c, "end", {}, null).catch(() => {});
    }
    return true;
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
        let consumed = true;
        try { consumed = await receive(s); } catch { if (current.current?.id === s.call_id) { toast.error("Call connection failed"); void end(); } }
        if (consumed) await supabase.from("call_signals").delete().eq("id", s.id);
      }).catch(() => {});
    };
    const poll = async () => {
      if (polling || !alive) return;
      polling = true;
      const { data, error } = await supabase.from("call_signals").select("*").eq("recipient_id", meId).order("created_at", { ascending: false }).limit(200);
      if (alive) { setReady(!error); data?.reverse().forEach(enqueue); }
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
