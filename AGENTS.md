<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Chat app
- Chat data lives in Lovable Cloud: profiles, conversations, conversation_members, messages; access is gated by the `is_member()` security-definer function so RLS stays non-recursive.
- Voice/video media is stored in the private `media` bucket under `{conversation_id}/...` and shown via signed URLs, so only chat members can read it.
- Direct chats are created only through the `get_or_create_dm` RPC to avoid duplicate conversations.
