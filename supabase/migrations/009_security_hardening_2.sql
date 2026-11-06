-- 009 보안 보강 2 — 008 까지 실행한 프로젝트에 한 번 실행한다 (여러 번 실행해도 안전).
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 Run.
--
-- 보안 점검(security-audit run-1)에서 "확인 필요"로 나온 것을 DB 쪽에서도 막는다:
-- 1) 처음 묶을 때 계정의 대표 이메일만이 아니라, 그 이메일의 구글 계정(auth.identities)이 붙어 있는지 본다.
--    Supabase 에서 이메일 확인이 꺼지거나 계정 연결(manual linking)이 켜져도, 아직 묶이지 않은 자리를 남이 가져가지 못한다.
--    (migrations/007 도 같은 조건으로 고쳤다. 007 을 다시 실행해도 이 조건이 유지된다)
-- 2) members 읽기: 토큰 이메일로 읽는 길은 아직 계정이 묶이지 않은 줄에만 남긴다(처음 로그인할 때 앱이 이 줄을 보고 ensure_user 를 부른다).
--    묶인 뒤에는 그 계정과 멤버만 읽는다.
-- 3) settings 는 지우지 않는다 → 로그인 사용자의 DELETE 권한을 거둔다 (apply_batch 도 이미 막고 있다).

-- ---------- 1. 첫 연결: 구글 계정의 이메일로 확인 ----------
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

-- ---------- 2. members 읽기 ----------
drop policy if exists "members read members" on public.members;
create policy "members read members" on public.members for select to authenticated
  using (
    user_id = (select auth.uid())
    or (user_id is null and email = lower(coalesce((select auth.jwt()) ->> 'email', '')))
    or (select public.is_member())
  );

-- ---------- 3. settings 는 지우지 않는다 ----------
revoke delete on public.settings from authenticated;
