import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Courier" },
      { name: "description", content: "Sign in to Courier to start messaging." },
      { property: "og:title", content: "Sign in — Courier" },
      { property: "og:description", content: "Sign in to Courier to start messaging." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/chat" });
    });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => {
      if (s) navigate({ to: "/chat" });
    });
    return () => data.subscription.unsubscribe();
  }, [navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "up") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin, data: { display_name: name || undefined } },
        });
        if (error) throw error;
        if (!data.session) setSent(true);
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin + "/auth" });
    if (r.error) toast.error(r.error.message ?? "Google sign-in failed");
  }

  return (
    <div className="flex min-h-screen items-center justify-center chat-bg px-4">
      <div className="w-full max-w-sm rounded-2xl bg-card p-8 shadow-2xl">
        <div className="mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-primary">
          <Send className="h-11 w-11 -translate-x-0.5 text-primary-foreground" />
        </div>
        <h1 className="text-center text-2xl font-medium">Courier</h1>
        <p className="mt-1 text-center text-sm text-muted-foreground">
          {mode === "in" ? "Sign in to continue messaging" : "Create your account"}
        </p>
        {sent ? (
          <p className="mt-6 rounded-lg bg-secondary p-4 text-center text-sm">
            Check your email to confirm your account, then sign in.
          </p>
        ) : (
          <form onSubmit={submit} className="mt-6 space-y-3">
            {mode === "up" && (
              <Input placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} className="h-12" />
            )}
            <Input type="email" required placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-12" />
            <Input type="password" required minLength={6} placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} className="h-12" />
            <Button type="submit" disabled={busy} className="h-12 w-full text-base uppercase tracking-wide">
              {mode === "in" ? "Sign in" : "Sign up"}
            </Button>
            <Button type="button" variant="secondary" onClick={google} className="h-12 w-full">
              Continue with Google
            </Button>
          </form>
        )}
        <button
          onClick={() => { setMode(mode === "in" ? "up" : "in"); setSent(false); }}
          className="mt-5 w-full text-center text-sm text-primary hover:underline"
        >
          {mode === "in" ? "No account? Sign up" : "Have an account? Sign in"}
        </button>
      </div>
    </div>
  );
}
