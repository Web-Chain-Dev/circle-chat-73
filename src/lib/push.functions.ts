import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Input = z.object({
  conversationId: z.string().uuid(),
  kind: z.enum(["message", "call"]),
  text: z.string().max(200).default(""),
  video: z.boolean().optional(),
});

/** Sends a phone/browser notification to every other member of a chat. */
export const notifyConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }) => {
    const jwk = process.env["VAPID_PRIVATE_JWK"];
    if (!jwk) return { sent: 0 };
    const { supabase, userId } = context;
    // RLS: only members can read the conversation and its members.
    const { data: conv } = await supabase.from("conversations")
      .select("id, is_group, title, conversation_members(user_id)").eq("id", data.conversationId).maybeSingle();
    if (!conv) return { sent: 0 };
    const others = (conv.conversation_members ?? []).map((m: { user_id: string }) => m.user_id).filter((id: string) => id !== userId);
    if (!others.length) return { sent: 0 };
    const { data: me } = await supabase.from("profiles").select("display_name").eq("id", userId).maybeSingle();
    const name = me?.display_name ?? "Someone";
    const title = data.kind === "call" ? `${name}` : conv.is_group ? `${conv.title ?? "Group"}` : name;
    const body = data.kind === "call"
      ? (data.video ? "Incoming video call" : "Incoming call")
      : conv.is_group ? `${name}: ${data.text}` : data.text;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: subs } = await supabaseAdmin.from("push_subscriptions").select("id, endpoint, p256dh, auth").in("user_id", others);
    if (!subs?.length) return { sent: 0 };
    const { buildPushHTTPRequest } = await import("@pushforge/builder");
    const privateJWK = JSON.parse(jwk);
    let sent = 0;
    await Promise.all(subs.map(async (s) => {
      try {
        const req = await buildPushHTTPRequest({
          privateJWK,
          subscription: { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          message: {
            payload: { title, body, kind: data.kind, conversationId: data.conversationId, url: "/chat" },
            adminContact: "mailto:notifications@courier.app",
            options: { ttl: data.kind === "call" ? 45 : 3600, urgency: "high", topic: data.kind === "call" ? "call" : undefined },
          },
        });
        const res = await fetch(req.endpoint, { method: "POST", headers: req.headers, body: req.body });
        if (res.status === 404 || res.status === 410) await supabaseAdmin.from("push_subscriptions").delete().eq("id", s.id);
        else if (res.ok) sent++;
        else console.error("push failed", res.status, await res.text());
      } catch (e) { console.error("push error", e); }
    }));
    return { sent };
  });
