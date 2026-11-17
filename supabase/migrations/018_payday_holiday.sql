-- 018 공휴일 월급날 — 월급날이 공휴일이면 앞 영업일에 받는지 사람마다 고른다.
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 Run. 여러 번 실행해도 안전하다.
-- 웹 앱을 배포하기 전에 먼저 실행한다. 실행 전에는 설정에 스위치가 안 보이고, 두 사람 모두 "공휴일이면 앞 영업일"로 본다.

-- true(기본): 주말·공휴일이면 그 전 영업일에 들어온다. false: 공휴일엔 그날 들어오고, 주말만 앞 금요일.
-- 공휴일 표는 앱 안에 있다(apps/web/src/lib/holidays.ts, core calc/Holidays.kt).
alter table public.settings
  add column if not exists payday_holiday_a boolean not null default true,
  add column if not exists payday_holiday_b boolean not null default true;

comment on column public.settings.payday_holiday_a is 'A 의 월급날이 공휴일이면 앞 영업일에 들어오는가 (migrations/018)';
comment on column public.settings.payday_holiday_b is 'B 의 월급날이 공휴일이면 앞 영업일에 들어오는가 (migrations/018)';
