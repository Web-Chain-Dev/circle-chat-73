export type CallKind = "voice" | "video";
export type CallPhase = "incoming" | "preparing" | "ringing" | "connecting" | "connected";
export function canCall(meId: string, peerId: string, busy: boolean) {
  return Boolean(peerId && peerId !== meId && !busy);
}
export function isFreshOffer(createdAt: string, now = Date.now()) {
  const age = now - Date.parse(createdAt);
  return age >= -5000 && age < 45000;
}