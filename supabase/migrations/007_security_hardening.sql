-- 007 보안 보강 — 006 을 실행한 프로젝트에 한 번 실행한다 (여러 번 실행해도 안전).
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 Run.
--
-- 보안 점검(security-audit run-1)에서 나온 것:
-- 1) 멤버를 로그인 계정(auth.uid)에 묶는다. 지금까지는 로그인 토큰의 "이메일"만 보고 멤버로 인정해서,
--    Supabase 에 구글 말고 다른 로그인 방식(이메일 가입 등)이 켜지면 남이 같은 이메일로 들어올 수 있었다.
--    이제 members.user_id 가 그 사람의 계정이고, 처음 묶을 때는 "구글로 로그인했고 이메일이 확인된 계정"만 묶인다.
--    이미 로그인해 둔 계정(users)은 마이그레이션이 바로 묶는다.
-- 2) 익명(anon) 키로는 어떤 테이블도 못 보게 기본 권한을 거둔다 (실시간 DELETE 알림 경로도 같이 막힌다).
--    로그인 사용자에게서도 쓰지 않는 TRUNCATE·TRIGGER·REFERENCES 를 거둔다. members 는 읽기만.
-- 3) is_member() 와 트리거 함수의 실행 권한 정리, members.person 은 사람마다 한 줄(unique), rev 범위 확인.
--
-- 사람(계정)을 바꿀 때: update public.members set email = '<새 구글 이메일>' where person = 'b';
--   (email 을 바꾸면 user_id 가 비워져서, 새 계정이 처음 로그인할 때 다시 묶인다)
-- 멤버에서 뺄 때: delete from public.members where person = 'b';  (auth.users 만 지우면 만료 전 토큰이 남는다)

-- ---------- 1. 멤버 ↔ 계정 ----------
alter table public.members add column if not exists user_id uuid unique references auth.users(id) on delete set null;

-- 이미 로그인해서 users 에 있는 계정으로 채운다 (ensure_user 와 같은 조건: 이메일이 확인됐고 같은 이메일의 구글 계정, 비밀번호·다른 로그인 방식 없음)
update public.members m set user_id = u.id
  from public.users u
  join auth.users au on au.id = u.id and au.email_confirmed_at is not null
 where u.email = m.email and u.person = m.person and m.user_id is null
   and exists (select 1 from auth.identities i
                where i.user_id = u.id and i.provider = 'google' and lower(i.identity_data ->> 'email') = m.email)
   and coalesce(au.encrypted_password, '') = ''
   and not exists (select 1 from auth.identities o where o.user_id = u.id and o.provider <> 'google');

-- 이메일을 바꾸면(사람이 다른 구글 계정으로 바뀜) 묶인 계정을 푼다
create or replace function public.members_unbind() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.email is distinct from old.email then
    new.user_id := null;
  end if;
  return new;
end $$;
drop trigger if exists members_unbind on public.members;
create trigger members_unbind before update on public.members
  for each row execute function public.members_unbind();

-- 사람마다 한 줄
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'members_person_key') then
    if exists (select person from public.members group by person having count(*) > 1) then
      raise notice 'members 에 같은 사람이 두 줄 있어 unique(person) 를 걸지 않았어요 — 한 줄을 지운 뒤 다시 실행하세요';
    else
      alter table public.members add constraint members_person_key unique (person);
    end if;
  end if;
end $$;

-- 멤버 = 지금 로그인한 계정이 members 에 묶여 있다 (이메일 클레임이 아니라 계정 id 로 판단)
create or replace function public.is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.members where user_id = (select auth.uid()));
$$;

create or replace function public.current_person() returns text
language sql stable security definer set search_path = public as $$
  select person from public.members where user_id = (select auth.uid());
$$;

-- 로그인할 때: 아직 계정이 묶이지 않은 멤버면, 구글로 로그인했고 이메일이 확인된 계정만 묶는다.
-- 다른 계정이 이미 묶여 있으면 아무것도 하지 않는다 (같은 이메일의 다른 계정으로는 들어올 수 없다).
create or replace function public.ensure_user() returns public.users
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  mail text := lower(coalesce(auth.jwt() ->> 'email', ''));
  p text;
  bound uuid;
  inherited text;
  u public.users;
begin
  if uid is null or mail = '' then
    return null;
  end if;
  select person, user_id into p, bound from public.members where email = mail;
  if p is null then
    return null;
  end if;

  if bound is null then
    -- 토큰이 아니라 서버의 계정 기록으로 확인: 같은 이메일, 확인됨, 그리고 그 이메일의 구글 계정(auth.identities)이 붙어 있다
    -- (대표 이메일과 "구글로 로그인한 적 있음"만 보면, 다른 로그인 방식으로 만든 계정에 구글을 이어 붙였을 때 구분하지 못한다)
    if not exists (
      select 1 from auth.users au
        join auth.identities i on i.user_id = au.id and i.provider = 'google'
       where au.id = uid
         and lower(au.email) = mail
         and au.email_confirmed_at is not null
         and lower(i.identity_data ->> 'email') = mail
         -- 비밀번호도, 구글 말고 다른 로그인 방식도 없다: 남이 먼저 이메일로 가입해 둔 계정에 구글이 이어 붙은 것을 거른다 (013)
         and coalesce(au.encrypted_password, '') = ''
         and not exists (select 1 from auth.identities o where o.user_id = au.id and o.provider <> 'google')
    ) then
      return null;
    end if;
    -- 같은 계정이 동시에 두 번 부르면(앱 시작 때) 늦은 쪽은 이미 자기에게 묶인 줄을 본다 → 그것도 성공
    update public.members set user_id = uid where email = mail and (user_id is null or user_id = uid);
    if not found then
      return null;
    end if;
  elsif bound <> uid then
    return null;
  end if;

  select * into u from public.users where id = uid;
  if found then
    if u.email <> mail or u.person <> p then
      delete from public.users where (person = p or email = mail) and id <> uid;
      update public.users set email = mail, person = p where id = uid returning * into u;
    end if;
    return u;
  end if;

  -- 같은 사람이 다른 구글 계정으로 바뀐 경우: 예전 줄의 이름을 이어받고 지운다
  select nullif(name, '') into inherited from public.users where person = p;
  delete from public.users where person = p or email = mail;
  if inherited is null then
    select nullif(case p when 'a' then name_a else name_b end, '') into inherited from public.settings where id = 1;
  end if;

  insert into public.users (id, email, person, name)
  values (uid, mail, p, left(coalesce(inherited, split_part(mail, '@', 1)), 20))
  returning * into u;
  return u;
end $$;

-- ---------- 2. 권한 ----------
-- 익명 키로는 아무 테이블도 읽고 쓰지 못한다 (RLS 앞에서 먼저 막는다)
revoke all on public.members, public.settings, public.accounts, public.plan_items, public.months,
  public.month_items, public.checks, public.categories, public.spendings from anon;
-- 로그인 사용자: 앱이 쓰는 select/insert/update/delete 만 (RLS 가 멤버인지 본다)
revoke truncate, trigger, references on public.settings, public.accounts, public.plan_items, public.months,
  public.month_items, public.checks, public.categories, public.spendings from authenticated;
-- members 는 SQL Editor 에서만 바꾼다
revoke all on public.members from authenticated;
grant select on public.members to authenticated;

-- 함수: RLS 가 쓰는 is_member 는 로그인 사용자만, 트리거 함수는 아무도 직접 부르지 않는다
revoke execute on function public.is_member() from public, anon;
grant execute on function public.is_member() to authenticated;
revoke execute on function public.current_person() from public, anon;
grant execute on function public.current_person() to authenticated;
revoke execute on function public.ensure_user() from public, anon;
grant execute on function public.ensure_user() to authenticated;
revoke execute on function public.log_change() from public, anon, authenticated;
revoke execute on function public.stamp_row() from public, anon, authenticated;
revoke execute on function public.guard_bulk() from public, anon, authenticated;
revoke execute on function public.touch_updated_at() from public, anon, authenticated;
revoke execute on function public.members_unbind() from public, anon, authenticated;

-- ---------- 3. rev 범위 (아주 큰 rev 를 넣어 이후 수정이 막히는 일 방지) ----------
do $$
declare t text;
begin
  foreach t in array array['settings','accounts','plan_items','months','month_items','categories','spendings'] loop
    if not exists (select 1 from pg_constraint where conname = t || '_rev_range' and conrelid = format('public.%I', t)::regclass) then
      execute format('alter table public.%I add constraint %I check (rev between 1 and 1000000000) not valid', t, t || '_rev_range');
    end if;
    begin
      execute format('alter table public.%I validate constraint %I', t, t || '_rev_range');
    exception when check_violation then
      raise notice '%_rev_range: 범위를 넘는 기존 줄이 있어 새로 쓰는 줄부터 적용합니다', t;
    end;
  end loop;
end $$;
