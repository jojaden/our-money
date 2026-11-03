-- 005 한도 · 한 번에 저장 · 대량 사고 방지 — 004 를 실행한 프로젝트에 한 번 실행한다 (여러 번 실행해도 안전).
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 Run.
--
-- 1) 충돌 오류 코드 40001 → OM409. 40001 은 Postgres 가 "다시 시도하면 되는 오류"에 쓰는 코드라
--    앱이 자동 재시도할 오류(40001·40P01·네트워크)와 사람이 다시 봐야 하는 충돌을 나눈다.
-- 2) 입력값 한도 (CHECK): 금액 상한·음수 금지, 글자 수, 태그 수, 날짜·달 형식
-- 3) 한 문장에 200줄 넘게 지우거나 고치면 거절 (WHERE 빠진 UPDATE/DELETE 사고 방지, 앱 계정에만)
-- 4) apply_batch(ops): 여러 테이블 저장을 한 트랜잭션으로 (새 달 시작, 항목 저장·빼기가 반쪽으로 끝나지 않게)
-- 5) 지출 (date desc, id desc) 인덱스 — 1000줄씩 이어 받기(keyset)와 내보내기 정렬에 쓴다

-- ---------- 1. 충돌 오류 코드 ----------
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
