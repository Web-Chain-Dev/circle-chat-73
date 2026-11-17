import { supabase } from "@/integrations/supabase/client";
import { notifyConversation } from "@/lib/push.functions";

export const VAPID_PUBLIC_KEY = "BCVhelVxL1iHWKCqdbgQMIzAQWJeqLuYLkePMhJp15GNTn-fsBrjGkBWfdGAuCALRi7S_sWmfeVEsrEYkfEtm2g";

export type PushResult = "enabled" | "unsupported" | "denied" | "open-in-new-tab" | "ios-install";

function b64ToBytes(s: string) {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const raw = atob((s + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export function pushSupported() {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

async function save(sub: PushSubscription, userId: string) {
  const j = sub.toJSON();
  await supabase.from("push_subscriptions").upsert(
    { user_id: userId, endpoint: sub.endpoint, p256dh: j.keys!["p256dh"]!, auth: j.keys!["auth"]! },
    { onConflict: "endpoint" },
  );
}

/** Call from a tap: asks permission, registers the worker and saves this device. */
export async function enablePush(userId: string): Promise<PushResult> {
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone;
  if (!pushSupported()) return ios && !standalone ? "ios-install" : "unsupported";
  if (window.top !== window.self) return "open-in-new-tab";
  const perm = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
  if (perm !== "granted") return "denied";
  const reg = await navigator.serviceWorker.register("/push-sw.js", { scope: "/" });
  await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription())
    ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(VAPID_PUBLIC_KEY) }));
  await save(sub, userId);
  return "enabled";
}

/** Silently refreshes the saved device if permission was already given. */
export async function refreshPush(userId: string) {
  if (!pushSupported() || Notification.permission !== "granted" || window.top !== window.self) return;
  try {
    const reg = await navigator.serviceWorker.getRegistration("/push-sw.js") ?? await navigator.serviceWorker.register("/push-sw.js", { scope: "/" });
    const sub = await reg.pushManager.getSubscription();
    if (sub) await save(sub, userId);
  } catch { /* ignore */ }
}

/** Fire-and-forget notification to the other members of a chat. */
export function notify(conversationId: string, kind: "message" | "call", text = "", video?: boolean) {
  notifyConversation({ data: { conversationId, kind, text: text.slice(0, 200), video } }).catch(() => {});
}
