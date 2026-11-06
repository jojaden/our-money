-- 013 보안 보강 3 — 012 까지 실행한 프로젝트에 한 번 실행한다 (여러 번 실행해도 안전).
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 Run.
--
-- 보안 점검(security-audit run-2)에서 "확인 필요"로 나온 것을 막는다:
-- 아직 묶이지 않은 멤버(처음 로그인 전인 사람)의 이메일로 남이 먼저 비밀번호를 정해 가입해 두고 그 사람이 메일의 링크를 누르면,
-- 그 사람이 나중에 구글로 처음 로그인할 때 Supabase 가 같은 이메일이라며 구글 계정을 그 가입에 이어 붙일 수 있다.
-- 그러면 009 의 확인(같은 이메일, 확인됨, 그 이메일의 구글 계정)을 통과하는데, 남이 정한 비밀번호가 그 계정에 그대로 남는다.
-- → 처음 묶을 때 비밀번호가 없고 구글 말고 다른 로그인 방식이 붙어 있지 않은 계정만 묶는다.
--   (migrations/007·009 도 같은 조건으로 고쳤다. 그 파일을 다시 실행해도 이 조건이 유지된다)
-- 이미 묶인 계정은 그대로다. 실행 뒤 맨 아래 확인 쿼리로 멤버 계정에 비밀번호나 다른 로그인 방식이 없는지 보세요.

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

-- 확인(읽기만): has_password 가 true 이거나 providers 에 google 말고 다른 것이 있으면,
-- 그 계정을 대시보드 Authentication > Users 에서 지우고 그 사람이 구글로 다시 로그인하세요 (지우면 묶임이 풀리고 처음 로그인할 때 다시 묶여요).
-- select m.person, m.user_id is not null as bound,
--        coalesce(au.encrypted_password, '') <> '' as has_password,
--        array_agg(i.provider order by i.created_at) as providers
--   from public.members m
--   join auth.users au on lower(au.email) = m.email
--   left join auth.identities i on i.user_id = au.id
--  group by m.person, m.user_id, au.encrypted_password;
