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
  payday int not null default 25 check (payday between 1 and 31)   -- 예전 공통 월급날. 사람별 월급날은 아래 payday_a / payday_b
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
create index if not exists spendings_date_id on public.spendings (date desc, id desc);

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

-- ========== 기록 남기기 · 충돌 막기 · 무결성 (migrations/004 와 같음) ==========
-- 누가·언제 만들고 고쳤는지, rev 로 동시 수정 거절, history 에 바뀐 칸 기록, 앞으로 쓸 정보 칸, 외래키와 인덱스.
-- 위의 create table 에 칸을 더하는 형태로 두어서 마이그레이션과 결과가 같다.

-- ---------- 0. 로그인한 사람(a/b) ----------
create or replace function public.current_person() returns text
language sql stable security definer set search_path = public as $$
  select person from public.members where email = lower(coalesce(auth.jwt() ->> 'email', ''));
$$;
revoke execute on function public.current_person() from public, anon;
grant execute on function public.current_person() to authenticated;

-- ---------- 1. 공통 칸: rev · created_at/by · updated_at/by ----------
do $$
declare t text;
begin
  foreach t in array array['settings','accounts','plan_items','months','month_items','categories','spendings'] loop
    execute format('alter table public.%I add column if not exists rev integer not null default 1', t);
    execute format('alter table public.%I add column if not exists created_at timestamptz not null default now()', t);
    execute format('alter table public.%I add column if not exists created_by text check (created_by in (''a'', ''b''))', t);
    execute format('alter table public.%I add column if not exists updated_at timestamptz not null default now()', t);
    execute format('alter table public.%I add column if not exists updated_by text check (updated_by in (''a'', ''b''))', t);
  end loop;
end $$;

-- ---------- 2. 앞으로 쓸 정보 칸 ----------
alter table public.spendings
  add column if not exists source text not null default 'manual' check (source in ('manual', 'preset', 'notification', 'import')),
  add column if not exists tags text[] not null default '{}',
  add column if not exists installment_months smallint not null default 1 check (installment_months between 1 and 60),
  add column if not exists approval_no text check (char_length(approval_no) <= 40);

alter table public.accounts
  add column if not exists last4 text check (last4 ~ '^[0-9]{4}$'),
  add column if not exists note text not null default '';

alter table public.plan_items
  add column if not exists start_month text check (start_month ~ '^[0-9]{4}-[0-9]{2}$'),
  add column if not exists end_month text check (end_month ~ '^[0-9]{4}-[0-9]{2}$');

alter table public.month_items
  add column if not exists paid_amount bigint check (paid_amount >= 0);

alter table public.months
  add column if not exists note text not null default '',
  add column if not exists closed_at timestamptz;

-- ---------- 3. 외래키 (계좌·플랜 항목은 지우지 않고 숨기지만, 없는 id 가 들어가는 것은 막는다) ----------
-- 이미 끊긴 참조는 비운다 (트리거를 만들기 전이라 rev·기록이 바뀌지 않는다)
update public.spendings set account_id = null where account_id is not null and account_id not in (select id from public.accounts);
update public.month_items set account_id = null where account_id is not null and account_id not in (select id from public.accounts);
update public.month_items set card_id = null where card_id is not null and card_id not in (select id from public.accounts);
update public.month_items set plan_item_id = null where plan_item_id is not null and plan_item_id not in (select id from public.plan_items);
update public.plan_items set account_id = null where account_id is not null and account_id not in (select id from public.accounts);
update public.plan_items set card_id = null where card_id is not null and card_id not in (select id from public.accounts);
update public.accounts set billing_account_id = null where billing_account_id is not null and billing_account_id not in (select id from public.accounts);
update public.settings set salary_account_a = null where salary_account_a is not null and salary_account_a not in (select id from public.accounts);
update public.settings set salary_account_b = null where salary_account_b is not null and salary_account_b not in (select id from public.accounts);

do $$
declare fk record;
begin
  for fk in select * from (values
    ('spendings',   'spendings_account_fk',    'account_id',         'accounts'),
    ('month_items', 'month_items_account_fk',  'account_id',         'accounts'),
    ('month_items', 'month_items_card_fk',     'card_id',            'accounts'),
    ('month_items', 'month_items_plan_fk',     'plan_item_id',       'plan_items'),
    ('plan_items',  'plan_items_account_fk',   'account_id',         'accounts'),
    ('plan_items',  'plan_items_card_fk',      'card_id',            'accounts'),
    ('accounts',    'accounts_billing_fk',     'billing_account_id', 'accounts'),
    ('settings',    'settings_salary_a_fk',    'salary_account_a',   'accounts'),
    ('settings',    'settings_salary_b_fk',    'salary_account_b',   'accounts')
  ) as v(tbl, name, col, ref) loop
    if not exists (select 1 from pg_constraint where conname = fk.name) then
      execute format('alter table public.%I add constraint %I foreign key (%I) references public.%I(id) on delete set null', fk.tbl, fk.name, fk.col, fk.ref);
    end if;
  end loop;
end $$;
-- 분류(category_id)는 외래키를 걸지 않는다: 분류를 지우고 "되돌리기"하면 기존 지출이 다시 그 분류로 돌아와야 해서.

-- ---------- 4. 인덱스 ----------
create index if not exists spendings_account on public.spendings (account_id, date desc) where account_id is not null;
create index if not exists spendings_category on public.spendings (category_id, date desc) where category_id is not null;
create index if not exists month_items_plan on public.month_items (plan_item_id) where plan_item_id is not null;
-- 카드 알림으로 자동 기록할 때 같은 승인 건이 두 번 들어가지 않게
create unique index if not exists spendings_approval on public.spendings (account_id, date, approval_no) where approval_no is not null;

-- ---------- 5. 줄마다: 만든·고친 사람과 시각, rev 확인 ----------
create or replace function public.stamp_row() returns trigger
language plpgsql set search_path = public as $$
declare
  who text := public.current_person();
  noise text[] := array['rev', 'updated_at', 'updated_by'];
begin
  if tg_op = 'INSERT' then
    new.created_at := coalesce(new.created_at, now());
    new.created_by := coalesce(who, new.created_by);
    new.rev := coalesce(new.rev, 1);
  else
    new.created_at := old.created_at;
    new.created_by := old.created_by;
    -- 바뀐 내용이 없으면 쓰지 않는다 (rev·기록·실시간 알림이 늘지 않게). 같은 저장을 다시 보내도 안전한 이유
    if (to_jsonb(new) - noise) = (to_jsonb(old) - noise) then
      return null;
    end if;
    -- 앱이 읽은 rev 와 지금 rev 가 다르면 그사이 다른 폰이 고친 것. rev 를 보내지 않으면 확인하지 않는다
    -- (upsert 에 rev: null 을 보내면 위 INSERT 쪽에서 1 이 되어 충돌로 거절된다 — 클라이언트는 null 칸을 보내지 않는다)
    if new.rev is not null and new.rev <> old.rev then
      raise exception 'conflict: % % was changed on another device', tg_table_name, to_jsonb(old) ->> 'id'
        using errcode = 'OM409', hint = '최신 내용을 다시 불러온 뒤 고쳐 주세요';
    end if;
    new.rev := old.rev + 1;
  end if;
  new.updated_at := now();
  new.updated_by := coalesce(who, new.updated_by);
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['settings','accounts','plan_items','months','month_items','categories','spendings'] loop
    execute format('drop trigger if exists stamp on public.%I', t);
    execute format('create trigger stamp before insert or update on public.%I for each row execute function public.stamp_row()', t);
  end loop;
end $$;

-- ---------- 6. 바뀐 기록 (history) ----------
create table if not exists public.history (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  person text check (person in ('a', 'b')),
  table_name text not null,
  row_id text,
  op text not null check (op in ('insert', 'update', 'delete')),
  before jsonb,
  after jsonb
);
create index if not exists history_at on public.history (at desc);
create index if not exists history_row on public.history (table_name, row_id, at desc);

alter table public.history enable row level security;
drop policy if exists "members read history" on public.history;
create policy "members read history" on public.history for select to authenticated
  using ((select public.is_member()));
revoke all on public.history from anon, authenticated;
grant select on public.history to authenticated;

create or replace function public.log_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  o jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  n jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  b jsonb;
  a jsonb;
begin
  if tg_op = 'UPDATE' then
    select jsonb_object_agg(key, o -> key), jsonb_object_agg(key, value) into b, a
    from jsonb_each(n)
    where key <> all (array['rev', 'updated_at', 'updated_by']) and o -> key is distinct from value;
    if a is null then
      return null;
    end if;
  else
    b := o;
    a := n;
  end if;
  insert into public.history (person, table_name, row_id, op, before, after)
  values (public.current_person(), tg_table_name, coalesce(n ->> 'id', o ->> 'id'), lower(tg_op), b, a);
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array['settings','accounts','plan_items','months','month_items','categories','spendings','checks','users'] loop
    execute format('drop trigger if exists log_change on public.%I', t);
    execute format('create trigger log_change after insert or update or delete on public.%I for each row execute function public.log_change()', t);
  end loop;
end $$;

-- ========== 한도 · 한 번에 저장 · 대량 사고 방지 (migrations/005 와 같음) ==========
-- 충돌 오류 코드 OM409 는 위 stamp_row 에 들어 있다.

-- ---------- 2. 입력값 한도 ----------
-- 태그: 10개까지, 하나에 1~20자
create or replace function public.tags_ok(t text[]) returns boolean
language sql immutable parallel safe set search_path = public as $$
  select coalesce(cardinality(t), 0) <= 10
     and not exists (select 1 from unnest(t) x where x is null or char_length(x) not between 1 and 20);
$$;

-- 이미 한도를 넘은 줄이 있으면 마이그레이션을 멈추지 않고, 새로 쓰는 줄부터 적용한다 (NOT VALID)
do $$
declare c record;
begin
  for c in select * from (values
    -- 금액: 지출 1원~1억, 플랜·실제 낸 금액 0~10억, 수입·월급 0~10억, 목표 0~100억, 예산 0~1억
    ('spendings',   'spendings_amount_max',     'amount <= 100000000'),
    ('plan_items',  'plan_items_amount_range',  'amount between 0 and 1000000000'),
    ('plan_items',  'plan_items_goal_range',    'coalesce(goal_amount, 0) between 0 and 10000000000 and coalesce(goal_start, 0) between 0 and 10000000000'),
    ('month_items', 'month_items_amount_range', 'amount between 0 and 1000000000 and coalesce(paid_amount, 0) <= 1000000000'),
    ('months',      'months_income_range',      'income_a between 0 and 1000000000 and income_b between 0 and 1000000000 and extra_income between 0 and 1000000000'),
    ('settings',    'settings_salary_range',    'salary_a between 0 and 1000000000 and salary_b between 0 and 1000000000'),
    ('categories',  'categories_budget_range',  'budget between 0 and 100000000'),
    ('checks',      'checks_amount_range',      'abs(amount) <= 10000000000'),
    -- 글자 수: 이름 1~40자(분류 1~20자), 메모 200자, 노트 500자
    ('accounts',    'accounts_text_len',        'char_length(btrim(name)) between 1 and 40 and char_length(institution) <= 40 and char_length(note) <= 500'),
    ('plan_items',  'plan_items_text_len',      'char_length(btrim(name)) between 1 and 40 and char_length(note) <= 500'),
    ('month_items', 'month_items_text_len',     'char_length(btrim(name)) between 1 and 40 and char_length(note) <= 500'),
    ('months',      'months_text_len',          'char_length(extra_note) <= 200 and char_length(note) <= 500'),
    ('categories',  'categories_text_len',      'char_length(btrim(name)) between 1 and 20'),
    ('settings',    'settings_text_len',        'char_length(name_a) <= 20 and char_length(name_b) <= 20'),
    ('spendings',   'spendings_text_len',       'char_length(memo) <= 200 and public.tags_ok(tags)'),
    -- 형식: 달 YYYY-MM, 날짜 2000~2100년
    ('months',      'months_id_format',         'id ~ ''^[0-9]{4}-(0[1-9]|1[0-2])$'''),
    ('checks',      'checks_month_format',      'month ~ ''^[0-9]{4}-(0[1-9]|1[0-2])$'''),
    ('spendings',   'spendings_date_range',     'date between ''2000-01-01'' and ''2100-12-31''')
  ) as v(tbl, name, expr) loop
    if not exists (select 1 from pg_constraint where conname = c.name and conrelid = format('public.%I', c.tbl)::regclass) then
      execute format('alter table public.%I add constraint %I check (%s) not valid', c.tbl, c.name, c.expr);
    end if;
    begin
      execute format('alter table public.%I validate constraint %I', c.tbl, c.name);
    exception when check_violation then
      raise notice '%: 한도를 넘는 기존 줄이 있어 새로 쓰는 줄부터 적용합니다', c.name;
    end;
  end loop;
end $$;

-- ---------- 3. 대량 수정·삭제 막기 ----------
-- 앱 계정(authenticated)이 한 문장으로 200줄 넘게 고치거나 지우면 거절한다. SQL Editor(postgres)는 막지 않는다.
create or replace function public.guard_bulk() returns trigger
language plpgsql set search_path = public as $$
declare n bigint;
begin
  if current_user not in ('authenticated', 'anon') then
    return null;
  end if;
  if tg_op = 'DELETE' then
    select count(*) into n from old_rows;
  else
    select count(*) into n from new_rows;
  end if;
  if n > 200 then
    raise exception 'too many rows: % rows of % in one statement (limit 200)', n, tg_table_name
      using errcode = 'OM413', hint = '한 번에 200줄까지만 고치거나 지울 수 있어요';
  end if;
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array['settings','accounts','plan_items','months','month_items','checks','categories','spendings'] loop
    execute format('drop trigger if exists guard_bulk_delete on public.%I', t);
    execute format('create trigger guard_bulk_delete after delete on public.%I referencing old table as old_rows for each statement execute function public.guard_bulk()', t);
    execute format('drop trigger if exists guard_bulk_update on public.%I', t);
    execute format('create trigger guard_bulk_update after update on public.%I referencing new table as new_rows for each statement execute function public.guard_bulk()', t);
  end loop;
end $$;

-- ---------- 4. 여러 저장을 한 트랜잭션으로 ----------
-- ops = [{ "table": "months", "op": "upsert", "rows": [...], "ignore_duplicates": true },
--        { "table": "month_items", "op": "delete", "ids": ["..."] }, ...]
-- 하나라도 실패하면(충돌 OM409 포함) 전부 되돌린다. 부른 사람 권한(RLS)으로 실행한다.
-- 줄마다 보낸 칸만 쓴다 (PostgREST upsert 와 같다: 보내지 않은 칸은 기본값/기존 값, rev 를 보내면 충돌 확인).
-- 돌려주는 값: ops 와 같은 순서로 [{ "table", "rows": [저장된 줄] } | { "table", "deleted": n }]
create or replace function public.apply_batch(ops jsonb) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  writable constant text[] := array['settings','accounts','plan_items','months','month_items','checks','categories','spendings'];
  op jsonb;
  t text;
  r jsonb;
  saved jsonb;
  row_out jsonb;
  cols text;
  sets text;
  n bigint;
  out jsonb := '[]';
begin
  if jsonb_typeof(ops) is distinct from 'array' then
    raise exception 'ops must be an array' using errcode = '22023';
  end if;
  if (select coalesce(sum(coalesce(jsonb_array_length(o -> 'rows'), 0) + coalesce(jsonb_array_length(o -> 'ids'), 0)), 0)
        from jsonb_array_elements(ops) o) > 500 then
    raise exception 'too many rows in one batch (limit 500)' using errcode = 'OM413';
  end if;

  for op in select value from jsonb_array_elements(ops) loop
    t := op ->> 'table';
    if t is null or not (t = any (writable)) then
      raise exception 'table % is not writable', t using errcode = '42501';
    end if;

    if op ->> 'op' = 'delete' then
      if t = 'settings' then
        raise exception 'settings cannot be deleted' using errcode = '42501';
      end if;
      execute format('with d as (delete from public.%I where id = any ($1) returning 1) select count(*) from d', t)
        into n using array(select jsonb_array_elements_text(op -> 'ids'));
      out := out || jsonb_build_array(jsonb_build_object('table', t, 'deleted', n));

    elsif op ->> 'op' = 'upsert' then
      saved := '[]';
      -- id 순서로 잠근다: 두 폰이 같은 줄들을 다른 순서로 저장해도 교착(deadlock)이 나지 않게
      for r in select value from jsonb_array_elements(op -> 'rows') order by value ->> 'id' loop
        if jsonb_typeof(r) is distinct from 'object' or not (r ? 'id') then
          raise exception 'each row needs an id' using errcode = '22023';
        end if;
        select string_agg(format('%I', a.attname), ', ' order by a.attnum),
               string_agg(format('%1$I = excluded.%1$I', a.attname), ', ' order by a.attnum)
          into cols, sets
          from pg_attribute a
         where a.attrelid = format('public.%I', t)::regclass
           and a.attnum > 0 and not a.attisdropped
           and r ? a.attname;
        execute format(
          'insert into public.%1$I as x (%2$s) select %2$s from jsonb_populate_record(null::public.%1$I, $1) on conflict (id) do %3$s returning to_jsonb(x.*)',
          t, cols,
          case when coalesce((op ->> 'ignore_duplicates')::boolean, false) then 'nothing' else 'update set ' || sets end
        ) into row_out using r;
        -- 이미 있던 줄(ignore_duplicates)이나 내용이 같아 건너뛴 줄은 돌려주지 않는다
        if row_out is not null then
          saved := saved || jsonb_build_array(row_out);
        end if;
      end loop;
      out := out || jsonb_build_array(jsonb_build_object('table', t, 'rows', saved));

    else
      raise exception 'unknown op %', op ->> 'op' using errcode = '22023';
    end if;
  end loop;
  return out;
end $$;

revoke execute on function public.apply_batch(jsonb) from public, anon;
grant execute on function public.apply_batch(jsonb) to authenticated;

-- ---------- 5. 인덱스 ----------
-- 지출을 (날짜, id) 순서로 1000줄씩 이어 받는다. 예전 (date, created_at) 인덱스는 이것으로 대신한다
create index if not exists spendings_date_id on public.spendings (date desc, id desc);
drop index if exists public.spendings_date_created;

analyze public.spendings;

-- ========== 사람별 월급날 (migrations/006 와 같음) ==========
alter table public.settings
  add column if not exists payday_a int check (payday_a between 1 and 31),
  add column if not exists payday_b int check (payday_b between 1 and 31);

-- 처음 한 번만: 비어 있으면 예전 공통 월급날로 채운다 (SQL Editor 계정이라 rev·기록 트리거는 그대로 돈다)
update public.settings set payday_a = coalesce(payday_a, payday), payday_b = coalesce(payday_b, payday)
 where payday_a is null or payday_b is null;

alter table public.settings alter column payday_a set default 25, alter column payday_a set not null;
alter table public.settings alter column payday_b set default 25, alter column payday_b set not null;

comment on column public.settings.payday is '예전 공통 월급날 (v0.1 앱용). 새 앱은 payday_a / payday_b 를 쓴다';

-- ========== 보안 보강: 멤버를 계정에 묶기 · 권한 정리 (migrations/007 와 같음) ==========
-- 위의 is_member / current_person / ensure_user 를 계정(auth.uid) 기준으로 다시 정의한다.

-- ---------- 1. 멤버 ↔ 계정 ----------
alter table public.members add column if not exists user_id uuid unique references auth.users(id) on delete set null;

-- 이미 로그인해서 users 에 있는 계정으로 채운다
update public.members m set user_id = u.id
  from public.users u
 where u.email = m.email and u.person = m.person and m.user_id is null;

-- 이메일을 바꾸면(사람이 다른 구글 계정으로 바뀜) 묶인 계정을 푼다
create or replace function public.members_unbind() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.email is distinct from old.email then
    new.user_id := null;
  end if;
  return new;
end $$;
drop trigger if exists members_unbind on public.members;
create trigger members_unbind before update on public.members
  for each row execute function public.members_unbind();

-- 사람마다 한 줄
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'members_person_key') then
    if exists (select person from public.members group by person having count(*) > 1) then
      raise notice 'members 에 같은 사람이 두 줄 있어 unique(person) 를 걸지 않았어요 — 한 줄을 지운 뒤 다시 실행하세요';
    else
      alter table public.members add constraint members_person_key unique (person);
    end if;
  end if;
end $$;

-- 멤버 = 지금 로그인한 계정이 members 에 묶여 있다 (이메일 클레임이 아니라 계정 id 로 판단)
create or replace function public.is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.members where user_id = (select auth.uid()));
$$;

create or replace function public.current_person() returns text
language sql stable security definer set search_path = public as $$
  select person from public.members where user_id = (select auth.uid());
$$;

-- 로그인할 때: 아직 계정이 묶이지 않은 멤버면, 구글로 로그인했고 이메일이 확인된 계정만 묶는다.
-- 다른 계정이 이미 묶여 있으면 아무것도 하지 않는다 (같은 이메일의 다른 계정으로는 들어올 수 없다).
create or replace function public.ensure_user() returns public.users
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  mail text := lower(coalesce(auth.jwt() ->> 'email', ''));
  p text;
  bound uuid;
  inherited text;
  u public.users;
begin
  if uid is null or mail = '' then
    return null;
  end if;
  select person, user_id into p, bound from public.members where email = mail;
  if p is null then
    return null;
  end if;

  if bound is null then
    -- 토큰이 아니라 서버의 계정 기록(auth.users)으로 확인: 같은 이메일, 확인됨, 구글 로그인
    if not exists (
      select 1 from auth.users au
       where au.id = uid
         and lower(au.email) = mail
         and au.email_confirmed_at is not null
         and coalesce(au.raw_app_meta_data -> 'providers', '[]'::jsonb) ? 'google'
    ) then
      return null;
    end if;
    update public.members set user_id = uid where email = mail and user_id is null;
    if not found then
      return null;
    end if;
  elsif bound <> uid then
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

-- ---------- 2. 권한 ----------
-- 익명 키로는 아무 테이블도 읽고 쓰지 못한다 (RLS 앞에서 먼저 막는다)
revoke all on public.members, public.settings, public.accounts, public.plan_items, public.months,
  public.month_items, public.checks, public.categories, public.spendings from anon;
-- 로그인 사용자: 앱이 쓰는 select/insert/update/delete 만 (RLS 가 멤버인지 본다)
revoke truncate, trigger, references on public.settings, public.accounts, public.plan_items, public.months,
  public.month_items, public.checks, public.categories, public.spendings from authenticated;
-- members 는 SQL Editor 에서만 바꾼다
revoke all on public.members from authenticated;
grant select on public.members to authenticated;

-- 함수: RLS 가 쓰는 is_member 는 로그인 사용자만, 트리거 함수는 아무도 직접 부르지 않는다
revoke execute on function public.is_member() from public, anon;
grant execute on function public.is_member() to authenticated;
revoke execute on function public.current_person() from public, anon;
grant execute on function public.current_person() to authenticated;
revoke execute on function public.ensure_user() from public, anon;
grant execute on function public.ensure_user() to authenticated;
revoke execute on function public.log_change() from public, anon, authenticated;
revoke execute on function public.stamp_row() from public, anon, authenticated;
revoke execute on function public.guard_bulk() from public, anon, authenticated;
revoke execute on function public.touch_updated_at() from public, anon, authenticated;
revoke execute on function public.members_unbind() from public, anon, authenticated;

-- ---------- 3. rev 범위 (아주 큰 rev 를 넣어 이후 수정이 막히는 일 방지) ----------
do $$
declare t text;
begin
  foreach t in array array['settings','accounts','plan_items','months','month_items','categories','spendings'] loop
    if not exists (select 1 from pg_constraint where conname = t || '_rev_range' and conrelid = format('public.%I', t)::regclass) then
      execute format('alter table public.%I add constraint %I check (rev between 1 and 1000000000) not valid', t, t || '_rev_range');
    end if;
    begin
      execute format('alter table public.%I validate constraint %I', t, t || '_rev_range');
    exception when check_violation then
      raise notice '%_rev_range: 범위를 넘는 기존 줄이 있어 새로 쓰는 줄부터 적용합니다', t;
    end;
  end loop;
end $$;

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
-- 이메일은 소문자로 넣는다. 각자 구글로 처음 로그인하면 그 계정이 user_id 로 묶인다.
-- 계정을 바꿀 때: update public.members set email = '<새 구글 이메일>' where person = 'b';
-- 멤버에서 뺄 때: delete from public.members where person = 'b';
-- insert into public.members (email, person) values ('<a의 구글 이메일>', 'a');
-- insert into public.members (email, person) values ('<b의 구글 이메일>', 'b');
