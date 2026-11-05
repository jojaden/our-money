-- 010 지출 확인 표시 — 009 까지 실행한 프로젝트에 한 번 실행한다 (여러 번 실행해도 안전).
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 Run.
--
-- 카드 알림으로 자동 기록한 지출은 확실하지 않은 칸을 비워 두고, 무엇을 확인해야 하는지 여기에 남긴다.
-- 사람이 앱에서 고쳐 저장하면 앱이 비운다.
--   card        어느 카드인지 못 정함 (알림에 카드 끝 4자리가 없거나 맞는 카드가 없음)
--   category    분류
--   owner       누구 돈인지 (공동·각자 용돈)
--   installment 할부 개월 (알림에 일시불·할부가 없음)
--   merchant    가게 이름
--   duplicate   같은 결제가 두 번 기록됐을 수 있음
--   canceled    승인 취소 알림이 왔는데 원래 기록을 확실히 못 찾음
-- 실행하기 전에도 웹 앱은 동작한다 (이 칸을 보내지 않으므로). 안드로이드 카드 알림 기록은 이 칸이 있어야 저장된다.

alter table public.spendings add column if not exists review text[] not null default '{}';

alter table public.spendings drop constraint if exists spendings_review_ok;
alter table public.spendings add constraint spendings_review_ok
  check (review <@ array['card', 'category', 'owner', 'installment', 'merchant', 'duplicate', 'canceled']::text[]);

-- "확인 필요" 기록을 빨리 찾게 (확인할 것이 있는 줄만)
create index if not exists spendings_review on public.spendings (date desc) where review <> '{}';

comment on column public.spendings.review is '자동 기록에서 확인이 필요한 칸 (card·category·owner·installment·merchant·duplicate·canceled). 사람이 고쳐 저장하면 비운다';
