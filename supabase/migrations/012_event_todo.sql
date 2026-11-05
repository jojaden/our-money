-- 012 일정을 할 일로 + 시간 — 011 까지 실행한 프로젝트에 한 번 실행한다 (여러 번 실행해도 안전).
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 Run. 웹을 배포하기 전에 실행할 것 (앱이 todo·시간 칸을 저장한다).
--
-- todo: 체크해서 끝내는 일정(예: 재산세 내기, 양도소득세 신고). 달력의 "이번 달 할 일"에 모인다.
-- 끝낸 기록은 이체·카드값처럼 checks 에 남긴다 (kind 'event', id `e:${month}:${일정 id}@${그 회차 시작일}`).
-- 반복 일정은 회차마다 따로 끝낸다.

alter table public.events add column if not exists todo boolean not null default false;

alter table public.checks drop constraint if exists checks_kind_check;
alter table public.checks add constraint checks_kind_check check (kind in ('transfer', 'card', 'settle', 'event'));

-- start_time / end_time: 'HH:MM' (24시간). 비면 하루 종일. 제목에 "오후 7시부터"처럼 적으면 앱이 떼어서 여기에 넣는다.
--   기간 일정이면 시작 시간은 첫날, 끝 시간은 끝 날. 끝 시간만 있으면 "그때까지".
alter table public.events add column if not exists start_time text;
alter table public.events add column if not exists end_time text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'events_time_ok' and conrelid = 'public.events'::regclass) then
    alter table public.events add constraint events_time_ok check (
      (start_time is null or start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
      and (end_time is null or end_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
    );
  end if;
end $$;
