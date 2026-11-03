-- 006 사람별 월급날 — 005 를 실행한 프로젝트에 한 번 실행한다 (여러 번 실행해도 안전).
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 Run.
--
-- 두 사람의 월급날이 달라서, 각자 월급날에 맞춰 자기 월급에서 옮길 돈을 체크한다.
-- payday_a / payday_b 를 더하고 지금의 payday 값으로 채운다. payday 는 예전 앱을 위해 남겨 둔다(새 앱은 쓰지 않음).
-- 31일처럼 그달에 없는 날은 앱이 그달 마지막 날로 본다.

alter table public.settings
  add column if not exists payday_a int check (payday_a between 1 and 31),
  add column if not exists payday_b int check (payday_b between 1 and 31);

-- 처음 한 번만: 비어 있으면 예전 공통 월급날로 채운다 (SQL Editor 계정이라 rev·기록 트리거는 그대로 돈다)
update public.settings set payday_a = coalesce(payday_a, payday), payday_b = coalesce(payday_b, payday)
 where payday_a is null or payday_b is null;

alter table public.settings alter column payday_a set default 25, alter column payday_a set not null;
alter table public.settings alter column payday_b set default 25, alter column payday_b set not null;

comment on column public.settings.payday is '예전 공통 월급날 (v0.1 앱용). 새 앱은 payday_a / payday_b 를 쓴다';
