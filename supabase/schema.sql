-- 우리 집 가계부 — Supabase 스키마
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 실행한다.
-- 마지막의 members INSERT 두 줄은 두 사람의 구글 이메일로 바꿔서 실행한다.

-- ---------- 멤버 (로그인 허용 목록) ----------
create table if not exists public.members (
  email text primary key check (email = lower(email)),
  person text not null check (person in ('a', 'b'))
);

-- 로그인한 사람이 멤버인지 (RLS 에서 사용)
create or replace function public.is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.members
    where email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

-- ---------- 설정 (한 줄) ----------
create table if not exists public.settings (
  id int primary key default 1 check (id = 1),
  name_a text not null default '',
  name_b text not null default '',
  salary_a bigint not null default 0,
  salary_b bigint not null default 0,
  salary_account_a text,
  salary_account_b text,
  split_mode text not null default 'fixed' check (split_mode in ('fixed', 'income')),
  ratio_a int not null default 50 check (ratio_a between 0 and 100),
  cycle_start int not null default 1 check (cycle_start between 1 and 28),
  payday int not null default 25 check (payday between 1 and 31)
);
insert into public.settings (id) values (1) on conflict do nothing;

-- ---------- 계좌·카드 ----------
create table if not exists public.accounts (
  id text primary key,
  name text not null,
  kind text not null check (kind in ('bank', 'card')),
  owner text not null check (owner in ('a', 'b', 'joint')),
  institution text not null default '',
  billing_account_id text,
  pay_day int check (pay_day between 1 and 31),
  sort int not null default 0,
  archived boolean not null default false
);

-- ---------- 반복 플랜 항목 (템플릿) ----------
create table if not exists public.plan_items (
  id text primary key,
  "group" text not null check ("group" in ('fixed', 'living', 'allowance', 'saving')),
  name text not null,
  amount bigint not null default 0,
  payer text not null check (payer in ('a', 'b', 'joint')),
  account_id text,
  method text not null check (method in ('card_auto', 'account_auto', 'manual', 'cash')),
  card_id text,
  due_day int check (due_day between 1 and 31),
  sort int not null default 0,
  note text not null default '',
  active boolean not null default true,
  goal_amount bigint,
  goal_start bigint
);

-- ---------- 월 ----------
create table if not exists public.months (
  id text primary key,                       -- YYYY-MM
  income_a bigint not null default 0,
  income_b bigint not null default 0,
  extra_income bigint not null default 0,
  extra_note text not null default '',
  created_at timestamptz not null default now()
);

-- 그달에 고정된 플랜 항목
create table if not exists public.month_items (
  id text primary key,                       -- `${month}:${plan_item_id}`
  month text not null references public.months(id) on delete cascade,
  plan_item_id text,
  "group" text not null check ("group" in ('fixed', 'living', 'allowance', 'saving')),
  name text not null,
  amount bigint not null default 0,
  payer text not null check (payer in ('a', 'b', 'joint')),
  account_id text,
  method text not null check (method in ('card_auto', 'account_auto', 'manual', 'cash')),
  card_id text,
  due_day int check (due_day between 1 and 31),
  sort int not null default 0,
  note text not null default '',
  paid boolean not null default false,
  paid_at timestamptz,
  paid_by text check (paid_by in ('a', 'b'))
);
create index if not exists month_items_month on public.month_items(month);

-- 이체·카드값·정산 완료 체크
create table if not exists public.checks (
  id text primary key,
  month text not null,
  kind text not null check (kind in ('transfer', 'card', 'settle')),
  amount bigint not null default 0,
  done_at timestamptz not null default now(),
  done_by text not null check (done_by in ('a', 'b'))
);
create index if not exists checks_month on public.checks(month);

-- ---------- 생활비 분류와 지출 ----------
create table if not exists public.categories (
  id text primary key,
  name text not null,
  budget bigint not null default 0,
  sort int not null default 0
);

create table if not exists public.spendings (
  id text primary key,
  date date not null,
  amount bigint not null check (amount > 0),
  category_id text,
  pay_kind text not null check (pay_kind in ('card', 'cash', 'transfer')),
  account_id text,
  owner text not null check (owner in ('a', 'b', 'joint')),
  paid_by text not null check (paid_by in ('a', 'b')),
  memo text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists spendings_date_created on public.spendings (date desc, created_at desc);

-- ---------- 접근 제어: 두 사람만 ----------
do $$
declare t text;
begin
  foreach t in array array['settings','accounts','plan_items','months','month_items','checks','categories','spendings'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "members only" on public.%I', t);
    execute format('create policy "members only" on public.%I for all to authenticated using ((select public.is_member())) with check ((select public.is_member()))', t);
  end loop;
end $$;

alter table public.members enable row level security;
drop policy if exists "members read members" on public.members;
create policy "members read members" on public.members for select to authenticated
  using (email = lower(coalesce((select auth.jwt()) ->> 'email', '')) or (select public.is_member()));

-- ---------- 로그인한 계정 (이름은 본인만 바꿈) ----------
-- members = 들어올 수 있는 이메일과 a/b, users = 실제로 로그인한 계정. 앱이 로그인할 때 ensure_user() 를 부른다.
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

-- ---------- 실시간 동기화 ----------
do $$
declare t text;
begin
  foreach t in array array['settings','accounts','plan_items','months','month_items','checks','categories','spendings','users'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

-- ---------- 기본 분류 ----------
insert into public.categories (id, name, budget, sort) values
  ('cat-grocery', '장보기', 0, 1),
  ('cat-eatout', '외식·배달', 0, 2),
  ('cat-home', '생활용품', 0, 3),
  ('cat-car', '교통·차량', 0, 4),
  ('cat-health', '병원·약', 0, 5),
  ('cat-event', '경조사', 0, 6),
  ('cat-fun', '문화·여가', 0, 7),
  ('cat-etc', '기타', 0, 8)
on conflict do nothing;

-- ---------- 두 사람 등록 (이메일을 바꿔서 실행) ----------
-- 이메일은 소문자로 넣는다.
-- insert into public.members (email, person) values ('first-person@gmail.com', 'a');
-- insert into public.members (email, person) values ('second-person@gmail.com', 'b');
