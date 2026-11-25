-- 우리 집 가계부 — Supabase 스키마 (새로 설치할 때)
--
-- 새 Supabase 프로젝트의 SQL Editor 에 전체를 붙여넣고 한 번 실행한다.
-- 이미 쓰고 있는 DB 는 이 파일을 다시 돌리지 말고 supabase/migrations/ 의 새 파일만 번호 순서대로 실행한다
-- (CHANGELOG 의 "DB 이전" 줄). 이 파일은 migrations 020 까지 반영한 최종 모양이다(칸 순서는 운영 DB 와 다를 수 있다).
-- 마지막의 members INSERT 두 줄은 두 사람의 구글 이메일로 바꿔서 실행한다.
--
-- 차례
--   1. 멤버와 로그인 계정   members · users · is_member() · current_person() · ensure_user()
--   2. 데이터 표           accounts · settings · plan_items · months · month_items · checks · categories · spendings · events · nudges
--   3. 바뀐 기록           history
--   4. 줄마다 붙는 트리거    stamp_row(rev·누가 언제) · log_change(기록) · guard_bulk(대량 사고 방지)
--   5. 한 번에 저장         apply_batch()
--   6. 접근 제어           RLS · 권한
--   7. 실시간 · 기본 분류 · 두 사람 등록
--
-- 공통 규칙
--   · 데이터 표에는 rev · created_at/by · updated_at/by 가 있다. 트리거가 채우므로 앱이 직접 쓰지 않는다.
--   · 한도·형식 CHECK 의 이름(… _range, … _text_len, … _ok)은 migrations 가 이름으로 찾으므로 바꾸지 않는다.
--   · 분류(category_id)는 외래키를 걸지 않는다: 분류를 지우고 "되돌리기"하면 기존 지출이 다시 그 분류로 돌아와야 해서.

-- ============================================================
-- 1. 멤버와 로그인 계정
-- ============================================================

-- 들어올 수 있는 이메일과 a/b. 처음 구글로 로그인하면 그 계정이 user_id 로 묶인다 (SQL Editor 에서만 바꾼다)
create table public.members (
  email text primary key check (email = lower(email)),
  person text not null check (person in ('a', 'b')),
  user_id uuid unique references auth.users(id) on delete set null,
  constraint members_person_key unique (person)
);

-- 실제로 로그인한 계정. 이름은 본인만 바꾼다. 앱이 로그인할 때 ensure_user() 를 부른다.
-- settings.name_a / name_b 는 아직 로그인하지 않은 사람의 이름(기본값)으로만 쓴다.
create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique check (email = lower(email)),
  person text not null unique check (person in ('a', 'b')),
  name text not null default '' check (char_length(name) <= 20),
  card_order jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint users_card_order_shape check (jsonb_typeof(card_order) = 'object' and pg_column_size(card_order) <= 4096)
);
comment on column public.users.card_order is '폰·태블릿에서 꾹 눌러 옮긴 화면별 카드 순서 (home·plan·check·ledger → 카드 이름 배열)';

-- 멤버 = 지금 로그인한 계정이 members 에 묶여 있다 (이메일 클레임이 아니라 계정 id 로 판단). RLS 에서 쓴다
create or replace function public.is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.members where user_id = (select auth.uid()));
$$;

-- 로그인한 사람(a/b)
create or replace function public.current_person() returns text
language sql stable security definer set search_path = public as $$
  select person from public.members where user_id = (select auth.uid());
$$;

-- 로그인할 때: 아직 계정이 묶이지 않은 멤버면, 구글로 로그인했고 이메일이 확인된 계정만 묶는다.
-- 다른 계정이 이미 묶여 있으면 아무것도 하지 않는다 (같은 이메일의 다른 계정으로는 들어올 수 없다).
-- users 줄은 처음 만들 때 이름을 (같은 사람의 예전 계정 이름) > settings 의 이름 > 이메일 앞부분 순으로 정한다.
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
    -- 토큰이 아니라 서버의 계정 기록으로 확인: 같은 이메일, 확인됨, 그리고 그 이메일의 구글 계정(auth.identities)이 붙어 있다
    -- (대표 이메일과 "구글로 로그인한 적 있음"만 보면, 다른 로그인 방식으로 만든 계정에 구글을 이어 붙였을 때 구분하지 못한다)
    if not exists (
      select 1 from auth.users au
        join auth.identities i on i.user_id = au.id and i.provider = 'google'
       where au.id = uid
         and lower(au.email) = mail
         and au.email_confirmed_at is not null
         and lower(i.identity_data ->> 'email') = mail
         -- 비밀번호도, 구글 말고 다른 로그인 방식도 없다: 남이 먼저 이메일로 가입해 둔 계정에 구글이 이어 붙은 것을 거른다 (013)
         and coalesce(au.encrypted_password, '') = ''
         and not exists (select 1 from auth.identities o where o.user_id = au.id and o.provider <> 'google')
    ) then
      return null;
    end if;
    -- 같은 계정이 동시에 두 번 부르면(앱 시작 때) 늦은 쪽은 이미 자기에게 묶인 줄을 본다 → 그것도 성공
    update public.members set user_id = uid where email = mail and (user_id is null or user_id = uid);
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

-- 이메일을 바꾸면(사람이 다른 구글 계정으로 바뀜) 묶인 계정을 푼다
create or replace function public.members_unbind() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.email is distinct from old.email then
    new.user_id := null;
  end if;
  return new;
end $$;
create trigger members_unbind before update on public.members
  for each row execute function public.members_unbind();

create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end $$;
create trigger users_touch before update on public.users
  for each row execute function public.touch_updated_at();

-- ============================================================
-- 2. 데이터 표
-- 한도: 지출 1원~1억, 플랜·실제 낸 금액 0~10억, 수입·월급 0~10억, 목표·일정 금액 0~100억, 예산 0~1억,
--       이름 1~40자(분류 1~20자), 메모 200자, 노트 500자, 달 YYYY-MM, 날짜 2000~2100년, rev 1~10억
-- 앱 입력의 한도(components/ui.tsx 의 MAX_SPENDING · MAX_AMOUNT · MAX_GOAL)와 맞춘다.
-- ============================================================

-- ---------- 계좌·카드 ----------
create table public.accounts (
  id text primary key,
  name text not null,
  kind text not null check (kind in ('bank', 'card')),
  owner text not null check (owner in ('a', 'b', 'joint')),
  institution text not null default '',
  billing_account_id text constraint accounts_billing_fk references public.accounts(id) on delete set null,
  pay_day int check (pay_day between 1 and 31),
  last4 text check (last4 ~ '^[0-9]{4}$'),
  color text check (color in ('black', 'silver', 'gold', 'rose', 'red', 'green', 'blue', 'purple')),
  note text not null default '',
  sort int not null default 0,
  archived boolean not null default false,
  rev integer not null default 1,
  created_at timestamptz not null default now(),
  created_by text check (created_by in ('a', 'b')),
  updated_at timestamptz not null default now(),
  updated_by text check (updated_by in ('a', 'b')),
  constraint accounts_text_len check (char_length(btrim(name)) between 1 and 40 and char_length(institution) <= 40 and char_length(note) <= 500),
  constraint accounts_rev_range check (rev between 1 and 1000000000)
);
comment on column public.accounts.color is '지갑 카드 그림 색(카드만). 비면 이번 달 쓴 버킷 색';

-- ---------- 설정 (한 줄) ----------
create table public.settings (
  id int primary key default 1 check (id = 1),
  name_a text not null default '',
  name_b text not null default '',
  salary_a bigint not null default 0,
  salary_b bigint not null default 0,
  salary_account_a text constraint settings_salary_a_fk references public.accounts(id) on delete set null,
  salary_account_b text constraint settings_salary_b_fk references public.accounts(id) on delete set null,
  split_mode text not null default 'fixed' check (split_mode in ('fixed', 'income')),
  ratio_a int not null default 50 check (ratio_a between 0 and 100),
  -- 한 달 시작일: 공동 기준과 사람마다(용돈·내 지출, 비우면 공동 기준)
  cycle_start int not null default 1 check (cycle_start between 1 and 28),
  cycle_start_a int check (cycle_start_a between 1 and 28),
  cycle_start_b int check (cycle_start_b between 1 and 28),
  -- 월급날: 사람마다, 공휴일이면 앞 영업일로 당길지 (주말은 늘 앞 금요일)
  payday int not null default 25 check (payday between 1 and 31),
  payday_a int not null default 25 check (payday_a between 1 and 31),
  payday_b int not null default 25 check (payday_b between 1 and 31),
  payday_holiday_a boolean not null default true,
  payday_holiday_b boolean not null default true,
  rev integer not null default 1,
  created_at timestamptz not null default now(),
  created_by text check (created_by in ('a', 'b')),
  updated_at timestamptz not null default now(),
  updated_by text check (updated_by in ('a', 'b')),
  constraint settings_salary_range check (salary_a between 0 and 1000000000 and salary_b between 0 and 1000000000),
  constraint settings_text_len check (char_length(name_a) <= 20 and char_length(name_b) <= 20),
  constraint settings_rev_range check (rev between 1 and 1000000000)
);
comment on column public.settings.payday is '예전 공통 월급날 (v0.1 앱용). 새 앱은 payday_a / payday_b 를 쓴다';
comment on column public.settings.cycle_start_a is 'A 의 한 달 시작일 — 용돈·내 지출 기준 (비우면 cycle_start) (migrations/017)';
comment on column public.settings.cycle_start_b is 'B 의 한 달 시작일 — 용돈·내 지출 기준 (비우면 cycle_start) (migrations/017)';
comment on column public.settings.payday_holiday_a is 'A 의 월급날이 공휴일이면 앞 영업일에 들어오는가 (migrations/018)';
comment on column public.settings.payday_holiday_b is 'B 의 월급날이 공휴일이면 앞 영업일에 들어오는가 (migrations/018)';
insert into public.settings (id) values (1);

-- ---------- 반복 플랜 항목 (템플릿) ----------
-- 나눠 낸 공동 항목은 payer a 줄과 b 줄이 같은 pair_id 를 가진다. 화면은 두 줄을 공동 항목 하나로 묶어 보여 준다.
create table public.plan_items (
  id text primary key,
  "group" text not null check ("group" in ('fixed', 'living', 'allowance', 'saving')),
  name text not null,
  amount bigint not null default 0,
  payer text not null check (payer in ('a', 'b', 'joint')),
  pair_id text,
  account_id text constraint plan_items_account_fk references public.accounts(id) on delete set null,
  method text not null check (method in ('card_auto', 'account_auto', 'manual', 'cash')),
  card_id text constraint plan_items_card_fk references public.accounts(id) on delete set null,
  -- 받는 곳: 내 통장이거나 글 (화면에만, 이체 계산에는 쓰지 않는다)
  to_account_id text constraint plan_items_to_account_fk references public.accounts(id) on delete set null,
  to_name text not null default '',
  due_day int check (due_day between 1 and 31),
  start_month text check (start_month ~ '^[0-9]{4}-[0-9]{2}$'),
  end_month text check (end_month ~ '^[0-9]{4}-[0-9]{2}$'),
  goal_amount bigint,
  goal_start bigint,
  sort int not null default 0,
  note text not null default '',
  active boolean not null default true,
  rev integer not null default 1,
  created_at timestamptz not null default now(),
  created_by text check (created_by in ('a', 'b')),
  updated_at timestamptz not null default now(),
  updated_by text check (updated_by in ('a', 'b')),
  constraint plan_items_amount_range check (amount between 0 and 1000000000),
  constraint plan_items_goal_range check (coalesce(goal_amount, 0) between 0 and 10000000000 and coalesce(goal_start, 0) between 0 and 10000000000),
  constraint plan_items_text_len check (char_length(btrim(name)) between 1 and 40 and char_length(note) <= 500),
  constraint plan_items_pair_shape check (pair_id is null or (char_length(pair_id) between 1 and 40 and payer in ('a', 'b'))),
  constraint plan_items_to_name_len check (char_length(to_name) <= 60),
  constraint plan_items_rev_range check (rev between 1 and 1000000000)
);
comment on column public.plan_items.pair_id is '공동 항목을 나눠 낼 때 두 사람 몫(payer a·b) 두 줄을 묶는 값 (migrations/016)';
comment on column public.plan_items.to_account_id is '받는 곳: 지갑의 내 통장 (migrations/020). 화면에만 보이고 이체 계산에는 쓰지 않는다';
comment on column public.plan_items.to_name is '받는 곳: 받는 사람·은행·계좌번호 글 (migrations/020)';

-- ---------- 월 ----------
create table public.months (
  id text primary key,                       -- YYYY-MM
  income_a bigint not null default 0,
  income_b bigint not null default 0,
  extra_income bigint not null default 0,
  extra_note text not null default '',
  note text not null default '',
  closed_at timestamptz,
  rev integer not null default 1,
  created_at timestamptz not null default now(),
  created_by text check (created_by in ('a', 'b')),
  updated_at timestamptz not null default now(),
  updated_by text check (updated_by in ('a', 'b')),
  constraint months_id_format check (id ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  constraint months_income_range check (income_a between 0 and 1000000000 and income_b between 0 and 1000000000 and extra_income between 0 and 1000000000),
  constraint months_text_len check (char_length(extra_note) <= 200 and char_length(note) <= 500),
  constraint months_rev_range check (rev between 1 and 1000000000)
);

-- 그달에 고정된 플랜 항목
create table public.month_items (
  id text primary key,                       -- `${month}:${plan_item_id}`
  month text not null references public.months(id) on delete cascade,
  plan_item_id text constraint month_items_plan_fk references public.plan_items(id) on delete set null,
  "group" text not null check ("group" in ('fixed', 'living', 'allowance', 'saving')),
  name text not null,
  amount bigint not null default 0,
  payer text not null check (payer in ('a', 'b', 'joint')),
  pair_id text,
  account_id text constraint month_items_account_fk references public.accounts(id) on delete set null,
  method text not null check (method in ('card_auto', 'account_auto', 'manual', 'cash')),
  card_id text constraint month_items_card_fk references public.accounts(id) on delete set null,
  to_account_id text constraint month_items_to_account_fk references public.accounts(id) on delete set null,
  to_name text not null default '',
  due_day int check (due_day between 1 and 31),
  sort int not null default 0,
  note text not null default '',
  paid boolean not null default false,
  paid_amount bigint check (paid_amount >= 0),
  paid_at timestamptz,
  paid_by text check (paid_by in ('a', 'b')),
  rev integer not null default 1,
  created_at timestamptz not null default now(),
  created_by text check (created_by in ('a', 'b')),
  updated_at timestamptz not null default now(),
  updated_by text check (updated_by in ('a', 'b')),
  constraint month_items_amount_range check (amount between 0 and 1000000000 and coalesce(paid_amount, 0) <= 1000000000),
  constraint month_items_text_len check (char_length(btrim(name)) between 1 and 40 and char_length(note) <= 500),
  constraint month_items_pair_shape check (pair_id is null or (char_length(pair_id) between 1 and 40 and payer in ('a', 'b'))),
  constraint month_items_to_name_len check (char_length(to_name) <= 60),
  constraint month_items_rev_range check (rev between 1 and 1000000000)
);
comment on column public.month_items.pair_id is '공동 항목을 나눠 낼 때 두 사람 몫(payer a·b) 두 줄을 묶는 값 (migrations/016)';
comment on column public.month_items.to_account_id is '받는 곳: 지갑의 내 통장 (migrations/020). 화면에만 보이고 이체 계산에는 쓰지 않는다';
comment on column public.month_items.to_name is '받는 곳: 받는 사람·은행·계좌번호 글 (migrations/020)';
create index month_items_month on public.month_items (month);
create index month_items_plan on public.month_items (plan_item_id) where plan_item_id is not null;
-- 계좌·카드를 지우면 외래키(on delete set null)가 month_items 를 찾아 비운다. 달마다 쌓이므로 인덱스를 둔다
-- (plan_items·accounts·settings 는 수십 줄이라 두지 않는다)
create index month_items_account on public.month_items (account_id) where account_id is not null;
create index month_items_card on public.month_items (card_id) where card_id is not null;
create index month_items_to_account on public.month_items (to_account_id) where to_account_id is not null;

-- ---------- 이체·카드값·정산·할 일 완료 체크 ----------
-- 할 일(events.todo)을 끝낸 기록은 kind 'event' 로 회차마다 따로 남는다
create table public.checks (
  id text primary key,
  month text not null,
  kind text not null check (kind in ('transfer', 'card', 'settle', 'event')),
  amount bigint not null default 0,
  done_at timestamptz not null default now(),
  done_by text not null check (done_by in ('a', 'b')),
  constraint checks_amount_range check (abs(amount) <= 10000000000),
  constraint checks_month_format check (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
);
create index checks_month on public.checks (month);

-- ---------- 생활비 분류 ----------
create table public.categories (
  id text primary key,
  name text not null,
  budget bigint not null default 0,
  sort int not null default 0,
  rev integer not null default 1,
  created_at timestamptz not null default now(),
  created_by text check (created_by in ('a', 'b')),
  updated_at timestamptz not null default now(),
  updated_by text check (updated_by in ('a', 'b')),
  constraint categories_budget_range check (budget between 0 and 100000000),
  constraint categories_text_len check (char_length(btrim(name)) between 1 and 20),
  constraint categories_rev_range check (rev between 1 and 1000000000)
);

-- ---------- 지출 ----------
-- 태그: 10개까지, 하나에 1~20자
create or replace function public.tags_ok(t text[]) returns boolean
language sql immutable parallel safe set search_path = public as $$
  select coalesce(cardinality(t), 0) <= 10
     and not exists (select 1 from unnest(t) x where x is null or char_length(x) not between 1 and 20);
$$;

create table public.spendings (
  id text primary key,
  date date not null,
  amount bigint not null check (amount > 0),
  category_id text,
  pay_kind text not null check (pay_kind in ('card', 'cash', 'transfer')),
  account_id text constraint spendings_account_fk references public.accounts(id) on delete set null,
  owner text not null check (owner in ('a', 'b', 'joint')),
  paid_by text not null check (paid_by in ('a', 'b')),
  memo text not null default '',
  tags text[] not null default '{}',
  installment_months smallint not null default 1 check (installment_months between 1 and 60),
  -- 카드 알림 자동 기록: 어디서 왔는지, 승인번호, 확실하지 않아 확인이 필요한 칸
  source text not null default 'manual' check (source in ('manual', 'preset', 'notification', 'import')),
  approval_no text check (char_length(approval_no) <= 40),
  review text[] not null default '{}',
  rev integer not null default 1,
  created_at timestamptz not null default now(),
  created_by text check (created_by in ('a', 'b')),
  updated_at timestamptz not null default now(),
  updated_by text check (updated_by in ('a', 'b')),
  constraint spendings_amount_max check (amount <= 100000000),
  constraint spendings_date_range check (date between '2000-01-01' and '2100-12-31'),
  constraint spendings_text_len check (char_length(memo) <= 200 and public.tags_ok(tags)),
  constraint spendings_review_ok check (review <@ array['card', 'category', 'owner', 'installment', 'merchant', 'duplicate', 'canceled']::text[]),
  constraint spendings_rev_range check (rev between 1 and 1000000000)
);
comment on column public.spendings.review is '자동 기록에서 확인이 필요한 칸 (card·category·owner·installment·merchant·duplicate·canceled). 사람이 고쳐 저장하면 비운다';
-- 지출은 (날짜, id) 순서로 1000줄씩 이어 받는다 (keyset, OFFSET 없음)
create index spendings_date_id on public.spendings (date desc, id desc);
create index spendings_account on public.spendings (account_id, date desc) where account_id is not null;
create index spendings_category on public.spendings (category_id, date desc) where category_id is not null;
-- 할부: 불러온 기간 앞 5년 안에 산 할부만 담은 작은 인덱스
create index spendings_installments on public.spendings (date desc, id desc) where installment_months > 1;
create index spendings_review on public.spendings (date desc) where review <> '{}';
-- 카드 알림으로 자동 기록할 때 같은 승인 건이 두 번 들어가지 않게
create unique index spendings_approval on public.spendings (account_id, date, approval_no) where approval_no is not null;

-- ---------- 달력 일정 ----------
-- 하루·기간, 시간('HH:MM', 비면 하루 종일), 반복, D-day, 알림 모음 고정, 미리 알림, 할 일(체크해서 끝냄)
create table public.events (
  id text primary key,
  title text not null,
  note text not null default '',
  start_date date not null,
  end_date date,
  start_time text,
  end_time text,
  repeat text not null default 'none',
  owner text not null default 'joint',
  dday boolean not null default false,
  pin boolean not null default false,
  todo boolean not null default false,
  remind_days smallint,
  amount bigint,
  rev integer not null default 1,
  created_at timestamptz not null default now(),
  created_by text check (created_by in ('a', 'b')),
  updated_at timestamptz not null default now(),
  updated_by text check (updated_by in ('a', 'b')),
  constraint events_ok check (
    char_length(btrim(title)) between 1 and 40
    and char_length(note) <= 500
    and (end_date is null or end_date >= start_date)
    and start_date between '2000-01-01' and '2100-12-31'
    and repeat in ('none', 'monthly', 'yearly')
    and owner in ('joint', 'a', 'b')
    and (remind_days is null or remind_days between 0 and 60)
    and (amount is null or amount between 0 and 10000000000)
    and rev between 1 and 1000000000
  ),
  constraint events_time_ok check (
    (start_time is null or start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
    and (end_time is null or end_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
  )
);
comment on table public.events is '달력 일정 — 하루·기간, 반복(none·monthly·yearly), D-day, 알림 모음 고정, 미리 알림 며칠 전';
create index events_start on public.events (start_date);

-- ---------- 콕 찌르기 ----------
-- 한 사람이 상대에게 남기는 짧은 알림. 보내는 사람은 created_by(stamp), 자기에게는 못 보낸다.
create table public.nudges (
  id text primary key,
  to_person text not null,
  month text not null,
  title text not null,
  rev integer not null default 1,
  created_at timestamptz not null default now(),
  created_by text check (created_by in ('a', 'b')),
  updated_at timestamptz not null default now(),
  updated_by text check (updated_by in ('a', 'b')),
  constraint nudges_ok check (
    char_length(id) between 1 and 40
    and to_person in ('a', 'b')
    and created_by is distinct from to_person
    and month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
    and char_length(btrim(title)) between 1 and 80
    and rev between 1 and 1000000000
  )
);
comment on table public.nudges is '콕 찌르기 — 한 사람이 상대에게 남기는 짧은 알림(아직 안 옮긴 돈 등). 받는 사람 종 알림·토스트 (migrations/019)';

-- ============================================================
-- 3. 바뀐 기록 (history) — 트리거만 쓰고, 두 사람은 읽기만 한다
-- ============================================================
create table public.history (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  person text check (person in ('a', 'b')),
  table_name text not null,
  row_id text,
  op text not null check (op in ('insert', 'update', 'delete')),
  before jsonb,
  after jsonb
);
-- 앱은 id(쌓인 순서)로 읽는다(history_pkey). 이 인덱스는 줄 하나의 기록을 찾을 때
create index history_row on public.history (table_name, row_id, at desc);

-- ============================================================
-- 4. 줄마다 붙는 트리거
-- ============================================================

-- ---------- 만든·고친 사람과 시각, rev 확인 ----------
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

-- ---------- 바뀐 칸을 history 에 ----------
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
    -- card_order(카드 순서)만 바뀌면 남기지 않는다 (migrations/015)
    where key <> all (array['rev', 'updated_at', 'updated_by', 'card_order']) and o -> key is distinct from value;
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

-- ---------- 대량 수정·삭제 막기 ----------
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

-- ---------- 트리거 붙이기 (표 목록이 셋 다 다르다) ----------
-- stamp:      rev 가 있는 데이터 표 (checks 는 rev 가 없고, users 는 users_touch 를 쓴다)
-- log_change: 데이터 표 + checks + users
-- guard_bulk: 데이터 표 + checks (users 는 한 사람이 자기 줄만 고친다)
do $$
declare t text;
begin
  foreach t in array array['settings','accounts','plan_items','months','month_items','categories','spendings','events','nudges'] loop
    execute format('create trigger stamp before insert or update on public.%I for each row execute function public.stamp_row()', t);
  end loop;
  foreach t in array array['settings','accounts','plan_items','months','month_items','categories','spendings','checks','users','events','nudges'] loop
    execute format('create trigger log_change after insert or update or delete on public.%I for each row execute function public.log_change()', t);
  end loop;
  foreach t in array array['settings','accounts','plan_items','months','month_items','checks','categories','spendings','events','nudges'] loop
    execute format('create trigger guard_bulk_delete after delete on public.%I referencing old table as old_rows for each statement execute function public.guard_bulk()', t);
    execute format('create trigger guard_bulk_update after update on public.%I referencing new table as new_rows for each statement execute function public.guard_bulk()', t);
  end loop;
end $$;

-- ============================================================
-- 5. 여러 저장을 한 트랜잭션으로 (apply_batch)
-- ============================================================
-- ops = [{ "table": "months", "op": "upsert", "rows": [...], "ignore_duplicates": true },
--        { "table": "month_items", "op": "delete", "ids": ["..."] }, ...]
-- 돌려주는 값: ops 와 같은 순서로 [{ "table", "rows": [저장된 줄] } | { "table", "deleted": n }]
-- 부른 사람 권한(RLS)으로 실행한다. 지키는 것:
--   · 보낸 칸만 쓴다(안 보낸 칸은 새 줄이면 기본값, 있던 줄이면 그대로). rev 를 보내면 충돌 확인
--   · 보낸 칸이 같은 줄끼리 한 문장(insert … select from jsonb_populate_recordset … on conflict)으로 쓴다
--   · id 순서로 잠근다(두 폰이 같은 줄들을 다른 순서로 저장해도 교착이 나지 않게). 칸 구성이 다른 줄이 섞이면 구성별로 id 순서
--   · 한 묶음 500줄까지, 한 문장은 200줄까지(guard_bulk 한도와 같다) — 넘으면 200줄씩 나눠 보낸다
--   · 한 op 안에 같은 id 가 두 번 있으면 거절한다(22023)
--   · 내용이 같아 건너뛴 줄·ignore_duplicates 로 건너뛴 줄은 돌려주지 않는다(stamp_row 가 null 을 돌려준다)
--   · 하나라도 실패하면(충돌 OM409 포함) 전부 되돌린다
create or replace function public.apply_batch(ops jsonb) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  -- 019 에서 nudges 를 더했다
  writable constant text[] := array['settings','accounts','plan_items','months','month_items','checks','categories','spendings','events','nudges'];
  chunk constant int := 200;
  op jsonb;
  t text;
  n bigint;
  grp record;
  part jsonb;
  cols text;
  sets text;
  got jsonb;
  saved jsonb;
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
      if jsonb_typeof(op -> 'rows') is distinct from 'array' then
        raise exception 'rows must be an array' using errcode = '22023';
      end if;
      if exists (select 1 from jsonb_array_elements(op -> 'rows') r
                  where jsonb_typeof(r) is distinct from 'object' or not (r ? 'id')) then
        raise exception 'each row needs an id' using errcode = '22023';
      end if;
      if (select count(*) <> count(distinct r ->> 'id') from jsonb_array_elements(op -> 'rows') r) then
        raise exception 'same id twice in one % upsert', t using errcode = '22023';
      end if;

      saved := '[]';
      -- 보낸 칸 구성이 같은 줄끼리 (칸 목록은 구성마다 한 번만 찾는다)
      for grp in
        select k.keys, jsonb_agg(r order by r ->> 'id') as rows
          from jsonb_array_elements(op -> 'rows') r
          cross join lateral (select array_agg(key order by key) as keys from jsonb_object_keys(r) key) k
         group by k.keys
         order by min(r ->> 'id')
      loop
        select string_agg(format('%I', a.attname), ', ' order by a.attnum),
               string_agg(format('%1$I = excluded.%1$I', a.attname), ', ' order by a.attnum)
          into cols, sets
          from pg_attribute a
         where a.attrelid = format('public.%I', t)::regclass
           and a.attnum > 0 and not a.attisdropped
           and a.attname = any (grp.keys);
        -- 200줄씩, id 순서대로
        for part in
          select jsonb_agg(e.value order by e.ord)
            from jsonb_array_elements(grp.rows) with ordinality e(value, ord)
           group by (e.ord - 1) / chunk
           order by min(e.ord)
        loop
          execute format(
            'with w as (insert into public.%1$I as x (%2$s) select %2$s from jsonb_populate_recordset(null::public.%1$I, $1) order by id '
            'on conflict (id) do %3$s returning to_jsonb(x.*) as j) select coalesce(jsonb_agg(j), ''[]''::jsonb) from w',
            t, cols,
            case when coalesce((op ->> 'ignore_duplicates')::boolean, false) then 'nothing' else 'update set ' || sets end
          ) into got using part;
          saved := saved || got;
        end loop;
      end loop;
      out := out || jsonb_build_array(jsonb_build_object('table', t, 'rows', saved));

    else
      raise exception 'unknown op %', op ->> 'op' using errcode = '22023';
    end if;
  end loop;
  return out;
end $$;

-- ============================================================
-- 6. 접근 제어: 두 사람만
-- 익명 키(anon)는 어떤 표도 읽고 쓰지 못한다(RLS 앞에서 먼저 막는다). 새 표를 더할 때도 revoke all … from anon.
-- ============================================================

-- ---------- 데이터 표: 멤버면 읽고 쓰기 ----------
do $$
declare t text;
begin
  foreach t in array array['settings','accounts','plan_items','months','month_items','checks','categories','spendings','events','nudges'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "members only" on public.%I for all to authenticated using ((select public.is_member())) with check ((select public.is_member()))', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('revoke truncate, trigger, references on public.%I from authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;
-- settings 는 지우지 않는다
revoke delete on public.settings from authenticated;

-- ---------- members: 읽기만. 토큰 이메일로는 아직 계정이 묶이지 않은 자기 줄만 ----------
alter table public.members enable row level security;
create policy "members read members" on public.members for select to authenticated
  using (
    user_id = (select auth.uid())
    or (user_id is null and email = lower(coalesce((select auth.jwt()) ->> 'email', '')))
    or (select public.is_member())
  );
revoke all on public.members from anon, authenticated;
grant select on public.members to authenticated;

-- ---------- users: 두 사람 모두 서로의 이름을 읽고, 바꾸는 건 자기 줄의 name·card_order 만 ----------
alter table public.users enable row level security;
create policy "members read users" on public.users for select to authenticated
  using ((select public.is_member()));
create policy "update own name" on public.users for update to authenticated
  using (id = (select auth.uid()) and (select public.is_member()))
  with check (id = (select auth.uid()));
revoke all on public.users from anon, authenticated;
grant select on public.users to authenticated;
grant update (name, card_order) on public.users to authenticated;

-- ---------- history: 읽기만 ----------
alter table public.history enable row level security;
create policy "members read history" on public.history for select to authenticated
  using ((select public.is_member()));
revoke all on public.history from anon, authenticated;
grant select on public.history to authenticated;

-- ---------- 함수: 앱이 부르는 것은 로그인 사용자만, 트리거 함수는 아무도 직접 부르지 않는다 ----------
revoke execute on function public.is_member() from public, anon;
grant execute on function public.is_member() to authenticated;
revoke execute on function public.current_person() from public, anon;
grant execute on function public.current_person() to authenticated;
revoke execute on function public.ensure_user() from public, anon;
grant execute on function public.ensure_user() to authenticated;
revoke execute on function public.apply_batch(jsonb) from public, anon;
grant execute on function public.apply_batch(jsonb) to authenticated;
revoke execute on function public.stamp_row() from public, anon, authenticated;
revoke execute on function public.log_change() from public, anon, authenticated;
revoke execute on function public.guard_bulk() from public, anon, authenticated;
revoke execute on function public.touch_updated_at() from public, anon, authenticated;
revoke execute on function public.members_unbind() from public, anon, authenticated;

-- ============================================================
-- 7. 실시간 · 기본 분류 · 두 사람 등록
-- ============================================================

-- 다른 폰에서 바꾸면 바로 (members·history 는 넣지 않는다)
alter publication supabase_realtime add table
  public.settings, public.accounts, public.plan_items, public.months, public.month_items,
  public.checks, public.categories, public.spendings, public.users, public.events, public.nudges;

-- 기본 분류
insert into public.categories (id, name, budget, sort) values
  ('cat-grocery', '장보기', 0, 1),
  ('cat-eatout', '외식·배달', 0, 2),
  ('cat-cafe', '카페·간식', 0, 3),
  ('cat-home', '생활용품', 0, 4),
  ('cat-car', '교통·차량', 0, 5),
  ('cat-health', '병원·약', 0, 6),
  ('cat-event', '경조사', 0, 7),
  ('cat-fun', '문화·여가', 0, 8),
  ('cat-etc', '기타', 0, 9);

-- 두 사람 등록 (이메일을 바꿔서 실행)
-- 이메일은 소문자로 넣는다. 각자 구글로 처음 로그인하면 그 계정이 user_id 로 묶인다.
-- 계정을 바꿀 때: update public.members set email = '<새 구글 이메일>' where person = 'b';
-- 멤버에서 뺄 때: delete from public.members where person = 'b';
-- insert into public.members (email, person) values ('<a의 구글 이메일>', 'a');
-- insert into public.members (email, person) values ('<b의 구글 이메일>', 'b');
