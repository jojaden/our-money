-- 004 기록 남기기 · 충돌 막기 · 무결성 — 이미 schema.sql 을 실행한 프로젝트에 한 번 실행한다 (007 을 실행하기 전까지는 여러 번 실행해도 안전).
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 Run.
--
-- 1) 모든 줄에 누가·언제 만들고 고쳤는지 (created_by / updated_at / updated_by) — 트리거가 채우므로 앱이 속일 수 없다
-- 2) rev(버전) — 두 폰이 같은 줄을 동시에 고치면 늦게 온 쪽을 거절한다 (SQLSTATE 40001). 내용이 같은 수정은 건너뛴다
-- 3) history — 모든 추가·수정·삭제를 바뀐 칸만 남긴다 (나중에 "누가 언제 바꿨나", 되돌리기, 습관 통계에 쓴다)
-- 4) 앞으로 쓸 정보 칸: 지출 출처·태그·할부·카드 승인번호, 카드 끝 4자리, 항목 시작·끝 달, 실제 낸 금액, 달 메모·마감
-- 5) 외래키(계좌·플랜 항목) + 그 인덱스, 카드 알림 중복 기록을 막는 유니크 인덱스

-- 007 을 실행한 DB 에서는 멈춘다: 이 파일은 멤버 확인 함수를 예전 이메일 방식으로 다시 만든다
do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'members' and column_name = 'user_id') then
    raise exception '007 을 이미 실행한 DB 예요. 004 은 다시 실행하지 마세요 (멤버 확인이 이메일 방식으로 돌아가요)';
  end if;
end $$;

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
    -- 바뀐 내용이 없으면 쓰지 않는다 (rev·기록·실시간 알림이 늘지 않게)
    if (to_jsonb(new) - noise) = (to_jsonb(old) - noise) then
      return null;
    end if;
    -- 앱이 읽은 rev 와 지금 rev 가 다르면 그사이 다른 폰이 고친 것. rev 를 보내지 않으면 확인하지 않는다
    -- (upsert 에 rev: null 을 보내면 위 INSERT 쪽에서 1 이 되어 충돌로 거절된다 — 클라이언트는 null 칸을 보내지 않는다)
    if new.rev is not null and new.rev <> old.rev then
      raise exception 'conflict: % % was changed on another device', tg_table_name, to_jsonb(old) ->> 'id'
        using errcode = '40001', hint = '최신 내용을 다시 불러온 뒤 고쳐 주세요';
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

analyze public.spendings;
analyze public.month_items;
