-- 016 공동 항목 나눠 내기 — 공동 항목을 사람마다 다른 금액·나가는 곳으로 나눈다 (예: 공동 생활비 70만 = 현빈 40만 + 예진 30만).
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 Run. 여러 번 실행해도 안전하다. 004·005 를 실행한 DB 에서 실행한다.
-- 웹 앱을 배포하기 전에 먼저 실행한다: 실행 전에 "나눠 내기"를 저장하면 묶음 칸이 빠진 채 저장돼 두 사람 몫이 개인 항목 두 개로 따로 보인다.
-- 나눠 내기를 쓰지 않는 항목은 실행 전에도 그대로 동작한다.

-- 나눠 낸 항목은 두 줄이다: payer 가 a 인 줄과 b 인 줄이 같은 pair_id 를 가진다.
-- 줄마다 자기 금액·방식·계좌·카드·납부 확인을 따로 가지므로 이체·카드값·체크는 개인 항목처럼 계산되고,
-- 화면만 두 줄을 공동 항목 하나로 묶어 보여 준다. 묶인 줄은 사람 몫이라 payer 가 joint 일 수 없다.
alter table public.plan_items add column if not exists pair_id text;
alter table public.month_items add column if not exists pair_id text;

alter table public.plan_items drop constraint if exists plan_items_pair_shape;
alter table public.plan_items add constraint plan_items_pair_shape
  check (pair_id is null or (char_length(pair_id) between 1 and 40 and payer in ('a', 'b')));
alter table public.month_items drop constraint if exists month_items_pair_shape;
alter table public.month_items add constraint month_items_pair_shape
  check (pair_id is null or (char_length(pair_id) between 1 and 40 and payer in ('a', 'b')));

comment on column public.plan_items.pair_id is '공동 항목을 나눠 낼 때 두 사람 몫(payer a·b) 두 줄을 묶는 값 (migrations/016)';
comment on column public.month_items.pair_id is '공동 항목을 나눠 낼 때 두 사람 몫(payer a·b) 두 줄을 묶는 값 (migrations/016)';
