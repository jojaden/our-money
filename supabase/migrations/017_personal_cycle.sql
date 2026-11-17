-- 017 사람마다 한 달 시작일 — 용돈·내 지출은 각자 월급날부터 다음 월급 전날까지로 센다.
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 Run. 여러 번 실행해도 안전하다.
-- 웹 앱을 배포하기 전에 먼저 실행한다. 실행 전에는 설정에 공동 기준만 보이고 나머지는 그대로 동작한다.

-- 공동 생활비·정산·플랜 달은 지금처럼 cycle_start 하나. 비워 두면(null) 그 사람도 공동 기준을 쓴다.
-- 1~28: 29~31일은 달마다 없는 날이 있어 한 달의 시작으로 쓸 수 없다(cycle_start 와 같은 범위).
alter table public.settings
  add column if not exists cycle_start_a int check (cycle_start_a between 1 and 28),
  add column if not exists cycle_start_b int check (cycle_start_b between 1 and 28);

comment on column public.settings.cycle_start_a is 'A 의 한 달 시작일 — 용돈·내 지출 기준 (비우면 cycle_start) (migrations/017)';
comment on column public.settings.cycle_start_b is 'B 의 한 달 시작일 — 용돈·내 지출 기준 (비우면 cycle_start) (migrations/017)';
