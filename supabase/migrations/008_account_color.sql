-- 008 지갑 카드 색 — 007 까지 실행한 프로젝트에 한 번 실행한다 (여러 번 실행해도 안전).
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 Run.
--
-- 지갑에서 카드 그림을 내 실물 카드와 비슷한 색 하나로 그릴 수 있게 한다(로고 없이 색만).
-- 비어 있으면 앱이 지금처럼 이번 달 쓴 버킷 색으로 그린다. 값은 앱의 색 이름(tokens.json 의 pass-*)만 받는다.
-- 실행하기 전에도 앱은 동작한다: 앱은 색을 고를 때만 이 칸을 보낸다(고르면 저장이 거절되니 먼저 실행할 것).

alter table public.accounts
  add column if not exists color text
    check (color in ('black', 'silver', 'gold', 'rose', 'red', 'green', 'blue', 'purple'));

comment on column public.accounts.color is '지갑 카드 그림 색(카드만). 비면 이번 달 쓴 버킷 색';
