import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Courier — Messenger" },
      { name: "description", content: "Real-time chats with voice and round video messages." },
      { property: "og:title", content: "Courier — Messenger" },
      { property: "og:description", content: "Real-time chats with voice and round video messages." },
    ],
  }),
  beforeLoad: () => {
    throw redirect({ to: "/chat" });
  },
});
