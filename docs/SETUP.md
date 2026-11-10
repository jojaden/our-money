# 직접 구축하기

[← README](../README.md) · [사용 안내](GUIDE.md) · [설계](ARCHITECTURE.md)

## 0. 데모로 먼저 보기

```bash
cd apps/web
npm install
npm run dev          # http://localhost:3000 — .env.local 이 없으면 데모 모드
```

> WSL 에서 `/mnt/c` 아래에 두면 파일 변경 알림이 오지 않아요. 그럴 때는 `WATCHPACK_POLLING=true npx next dev --webpack` 으로 실행하세요.

## 1. Supabase 프로젝트 (DB · 로그인 · 실시간)

1. https://supabase.com 에서 새 프로젝트를 만들어요. 무료 플랜이면 충분하고, 지역은 서울(Northeast Asia)을 추천해요.
2. **SQL Editor** 에 [`supabase/schema.sql`](../supabase/schema.sql) 전체를 붙여넣고 Run 해요.
3. 맨 아래 주석 처리된 `insert into public.members …` 두 줄을 두 사람의 구글 이메일(소문자)로 바꿔서 실행해요. `'a'` 가 설정의 첫 번째 사람이에요.
4. **Project Settings → API** 에서 `Project URL` 과 `anon`(publishable) 키를 복사해요. `service_role` 키는 쓰지 않아요.

## 2. 구글 로그인

1. https://console.cloud.google.com → API 및 서비스 → **OAuth 동의 화면**을 만들어요. 외부, 테스트 사용자에 두 사람의 이메일을 넣어요.
2. **사용자 인증 정보 → OAuth 클라이언트 ID(웹 애플리케이션)** 를 만들어요.
   - 승인된 리디렉션 URI: `https://<프로젝트>.supabase.co/auth/v1/callback`
3. Supabase **Authentication → Sign In / Providers → Google** 을 켜고 클라이언트 ID 와 시크릿을 넣어요.
   - 같은 화면에서 **Email** 제공자는 꺼요(이 앱은 구글로만 로그인해요). 켜 두면 아무나 이메일로 가입해 로그인 상태가 될 수 있어요. 멤버가 아니라 가계부 내용은 못 보지만, 실시간 알림으로 지운 항목의 id 와 시각은 받을 수 있어요.
   - **Allow anonymous sign-ins** 와 **Allow manual linking** 은 꺼 둬요.
   - **Allow new users to sign up** 은 두 사람이 모두 한 번 로그인할 때까지 켜 둬요(끄면 처음 로그인하는 구글 계정도 막혀요). 둘 다 들어온 뒤에는 꺼도 돼요.
4. Supabase **Authentication → URL Configuration**:
   - Site URL: 배포 주소
   - Redirect URLs: 배포 주소, `http://localhost:3000`, `ourmoney://auth-callback`(안드로이드 앱에서 로그인한 뒤 앱으로 돌아오는 주소)

## 3. 환경 변수

`apps/web/.env.local` (로컬)과 Vercel 프로젝트의 Environment Variables 에 넣어요. 이 파일은 `.gitignore` 와 비밀값 검사가 막아서 저장소에 올라가지 않아요.

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

## 4. 배포 (Vercel)

```bash
npx vercel login
npx vercel deploy --prod --yes --cwd apps/web    # 저장소 루트에서
```

처음 실행하면 프로젝트를 만들고 `apps/web/.vercel` 에 연결 정보를 저장해요(저장소에는 올라가지 않아요). GitHub 저장소를 Vercel 에서 Import 할 때는 Root Directory 를 `apps/web` 으로 정해요.

## 5. 폰에 설치

크롬으로 배포 주소를 열고 → 메뉴(⋮) → **홈 화면에 추가** → 설치해요. 두 사람이 같은 주소로 설치하고 각자 구글 계정으로 로그인하면 돼요.

## 6. 처음 설정 순서

설정 탭에서 ① 이름·월급 ② 계좌와 카드(월급통장, 공동통장, 적금·증권 계좌, 카드와 결제계좌) ③ 월급통장 지정 ④ 분담 방식·한 달 기준일 순서로 정해요. 그다음 플랜 탭에서 이번 달 플랜을 시작하고 항목(월세, 보험, 통신비, 공동 생활비, 용돈, 적금…)을 넣으면 돼요.

## 7. 안드로이드 앱 빌드

JDK 21, Android SDK(platform 37, build-tools 37)가 필요해요.

```bash
cd apps/mobile
./gradlew :core:jvmTest              # 계산 테스트 (웹과 같은 규칙)
./gradlew :androidApp:assembleDebug  # androidApp/build/outputs/apk/debug/ (내 폰에서 개발할 때만)
```

다른 사람에게 건네는 APK 는 출시 키로 서명한 `assembleRelease` 로 만들어요. 키 만들기와 확인 방법은 [`apps/mobile/README.md`](../apps/mobile/README.md#출시용-apk-두-사람에게-건넬-것)에 있어요.

## 8. 이미 쓰던 DB 올리기

[`supabase/migrations/`](../supabase/migrations/)의 파일을 번호 순서대로 SQL Editor 에서 실행해요. 각 버전에 실행할 파일은 [변경 기록](../CHANGELOG.md)의 "**DB 이전**" 줄에 있어요. 002~004 는 007 을 실행한 뒤에는 다시 실행하지 않아요(실행하면 바로 멈춰요).
