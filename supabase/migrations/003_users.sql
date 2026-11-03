-- 003 계정별 사용자 — 로그인한 구글 계정마다 한 줄. 이름은 그 계정 본인만 바꿀 수 있다.
-- 이미 schema.sql 을 실행한 프로젝트에 한 번 실행한다 (여러 번 실행해도 안전).
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 Run.
--
-- members  = 들어올 수 있는 이메일과 그 사람이 a/b 중 누구인지 (관리자가 SQL 로만 바꿈)
-- users    = 실제로 로그인한 계정. 앱이 로그인할 때 ensure_user() 로 만들고, 이름은 본인이 바꾼다.
-- settings.name_a / name_b 는 아직 로그인하지 않은 사람의 이름(기본값)으로만 쓴다.

create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique check (email = lower(email)),
  person text not null unique check (person in ('a', 'b')),
  name text not null default '' check (char_length(name) <= 20),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists users_touch on public.users;
create trigger users_touch before update on public.users
  for each row execute function public.touch_updated_at();

-- 접근: 두 사람 모두 서로의 이름을 읽고, 바꾸는 건 자기 줄의 name 만
alter table public.users enable row level security;
drop policy if exists "members read users" on public.users;
create policy "members read users" on public.users for select to authenticated
  using ((select public.is_member()));
drop policy if exists "update own name" on public.users;
create policy "update own name" on public.users for update to authenticated
  using (id = (select auth.uid()) and (select public.is_member()))
  with check (id = (select auth.uid()));

revoke all on public.users from anon, authenticated;
grant select on public.users to authenticated;
grant update (name) on public.users to authenticated;

-- 로그인한 계정의 users 줄을 만들거나 맞춘다. members 에 없는 이메일이면 아무것도 하지 않는다.
-- 처음 만들 때 이름은 (같은 사람의 예전 계정 이름) > settings 의 이름 > 이메일 앞부분.
create or replace function public.ensure_user() returns public.users
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  mail text := lower(coalesce(auth.jwt() ->> 'email', ''));
  p text;
  inherited text;
  u public.users;
begin
  if uid is null or mail = '' then
    return null;
  end if;
  select person into p from public.members where email = mail;
  if p is null then
    return null;
  end if;

  select * into u from public.users where id = uid;
  if found then
    if u.email <> mail or u.person <> p then
      delete from public.users where (person = p or email = mail) and id <> uid;
      update public.users set email = mail, person = p where id = uid returning * into u;
    end if;
    return u;
  end if;

  -- 같은 사람이 다른 구글 계정으로 바뀐 경우: 예전 줄의 이름을 이어받고 지운다
  select nullif(name, '') into inherited from public.users where person = p;
  delete from public.users where person = p or email = mail;
  if inherited is null then
    select nullif(case p when 'a' then name_a else name_b end, '') into inherited from public.settings where id = 1;
  end if;

  insert into public.users (id, email, person, name)
  values (uid, mail, p, left(coalesce(inherited, split_part(mail, '@', 1)), 20))
  returning * into u;
  return u;
end $$;

revoke execute on function public.ensure_user() from public, anon;
grant execute on function public.ensure_user() to authenticated;

-- 이름을 바꾸면 다른 폰에도 바로 보이게
do $$
begin
  alter publication supabase_realtime add table public.users;
exception when duplicate_object then null;
end $$;
