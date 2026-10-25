CREATE TABLE public.call_signals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 call_id uuid NOT NULL,
 conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
 sender_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 recipient_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 kind text NOT NULL CHECK (kind IN ('offer', 'answer', 'ice', 'end', 'reject', 'busy')),
 payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (octet_length(payload::text) < 65536),
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK (sender_id <> recipient_id)
);
GRANT SELECT, INSERT, DELETE ON public.call_signals TO authenticated;
GRANT ALL ON public.call_signals TO service_role;
ALTER TABLE public.call_signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Participants read recent call signals" ON public.call_signals FOR SELECT TO authenticated USING ((auth.uid() = sender_id OR auth.uid() = recipient_id) AND public.is_member(conversation_id) AND created_at > now() - interval '2 minutes');
CREATE POLICY "Members send call signals to their peers" ON public.call_signals FOR INSERT TO authenticated WITH CHECK (sender_id = auth.uid() AND public.is_member(conversation_id) AND EXISTS (SELECT 1 FROM public.conversation_members cm WHERE cm.conversation_id = call_signals.conversation_id AND cm.user_id = call_signals.recipient_id));
CREATE POLICY "Participants remove call signals" ON public.call_signals FOR DELETE TO authenticated USING (auth.uid() = sender_id OR auth.uid() = recipient_id);
CREATE INDEX call_signals_recipient_created_idx ON public.call_signals(recipient_id, created_at);
ALTER PUBLICATION supabase_realtime ADD TABLE public.call_signals;