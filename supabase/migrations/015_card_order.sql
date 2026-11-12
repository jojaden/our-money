-- 015 카드 순서 — 홈·플랜·체크·가계부 카드를 꾹 눌러 옮긴 순서를 사람마다(로그인한 계정 줄에) 남긴다.
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 Run. 여러 번 실행해도 안전하다. 003(users)·004(log_change) 를 실행한 DB 에서 실행한다.
-- 실행하기 전에도 앱은 동작한다: 옮긴 순서를 이 기기에만 남긴다.

-- ---------- 1. users.card_order ----------
-- 모양: {"home": ["todo", "living", …], "plan": […], "check": […], "ledger": […]}. 화면마다 카드 이름의 순서.
-- 앱이 모르는 이름은 무시하고 빠진 카드는 기본 자리에 넣으므로 모양만 지킨다(객체, 4KB 까지).
alter table public.users add column if not exists card_order jsonb not null default '{}'::jsonb;
alter table public.users drop constraint if exists users_card_order_shape;
alter table public.users add constraint users_card_order_shape
  check (jsonb_typeof(card_order) = 'object' and pg_column_size(card_order) <= 4096);

-- 본인 줄만 바꾼다(정책 "update own name" 이 id = auth.uid() 로 막는다). 칸 권한은 name 과 card_order 만
grant update (card_order) on public.users to authenticated;

-- ---------- 2. 기록: 카드 순서만 바뀌면 남기지 않는다 ----------
-- 순서를 옮길 때마다 바뀐 기록에 쌓이면 돈에 관한 기록이 묻힌다. 다른 칸과 함께 바뀌면 그 칸만 남긴다.
create or replace function public.log_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  o jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  n jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  b jsonb;
  a jsonb;
begin
  if tg_op = 'UPDATE' then
    select jsonb_object_agg(key, o -> key), jsonb_object_agg(key, value) into b, a
    from jsonb_each(n)
    where key <> all (array['rev', 'updated_at', 'updated_by', 'card_order']) and o -> key is distinct from value;
    if a is null then
      return null;
    end if;
  else
    b := o;
    a := n;
  end if;
  insert into public.history (person, table_name, row_id, op, before, after)
  values (public.current_person(), tg_table_name, coalesce(n ->> 'id', o ->> 'id'), lower(tg_op), b, a);
  return null;
end $$;
revoke execute on function public.log_change() from public, anon, authenticated;

comment on column public.users.card_order is '폰·태블릿에서 꾹 눌러 옮긴 화면별 카드 순서 (home·plan·check·ledger → 카드 이름 배열)';
