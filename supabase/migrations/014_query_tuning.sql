-- 014 쿼리 다듬기 — 묶음 저장을 줄마다가 아니라 묶음으로, 쓰는 쿼리에 맞춘 인덱스.
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 Run. 여러 번 실행해도 안전하다. 005 를 실행한 DB 에서 실행한다.
-- 실행하기 전에도 앱은 그대로 동작한다(같은 함수 이름·같은 인자·같은 돌려주는 값).

-- ---------- 1. apply_batch: 줄마다 → 묶음으로 ----------
-- 전에는 줄마다 pg_attribute 에서 칸 목록을 찾고 SQL 을 새로 만들어 실행했다(500줄이면 500번).
-- 이제 보낸 칸이 같은 줄끼리 한 문장(insert … select from jsonb_populate_recordset … on conflict)으로 쓴다.
-- 앱은 늘 줄 전체를 보내므로 보통 표마다 한 문장이다. 지키는 것은 그대로:
--   · 보낸 칸만 쓴다(안 보낸 칸은 새 줄이면 기본값, 있던 줄이면 그대로)
--   · 묶음 안에서는 id 순서로 잠근다(교착 방지). 칸 구성이 다른 줄이 섞이면 구성별로 id 순서
--   · 한 문장은 200줄까지(guard_bulk 한도와 같다) — 넘으면 200줄씩 나눠 보낸다
--   · 내용이 같아 건너뛴 줄·ignore_duplicates 로 건너뛴 줄은 돌려주지 않는다(stamp_row 가 null 을 돌려준다)
--   · 하나라도 실패하면(충돌 OM409 포함) 전부 되돌린다
-- 바뀐 것: 한 op 안에 같은 id 가 두 번 있으면 거절한다(22023). 전에는 두 번째 줄이 rev 충돌로 막혔다.
-- 고친 것: events 를 쓸 수 있는 표에 넣었다(011 에서 빠져 일정이 든 묶음 저장이 42501 로 거절됐다).
create or replace function public.apply_batch(ops jsonb) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  writable constant text[] := array['settings','accounts','plan_items','months','month_items','checks','categories','spendings','events'];
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

revoke execute on function public.apply_batch(jsonb) from public, anon;
grant execute on function public.apply_batch(jsonb) to authenticated;

-- ---------- 2. 인덱스: 앱이 실제로 보내는 쿼리에 맞춘다 ----------
-- 할부: 불러온 기간 앞 5년 안에 산 할부(installment_months > 1)를 (date, id) 순서로 이어 받는다.
-- 전에는 5년치 지출을 날짜 인덱스로 다 훑고 할부만 골랐다. 할부만 담은 작은 인덱스로 바로 찾는다.
create index if not exists spendings_installments on public.spendings (date desc, id desc) where installment_months > 1;

-- 계좌·카드를 지우면 외래키(on delete set null)가 month_items 의 account_id·card_id 를 찾아 비운다.
-- month_items 는 달마다 쌓여서 인덱스가 없으면 계좌 하나 지울 때마다 표 전체를 훑는다.
-- (plan_items·accounts·settings 는 수십 줄이라 두지 않는다)
create index if not exists month_items_account on public.month_items (account_id) where account_id is not null;
create index if not exists month_items_card on public.month_items (card_id) where card_id is not null;

-- 바뀐 기록은 id(쌓인 순서) 로만 읽는다(history_pkey). at 인덱스는 쓰이지 않고 모든 저장마다 한 번 더 쓰기만 한다.
drop index if exists public.history_at;

-- ---------- 3. 통계 갱신 ----------
analyze public.spendings, public.month_items, public.history;
