-- 002 성능 개선 — 이미 schema.sql 을 실행한 프로젝트에 한 번 실행한다 (007 을 실행하기 전까지는 여러 번 실행해도 안전).
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 Run.

-- 007 을 실행한 DB 에서는 멈춘다: 이 파일은 멤버 확인 함수를 예전 이메일 방식으로 다시 만든다
do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'members' and column_name = 'user_id') then
    raise exception '007 을 이미 실행한 DB 예요. 002 은 다시 실행하지 마세요 (멤버 확인이 이메일 방식으로 돌아가요)';
  end if;
end $$;

-- 1) 멤버 이메일을 소문자로 저장해서, 확인할 때 기본키(email) 인덱스를 그대로 쓴다.
update public.members set email = lower(email) where email <> lower(email);
alter table public.members drop constraint if exists members_email_lower;
alter table public.members add constraint members_email_lower check (email = lower(email));

-- 2) is_member(): lower(email) = … (인덱스 못 탐) → email = lower(…) (기본키 인덱스 사용)
create or replace function public.is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.members
    where email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

-- 3) RLS: 함수를 (select …) 로 감싸면 Postgres 가 쿼리당 한 번만 계산한다 (initPlan).
--    감싸지 않으면 행마다 다시 실행된다.
do $$
declare t text;
begin
  foreach t in array array['settings','accounts','plan_items','months','month_items','checks','categories','spendings'] loop
    execute format('drop policy if exists "members only" on public.%I', t);
    execute format(
      'create policy "members only" on public.%I for all to authenticated using ((select public.is_member())) with check ((select public.is_member()))',
      t
    );
  end loop;
end $$;

drop policy if exists "members read members" on public.members;
create policy "members read members" on public.members for select to authenticated
  using (email = lower(coalesce((select auth.jwt()) ->> 'email', '')) or (select public.is_member()));

-- 4) 지출은 기간(date >= ?)으로 불러온다. 정렬(최근 순)까지 인덱스로 처리하도록 복합 인덱스로 바꾼다.
drop index if exists public.spendings_date;
create index if not exists spendings_date_created on public.spendings (date desc, created_at desc);

-- 5) 통계 갱신
analyze public.members, public.spendings, public.month_items, public.checks;
