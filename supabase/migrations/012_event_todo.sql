-- 012 일정을 할 일로 — 011 까지 실행한 프로젝트에 한 번 실행한다 (여러 번 실행해도 안전).
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 Run. 웹을 배포하기 전에 실행할 것 (앱이 todo 칸을 저장한다).
--
-- todo: 체크해서 끝내는 일정(예: 재산세 내기, 양도소득세 신고). 달력의 "이번 달 할 일"에 모인다.
-- 끝낸 기록은 이체·카드값처럼 checks 에 남긴다 (kind 'event', id `e:${month}:${일정 id}@${그 회차 시작일}`).
-- 반복 일정은 회차마다 따로 끝낸다.

alter table public.events add column if not exists todo boolean not null default false;

alter table public.checks drop constraint if exists checks_kind_check;
alter table public.checks add constraint checks_kind_check check (kind in ('transfer', 'card', 'settle', 'event'));
