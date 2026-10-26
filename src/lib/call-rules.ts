export type CallKind = "voice" | "video";
export type CallPhase = "incoming" | "preparing" | "ringing" | "connecting" | "connected";
export function canCall(meId: string, peerId: string, busy: boolean) {
  return Boolean(peerId && peerId !== meId && !busy);
}
/** Offers ring for 45s. Device clocks may run ahead of or behind the server, so future timestamps are tolerated. */
export function isFreshOffer(createdAt: string, now = Date.now()) {
  const age = now - Date.parse(createdAt);
  return age >= -120000 && age < 45000;
}
/** Each browser tab is its own call device; a signal addressed to another tab must be left alone. */
export function isForDevice(to: string | null | undefined, device: string) {
  return !to || to === device;
}
