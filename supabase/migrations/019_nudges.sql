-- 019 콕 찌르기 — 018 까지 실행한 프로젝트에 한 번 실행한다 (여러 번 실행해도 안전).
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 Run. 웹을 배포하기 전에 실행할 것 (앱이 이 표를 불러오고 실시간으로 지켜본다).
-- 실행하기 전에도 앱은 그대로 동작한다(표가 없으면 빈 목록, 콕 찌르기 저장만 거절된다).
--
-- 한 사람이 상대에게 "아직 안 옮긴 돈" 같은 짧은 알림을 남긴다. 받는 사람의 종 알림 모음과 토스트에 뜬다.
--   to_person: 받는 사람 (보내는 사람은 stamp 가 채우는 created_by — 자기에게는 못 보낸다)
--   month: 어느 가계부 달의 일인지 'YYYY-MM'.  title: 보이는 글 (80자까지)
-- 다른 표와 같게: 멤버만(RLS), 익명 키는 아무것도, rev·누가 언제(stamp), 바뀐 기록(history), 대량 사고 막기, 실시간.
-- apply_batch 가 쓸 수 있는 표에 nudges 를 더한다(014 의 함수와 같고 표 목록만 다르다).

create table if not exists public.nudges (
  id text primary key,
  to_person text not null,
  month text not null,
  title text not null,
  rev integer not null default 1,
  created_at timestamptz not null default now(),
  created_by text check (created_by in ('a', 'b')),
  updated_at timestamptz not null default now(),
  updated_by text check (updated_by in ('a', 'b'))
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'nudges_ok' and conrelid = 'public.nudges'::regclass) then
    alter table public.nudges add constraint nudges_ok check (
      char_length(id) between 1 and 40
      and to_person in ('a', 'b')
      and created_by is distinct from to_person
      and month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
      and char_length(btrim(title)) between 1 and 80
      and rev between 1 and 1000000000
    );
  end if;
end $$;

create index if not exists nudges_created on public.nudges (created_at);

-- 접근: 멤버만, 익명 키는 아무것도
alter table public.nudges enable row level security;
drop policy if exists "members only" on public.nudges;
create policy "members only" on public.nudges for all to authenticated
  using ((select public.is_member())) with check ((select public.is_member()));
revoke all on public.nudges from anon;
revoke truncate, trigger, references on public.nudges from authenticated;
grant select, insert, update, delete on public.nudges to authenticated;

-- rev·누가 언제 / 바뀐 기록 / 한 번에 너무 많이 고치거나 지우기 막기
drop trigger if exists stamp on public.nudges;
create trigger stamp before insert or update on public.nudges for each row execute function public.stamp_row();
drop trigger if exists log_change on public.nudges;
create trigger log_change after insert or update or delete on public.nudges for each row execute function public.log_change();
drop trigger if exists guard_bulk_delete on public.nudges;
create trigger guard_bulk_delete after delete on public.nudges referencing old table as old_rows for each statement execute function public.guard_bulk();
drop trigger if exists guard_bulk_update on public.nudges;
create trigger guard_bulk_update after update on public.nudges referencing new table as new_rows for each statement execute function public.guard_bulk();

-- 실시간 (상대가 보내면 바로)
do $$
begin
  alter publication supabase_realtime add table public.nudges;
exception when duplicate_object then null;
end $$;

comment on table public.nudges is '콕 찌르기 — 한 사람이 상대에게 남기는 짧은 알림(아직 안 옮긴 돈 등). 받는 사람 종 알림·토스트 (migrations/019)';

-- ---------- apply_batch: 쓸 수 있는 표에 nudges ----------
create or replace function public.apply_batch(ops jsonb) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
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

revoke execute on function public.apply_batch(jsonb) from public, anon;
grant execute on function public.apply_batch(jsonb) to authenticated;
