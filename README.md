<div align="center">

<img src="apps/web/public/icon-192.png" width="72" alt="앱 아이콘: 한 지붕 아래 두 동전">

# 우리 집 가계부 · OUR MONEY

**부부 두 사람의 월급 배분 → 이체 체크 → 지출 기록 → 일정까지, 한 달을 한 앱으로**

![version](https://img.shields.io/badge/version-v0.6.1-f5df4d?style=flat-square&labelColor=222326)
![Next.js](https://img.shields.io/badge/Next.js_16-PWA-222326?style=flat-square)
![Supabase](https://img.shields.io/badge/Supabase-Postgres_·_RLS_·_Realtime-939597?style=flat-square&labelColor=222326)
![Kotlin](https://img.shields.io/badge/Kotlin_Multiplatform-Android-939597?style=flat-square&labelColor=222326)

<img src="docs/screenshots/home.jpg" width="19%" alt="홈"> <img src="docs/screenshots/plan.jpg" width="19%" alt="플랜 월급 나뉨 막대"> <img src="docs/screenshots/check.jpg" width="19%" alt="체크"> <img src="docs/screenshots/ledger.jpg" width="19%" alt="가계부 누적 지출"> <img src="docs/screenshots/calendar.jpg" width="19%" alt="달력">

</div>

> 저희 부부 두 사람만 쓰는 앱이라 코드만 공개해요. 저장소에 실제 데이터·연결 정보는 없고, 화면의 이름(현빈·예진)과 금액은 모두 가상이에요.

## 문제 → 해결

| 전에 (구글 시트) | 이제 (이 앱) |
|---|---|
| 폰에서 칸을 찾아 고치기 어려움 | 엄지 하나로 10초 안에 지출 기록 |
| "이번 달 누가 어디로 얼마 옮기지?"를 매달 계산 | 플랜에서 **이체 목록을 자동으로** 만들고 체크 |
| 한 사람이 고치면 다른 사람은 모름 | 두 폰에 **실시간** 반영, 동시에 고쳐도 충돌을 막음 |

```mermaid
flowchart LR
  P["💰 월급날<br/>(주말이면 앞 금요일)"] --> A["플랜<br/>4개 묶음으로 나누기"]
  A --> B["체크<br/>옮길 돈 · 납부 · 카드값"]
  B --> C["가계부<br/>지출 기록 · 누적 그래프"]
  C --> D["달력<br/>일정 · 들어올/나갈 돈"]
  D --> E["지난주 돌아보기<br/>달 마감"]
  E -->|"다음 달 이어받기"| A
```

## 화면

| 플랜 | 체크 | 가계부 | 달력 | 알림 |
|:---:|:---:|:---:|:---:|:---:|
| <img src="docs/screenshots/plan-pick.jpg" width="160"> | <img src="docs/screenshots/check.jpg" width="160"> | <img src="docs/screenshots/ledger.jpg" width="160"> | <img src="docs/screenshots/calendar-day.jpg" width="160"> | <img src="docs/screenshots/bell.jpg" width="160"> |
| 수입 큰 숫자와 한 줄로 나뉜 월급 | 월급날마다 옮길 돈 칸 막대 | 이번 달 vs 지난달 누적 지출 | 애플 캘린더식 날짜 패널 | 지난주 돌아보기 |

| 카드 옮기기 | 달력 빠른 추가 | 100% 축하 | 어두운 화면 |
|:---:|:---:|:---:|:---:|
| <img src="docs/screenshots/arrange.jpg" width="160"> | <img src="docs/screenshots/calendar-quick.jpg" width="160"> | <img src="docs/screenshots/celebrate.jpg" width="160"> | <img src="docs/screenshots/dark.jpg" width="160"> |
| 꾹 눌러 흔들고 끌어 옮기기, 순서는 사람마다 | 날짜를 고르고 바로 쓰기 | 어디서 끝내도 그 자리에서 | 밝게 · 어둡게 · 기기 설정 |

<img src="docs/screenshots/desktop-plan.jpg" width="100%" alt="데스크톱: 플랜">

👉 **[예시 데이터로 직접 써 보기 (사용 안내)](docs/GUIDE.md)**

## 아키텍처

```mermaid
flowchart LR
  subgraph phone["두 사람의 폰"]
    pwa["웹앱 PWA<br/>Next.js 정적 빌드"]
    android["안드로이드<br/>WebView · 카드 알림 · 달력 위젯 · 폰 알림"]
  end
  subgraph supa["Supabase (백엔드 서버 없음)"]
    auth["Google OAuth"]
    db[("Postgres<br/>RLS · 트리거 · apply_batch")]
    rt["Realtime"]
  end
  vercel["Vercel"] -->|정적 파일| pwa
  android -.->|같은 화면| pwa
  pwa -->|PostgREST| db
  pwa --> auth
  db --> rt -->|바뀐 줄| pwa
```

### 저장 한 번이 두 폰에 닿기까지

```mermaid
sequenceDiagram
  participant A as 현빈 폰
  participant Q as 저장 대기열 (outbox)
  participant DB as Postgres
  participant B as 예진 폰
  A->>A: 화면에 먼저 반영 (낙관적)
  A->>Q: 줄 서기 · 폰에 보관
  Q->>DB: apply_batch(ops) 한 트랜잭션
  DB->>DB: stamp_row(rev 확인) · log_change(기록) · guard_bulk(200줄 한도)
  alt rev 가 낡음
    DB-->>A: OM409 → 최신 내용 다시 읽기
  else 성공
    DB-->>Q: 저장된 줄
    DB-->>B: Realtime: 바뀐 줄만
  end
```

## 왜 이렇게 만들었나 — 2명 서비스의 트레이드오프

판단 기준은 셋이에요. **혼자 만들고 고치는 비용**, **돈 정보의 정확성**, 그리고 **사용자는 2명에서 늘지 않는다**는 사실.

```mermaid
quadrantChart
  title 선택지 비교 (위·왼쪽일수록 2명 서비스에 맞음)
  x-axis "만들고 지키는 비용 낮음" --> "높음"
  y-axis "2명에게 필요한 것 적게 채움" --> "많이 채움"
  quadrant-1 "충분하지만 비쌈"
  quadrant-2 "고른 영역"
  quadrant-3 "싸지만 모자람"
  quadrant-4 "비싸고 모자람"
  "하이브리드 앱 (고름)": [0.30, 0.88]
  "전부 Kotlin 앱": [0.82, 0.90]
  "전부 웹 PWA": [0.12, 0.45]
  "Supabase, 서버 없음 (고름)": [0.18, 0.78]
  "직접 API 서버": [0.86, 0.80]
  "서버 렌더링": [0.58, 0.55]
  "낙관적 저장 + rev (고름)": [0.42, 0.95]
  "저장 끝까지 기다리기": [0.15, 0.35]
  "마지막 저장이 이김": [0.08, 0.20]
```

| 결정 | 얻는 것 | 내는 대가 | 2명이라 괜찮은 이유 | 다시 볼 때 |
|---|---|---|---|---|
| **하이브리드 앱**<br/>(vs 전부 Kotlin · 전부 PWA) | 화면 한 벌, 웹 배포로 앱 화면도 바뀜, 알림 읽기 가능 | 첫 화면이 조금 느림, 웹↔앱 다리 관리 | 체감 속도보다 **고치는 속도**가 중요(10일 PR 93개). 다리는 정해 둔 메시지만 · 우리 주소만 | 무거운 오프라인·애니메이션이 핵심이 될 때 |
| **서버 없이 Supabase**<br/>(vs 직접 API 서버) | 운영할 서버 0, 로그인·실시간 기본, **규칙을 DB 가 강제** | 로직이 SQL 로, 외부 연동·배치 작업이 어려움 | 요청이 적어 무료 플랜 안, 외부 연동이 없음 | 은행 API·정기 배치·푸시 서버가 필요할 때 |
| **정적 웹 + PWA**<br/>(vs 서버 렌더링) | 호스팅 비용 0, CDN, 어디든 배포 | 첫 로딩에 JS, 검색 노출 없음 | 공개 페이지가 없음 — 전부 로그인 뒤 | 공개 페이지·공유 링크가 생길 때 |
| **낙관적 저장 + 대기열 + rev**<br/>(vs 기다리기 · 마지막 저장이 이김) | 누르자마자 보임, 끊겨도 안 사라짐, **덮어쓰기 0** | 코드가 가장 복잡(대기열·rev 이어 맞추기·되돌리기) | 두 사람이 같은 체크·항목을 **실제로 동시에** 고치고, 돈이라 덮어쓰기는 안 됨 | 유지 (사용자가 늘어도 같은 문제) |
| **계산은 저장 없이 매번**<br/>(vs 이체 목록을 DB 에 저장) | 저장된 결과가 없어 **어긋남 0**, 플랜만 고치면 끝 | 같은 규칙이 웹·Kotlin 두 벌 | 한 달 데이터가 수백 줄이라 즉시 계산, 두 벌은 테스트로 맞춤 | 기록이 수십만 줄이 될 때 (DB 함수로) |

👉 **[결정 10가지 전체 비교와 그림](docs/DECISIONS.md)**

## 엔지니어링 포인트

| 문제 | 해결 | 결과 |
|---|---|---|
| 두 폰이 같은 줄을 동시에 고침 | 줄마다 `rev`, 트리거가 낡은 rev 를 `OM409` 로 거절 | 덮어쓰기 0, 충돌 시 자동 새로고침 |
| 지하철에서 저장이 끊김 | 대기열(outbox) + 지수 백오프·지터 재시도, id upsert 라 재전송 안전 | 저장이 사라지지 않음 |
| 달 시작 = 달 + 항목 수십 줄 | `apply_batch` 한 트랜잭션, 같은 칸 구성끼리 한 문장으로 (014) | 500줄 **114ms → 20ms** (약 5배) |
| PostgREST 는 1,000줄까지 | `(date, id)` keyset 페이지, OFFSET 없음 | 받는 도중 줄이 바뀌어도 빠짐·겹침 없음 |
| 이메일만으로 멤버가 되면 위험 | RLS 를 `auth.uid()` 에 묶고, 처음 로그인은 구글 계정만 연결 | 남이 만든 같은 이메일 계정 차단 |
| 웹·안드로이드 계산이 어긋날 위험 | 같은 규칙을 `calc.ts` · `Calc.kt` 로, 코어 테스트 46개 | 월급날 주말 당김까지 같은 결과 |
| 카드 알림을 지출로 | 알림 해석기 + 확실하지 않은 칸은 `review` 로 남기기 | 사람이 확인할 칸만 표시 |
| 실수로 대량 삭제 | 문장 단위 트리거 `guard_bulk` (200줄 초과 거절) | 조건 빠진 DELETE 사고 방지 |

## 디자인 시스템

<img src="docs/screenshots/palette.jpg" width="100%" alt="Pantone 2021 Ultimate Gray · Illuminating 팔레트">

- 색·글꼴·간격·움직임은 [`tokens.json`](docs/design-system/tokens.json) 하나에서 → `tokens.css` 생성, CI 가 어긋남을 막음
- 노랑은 흰 바탕과 대비가 1.35:1 → **넓은 채움에만**, 글자·선은 올리브(`accent-ink` 8.1:1)
- 컴포넌트 25개마다 규칙 + 움직이는 미리보기 → [`docs/design-system/`](docs/design-system/README.md)

## 버전

```mermaid
timeline
  title 10일, 8번의 릴리스
  11.03 : v0.1.0 플랜 · 체크 · 가계부 · 구글 로그인 · 실시간
  11.05 : v0.2.0 디자인 시스템 · 지갑 · rev 충돌 막기
  11.06 : v0.3.0 할부 · 실제로 낸 금액 · 달 마무리 · 변경 이력 · 안드로이드 하이브리드
  11.10 : v0.4.0 Pantone 색 · 원형/누적 그래프 · 달력 패널 · 토스식 카드 · 지난주 돌아보기
        : v0.4.1 DB 쿼리 다듬기 (묶음 저장 5배)
  11.11 : v0.5.0 화면 구조 다듬기 (가계부·설정 요약→상세 · 체크·플랜 접기 · 스며드는 카드)
  11.12 : v0.6.0 위젯 · 어두운 화면 · 폰 알림 · 숫자 먼저(막대) · 토스식 알림 · 달력 빠른 추가 · 카드 옮기기 · 어디서나 100% 축하
        : v0.6.1 달력 고무줄 저항 · 기간 일정 얇은 줄 · 은행·카드사·증권사 로고
```

## 기술

| 영역 | 사용 |
|---|---|
| 웹 | Next.js 16 (App Router, 정적 export) · React 19 · vaul · lucide-react · Pretendard / Alan Sans |
| DB · 인증 · 실시간 | Supabase — Postgres · RLS · PL/pgSQL 트리거 · Google OAuth · Realtime |
| 모바일 | Kotlin 2.4 · Compose Multiplatform 1.12 · AGP 9.5 · supabase-kt · NotificationListenerService · Glance 위젯 · AlarmManager 알림 |
| 품질 | GitHub Actions (비밀값 3겹 · 웹 빌드 · 모바일 테스트 · PR 규칙 · 태그 릴리스) · Playwright 화면 검증 · PGlite 로 SQL 검증 |

## 더 보기

| 문서 | 내용 |
|---|---|
| [사용 안내](docs/GUIDE.md) | 예시 데이터로 모든 기능 따라 해 보기 |
| [설계 결정](docs/DECISIONS.md) | 하이브리드 · 서버 없음 · 저장 방식 등 왜 이렇게 했나 (그림) |
| [설계](docs/ARCHITECTURE.md) | 계산 규칙 · 데이터 모델 · 보안 · 성능 · 저장소 구조 · 개발 규칙 |
| [직접 구축하기](docs/SETUP.md) | Supabase · 구글 로그인 · 배포 · 폰 설치 · 안드로이드 빌드 |
| [디자인 시스템](docs/design-system/README.md) · [변경 기록](CHANGELOG.md) | 화면 규칙 · 버전별 변경 |
