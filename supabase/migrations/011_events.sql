-- 011 일정 (달력·D-day·알림 모음) — 010 까지 실행한 프로젝트에 한 번 실행한다 (여러 번 실행해도 안전).
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 Run. 웹을 배포하기 전에 실행할 것 (앱이 이 표를 불러오고 실시간으로 지켜본다).
--
-- 재산세·종합소득세·양도소득세 신고 기간, 기념일처럼 가계부 바깥의 날짜를 적는다.
--   하루 일정: start_date 만.  기간 일정(예: 5월 한 달 신고 기간): start_date ~ end_date (끝 날 포함)
--   반복: none / monthly(매달 같은 날) / yearly(매년 같은 날). 1년에 두 번이면 매년 일정 두 개로 적는다.
--   dday: D-day 를 센다.  pin: 기간 동안 알림 모음(종) 맨 위에 고정한다.
--   remind_days: 며칠 전에 폰 알림을 줄지 (비면 없음, 0 = 당일).  amount: 낼 돈(선택).
-- 다른 표와 같게: 멤버만(RLS), 익명 키는 아무것도, rev·누가 언제(stamp), 바뀐 기록(history), 대량 사고 막기, 실시간.

create table if not exists public.events (
  id text primary key,
  title text not null,
  note text not null default '',
  start_date date not null,
  end_date date,
  repeat text not null default 'none',
  owner text not null default 'joint',
  dday boolean not null default false,
  pin boolean not null default false,
  remind_days smallint,
  amount bigint,
  rev integer not null default 1,
  created_at timestamptz not null default now(),
  created_by text check (created_by in ('a', 'b')),
  updated_at timestamptz not null default now(),
  updated_by text check (updated_by in ('a', 'b'))
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'events_ok' and conrelid = 'public.events'::regclass) then
    alter table public.events add constraint events_ok check (
      char_length(btrim(title)) between 1 and 40
      and char_length(note) <= 500
      and (end_date is null or end_date >= start_date)
      and start_date between '2000-01-01' and '2100-12-31'
      and repeat in ('none', 'monthly', 'yearly')
      and owner in ('joint', 'a', 'b')
      and (remind_days is null or remind_days between 0 and 60)
      and (amount is null or amount between 0 and 10000000000)
      and rev between 1 and 1000000000
    );
  end if;
end $$;

create index if not exists events_start on public.events (start_date);

-- 접근: 멤버만, 익명 키는 아무것도
alter table public.events enable row level security;
drop policy if exists "members only" on public.events;
create policy "members only" on public.events for all to authenticated
  using ((select public.is_member())) with check ((select public.is_member()));
revoke all on public.events from anon;
revoke truncate, trigger, references on public.events from authenticated;
grant select, insert, update, delete on public.events to authenticated;

-- rev·누가 언제 / 바뀐 기록 / 한 번에 너무 많이 고치거나 지우기 막기
drop trigger if exists stamp on public.events;
create trigger stamp before insert or update on public.events for each row execute function public.stamp_row();
drop trigger if exists log_change on public.events;
create trigger log_change after insert or update or delete on public.events for each row execute function public.log_change();
drop trigger if exists guard_bulk_delete on public.events;
create trigger guard_bulk_delete after delete on public.events referencing old table as old_rows for each statement execute function public.guard_bulk();
drop trigger if exists guard_bulk_update on public.events;
create trigger guard_bulk_update after update on public.events referencing new table as new_rows for each statement execute function public.guard_bulk();

-- 실시간 (다른 폰에서 바꾸면 바로)
do $$
begin
  alter publication supabase_realtime add table public.events;
exception when duplicate_object then null;
end $$;

comment on table public.events is '달력 일정 — 하루·기간, 반복(none·monthly·yearly), D-day, 알림 모음 고정, 미리 알림 며칠 전';
