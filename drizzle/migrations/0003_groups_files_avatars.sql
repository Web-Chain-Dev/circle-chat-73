alter table public.conversations add column if not exists is_group boolean not null default false;
alter table public.conversations add column if not exists title text;
alter table public.conversations add column if not exists created_by uuid;
alter table public.profiles add column if not exists avatar_path text;
alter table public.messages add column if not exists file_name text;
alter table public.messages add column if not exists file_size bigint;
alter table public.messages add column if not exists mime text;
alter table public.messages drop constraint if exists messages_kind_check;
alter table public.messages add constraint messages_kind_check check (kind in ('text','voice','video','image','clip','file'));

create or replace function public.create_group(_title text, _members uuid[])
returns uuid language plpgsql security definer set search_path = public as $$
declare _id uuid; _m uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if coalesce(trim(_title),'') = '' or length(_title) > 80 then raise exception 'invalid group name'; end if;
  insert into public.conversations (is_group, title, created_by) values (true, trim(_title), auth.uid()) returning id into _id;
  insert into public.conversation_members (conversation_id, user_id) values (_id, auth.uid());
  foreach _m in array coalesce(_members, '{}') loop
    if _m <> auth.uid() and exists(select 1 from public.profiles where id = _m) then
      insert into public.conversation_members (conversation_id, user_id) values (_id, _m) on conflict do nothing;
    end if;
  end loop;
  return _id;
end $$;
revoke execute on function public.create_group(text, uuid[]) from anon, public;
grant execute on function public.create_group(text, uuid[]) to authenticated;

create policy "avatars readable" on storage.objects for select to authenticated using (bucket_id = 'avatars');
create policy "own avatar upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own avatar update" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);