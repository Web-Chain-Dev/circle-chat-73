
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'User',
  username text unique,
  avatar_color text not null default 'blue',
  created_at timestamptz not null default now()
);
grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;
create policy "profiles readable" on public.profiles for select to authenticated using (true);
create policy "own profile insert" on public.profiles for insert to authenticated with check (auth.uid() = id);
create policy "own profile update" on public.profiles for update to authenticated using (auth.uid() = id);

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name, username, avatar_color)
  values (new.id,
    coalesce(new.raw_user_meta_data->>'display_name', new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)),
    lower(split_part(new.email,'@',1)) || '_' || substr(new.id::text,1,4),
    (array['blue','green','orange','pink','teal','red'])[1 + floor(random()*6)::int]);
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);
create table public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null default 'text' check (kind in ('text','voice','video')),
  body text,
  media_path text,
  duration numeric,
  created_at timestamptz not null default now()
);
create index on public.messages (conversation_id, created_at);

grant select, update on public.conversations to authenticated;
grant select, update on public.conversation_members to authenticated;
grant select, insert on public.messages to authenticated;
grant all on public.conversations, public.conversation_members, public.messages to service_role;

alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;

create or replace function public.is_member(_conv uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.conversation_members where conversation_id=_conv and user_id=auth.uid())
$$;

create policy "members read conv" on public.conversations for select to authenticated using (public.is_member(id));
create policy "members read members" on public.conversation_members for select to authenticated using (public.is_member(conversation_id));
create policy "own membership update" on public.conversation_members for update to authenticated using (user_id = auth.uid());
create policy "members read msgs" on public.messages for select to authenticated using (public.is_member(conversation_id));
create policy "members send msgs" on public.messages for insert to authenticated with check (sender_id = auth.uid() and public.is_member(conversation_id));

create or replace function public.bump_conversation() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.conversations set last_message_at = new.created_at where id = new.conversation_id;
  return new;
end $$;
create trigger messages_bump after insert on public.messages for each row execute function public.bump_conversation();

create or replace function public.get_or_create_dm(_other uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare _id uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select a.conversation_id into _id from public.conversation_members a
    join public.conversation_members b on a.conversation_id = b.conversation_id
    where a.user_id = auth.uid() and b.user_id = _other
    and (select count(*) from public.conversation_members c where c.conversation_id = a.conversation_id) = case when _other = auth.uid() then 1 else 2 end
    limit 1;
  if _id is not null then return _id; end if;
  insert into public.conversations default values returning id into _id;
  insert into public.conversation_members (conversation_id, user_id) values (_id, auth.uid());
  if _other <> auth.uid() then
    insert into public.conversation_members (conversation_id, user_id) values (_id, _other);
  end if;
  return _id;
end $$;
revoke execute on function public.get_or_create_dm(uuid) from anon, public;
grant execute on function public.get_or_create_dm(uuid) to authenticated;

alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.conversations;
