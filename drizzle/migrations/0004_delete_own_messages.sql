CREATE POLICY "senders delete own msgs"
ON public.messages
FOR DELETE
TO authenticated
USING (sender_id = auth.uid());