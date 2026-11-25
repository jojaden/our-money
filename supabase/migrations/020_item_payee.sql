-- 020 받는 곳 — 고정비(월세·관리비·보험 등)가 어디로 보내지는지 적어 둔다.
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 Run. 여러 번 실행해도 안전하다.
-- 웹 앱을 배포하기 전에 먼저 실행한다: 실행 전에 저장하면 받는 곳 칸이 말없이 빠진 채 저장된다 (apply_batch 는 없는 칸을 버린다).

-- 받는 곳은 둘 중 하나다: 지갑의 내 통장(to_account_id, 내 다른 통장으로 보낼 때) 또는 글(to_name, 받는 사람·은행·계좌번호).
-- 화면에 보여 주기만 하고 이체·체크 계산(account_id 기준)에는 쓰지 않는다.
alter table public.plan_items add column if not exists to_account_id text;
alter table public.plan_items add column if not exists to_name text not null default '';
alter table public.month_items add column if not exists to_account_id text;
alter table public.month_items add column if not exists to_name text not null default '';

alter table public.plan_items drop constraint if exists plan_items_to_account_fk;
alter table public.plan_items add constraint plan_items_to_account_fk foreign key (to_account_id) references public.accounts(id) on delete set null;
alter table public.month_items drop constraint if exists month_items_to_account_fk;
alter table public.month_items add constraint month_items_to_account_fk foreign key (to_account_id) references public.accounts(id) on delete set null;

alter table public.plan_items drop constraint if exists plan_items_to_name_len;
alter table public.plan_items add constraint plan_items_to_name_len check (char_length(to_name) <= 60);
alter table public.month_items drop constraint if exists month_items_to_name_len;
alter table public.month_items add constraint month_items_to_name_len check (char_length(to_name) <= 60);

-- 통장을 지우면 외래키가 month_items 를 찾아 비운다 (달마다 쌓이므로 인덱스)
create index if not exists month_items_to_account on public.month_items (to_account_id) where to_account_id is not null;

comment on column public.plan_items.to_account_id is '받는 곳: 지갑의 내 통장 (migrations/020). 화면에만 보이고 이체 계산에는 쓰지 않는다';
comment on column public.plan_items.to_name is '받는 곳: 받는 사람·은행·계좌번호 글 (migrations/020)';
comment on column public.month_items.to_account_id is '받는 곳: 지갑의 내 통장 (migrations/020). 화면에만 보이고 이체 계산에는 쓰지 않는다';
comment on column public.month_items.to_name is '받는 곳: 받는 사람·은행·계좌번호 글 (migrations/020)';
