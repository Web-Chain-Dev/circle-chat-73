create or replace function public.shares_conversation(_other uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select _other = auth.uid() or exists(
    select 1 from public.conversation_members a join public.conversation_members b on a.conversation_id = b.conversation_id
    where a.user_id = auth.uid() and b.user_id = _other)
$$;

create or replace function public.search_profiles(_term text)
returns table(id uuid, display_name text, username text, avatar_color text, avatar_path text)
language sql stable security definer set search_path = public as $$
  select p.id, p.display_name, p.username, p.avatar_color, p.avatar_path from public.profiles p
  where auth.uid() is not null and length(trim(coalesce(_term,''))) >= 2
    and (p.display_name ilike '%' || trim(_term) || '%' or p.username ilike '%' || trim(_term) || '%')
  order by p.display_name limit 20
$$;
revoke execute on function public.search_profiles(text) from anon, public;
grant execute on function public.search_profiles(text) to authenticated;

drop policy if exists "profiles readable" on public.profiles;
create policy "profiles visible to chat peers" on public.profiles for select to authenticated
  using (public.shares_conversation(id));

drop policy if exists "avatars readable" on storage.objects;
create policy "avatars readable by chat peers" on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and public.shares_conversation(((storage.foldername(name))[1])::uuid));