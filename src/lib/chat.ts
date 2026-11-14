import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type Profile = { id: string; display_name: string; username: string | null; avatar_color: string; avatar_path?: string | null };
export const PROFILE_COLS = "id, display_name, username, avatar_color, avatar_path";
export type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  kind: "text" | "voice" | "video" | "image" | "clip" | "file";
  file_name?: string | null;
  file_size?: number | null;
  mime?: string | null;
  body: string | null;
  media_path: string | null;
  duration: number | null;
  created_at: string;
};
export type Conversation = {
  id: string;
  last_message_at: string;
  peer: Profile;
  is_group: boolean;
  title: string | null;
  members: Profile[];
  last?: Message | undefined;
};

export function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
export function formatListTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return formatTime(iso);
  const diff = (now.getTime() - d.getTime()) / 86400000;
  if (diff < 7) return d.toLocaleDateString([], { weekday: "short" });
  return d.toLocaleDateString([], { day: "2-digit", month: "2-digit", year: "2-digit" });
}
export function formatDuration(s: number) {
  const t = Math.max(0, Math.round(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
}
export function previewText(m?: Message) {
  if (!m) return "No messages yet";
  if (m.kind === "voice") return "🎤 Voice message";
  if (m.kind === "video") return "📹 Video message";
  if (m.kind === "image") return "🖼 Photo";
  if (m.kind === "clip") return "🎬 Video";
  if (m.kind === "file") return `📎 ${m.file_name ?? "File"}`;
  return m.body ?? "";
}

const urlCache = new Map<string, string>();
export function formatSize(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}
export function useSignedUrl(path: string | null | undefined, bucket: "media" | "avatars" = "media") {
  const key = path ? `${bucket}:${path}` : null;
  const [url, setUrl] = useState<string | null>(key ? urlCache.get(key) ?? null : null);
  useEffect(() => {
    if (!path || !key) { setUrl(null); return; }
    if (urlCache.has(key)) { setUrl(urlCache.get(key)!); return; }
    let alive = true;
    supabase.storage
      .from(bucket)
      .createSignedUrl(path, 60 * 60 * 6)
      .then(({ data }) => {
        if (data?.signedUrl && alive) {
          urlCache.set(key, data.signedUrl);
          setUrl(data.signedUrl);
        }
      });
    return () => { alive = false; };
  }, [path, key, bucket]);
  return url;
}

export function pickMime(video: boolean) {
  const opts = video
    ? ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4"]
    : ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];
  return opts.find((t) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) ?? "";
}
