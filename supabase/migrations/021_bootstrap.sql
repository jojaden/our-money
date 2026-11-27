-- 021 앱 시작 한 번에 — 계정 묶기(ensure_user)와 달력 첫 화면 데이터를 서버 왕복 한 번으로.
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 Run. 여러 번 실행해도 안전하다.
-- 웹 앱을 배포하기 전에 먼저 실행한다: 함수가 없어도 앱은 예전처럼 members 확인 + ensure_user 로 열리지만,
-- bootstrap 을 한 번 물어보는 만큼 처음 열 때 서버 왕복이 하나 더 든다.

-- 멤버가 아니면 null. 멤버면 { person, settings, users, events, checks } — 달력 첫 화면에 그리는 표만.
-- calendar = false 면 표는 빼고 person 만 (이 기기 저장본으로 이미 그린 뒤의 확인).
-- security invoker: 표는 부른 사람의 RLS 로 읽는다. ensure_user() 가 같은 트랜잭션에서 계정을 묶은 뒤라 처음 로그인에도 보인다.
create or replace function public.bootstrap(calendar boolean default true) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  u public.users;
begin
  select * into u from public.ensure_user();
  if u.id is null then
    return null;
  end if;
  if not calendar then
    return jsonb_build_object('person', u.person);
  end if;
  return jsonb_build_object(
    'person', u.person,
    'settings', (select to_jsonb(s) from public.settings s where s.id = 1),
    'users', coalesce((select jsonb_agg(to_jsonb(x) order by x.id) from public.users x), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(to_jsonb(x) order by x.id) from public.events x), '[]'::jsonb),
    'checks', coalesce((select jsonb_agg(to_jsonb(x) order by x.id) from public.checks x), '[]'::jsonb)
  );
end $$;

revoke execute on function public.bootstrap(boolean) from public, anon;
grant execute on function public.bootstrap(boolean) to authenticated;
