# 변경 기록

버전은 git 태그(`v0.1.0`)로 붙이고, 같은 내용이 [Releases](https://github.com/jojaden/our-money/releases)에 올라갑니다.
웹(`apps/web/package.json`)과 안드로이드(`versionName`)는 같은 버전 번호를 씁니다.

버전마다 **DB 이전** 줄이 있습니다. 이미 쓰고 있는 Supabase 프로젝트에서 SQL Editor 로 실행할 `supabase/migrations/` 파일을 적고, 없으면 "없음"이라고 적습니다. 새로 설치할 때는 `supabase/schema.sql` 하나면 됩니다.

## 다음 버전

## v0.1.0 — 2026-11-03

- 웹앱(PWA): 홈(남은 공동 생활비, 이번 달 할 일, 카드값, 두 사람 월급 흐름), 플랜(월급 배분), 체크(옮길 돈·고정비·저축·카드값·정산), 가계부(지출 기록과 분류별 예산), 설정
- 구글 로그인과 두 사람 이메일 허용 목록(RLS), 한쪽에서 바꾸면 다른 폰에 바로 반영(Realtime)
- 지출 기록: 누구 돈인지 기본값은 내 용돈, 메모로 분류 자동 선택, 자주 쓰는 지출 바로 넣기
- 새 달이 되면 지난달 플랜을 그대로 이어받고, 다른 달에서 빠진 항목만 불러오기
- 조회 최적화: 지출은 최근 400일만 먼저 받고 지난 기록은 필요할 때, 테이블별 실시간 갱신
- 모노레포(`apps/web`, `apps/mobile`)와 Kotlin Multiplatform 모바일 앱 뼈대(계산 로직 이식과 테스트)
- 공개 저장소 준비: 비밀값 검사(커밋 전 훅, CI, gitleaks), PR 규칙 점검, 태그로 릴리스
- **DB 이전:** 이 버전 전에 `schema.sql` 을 실행했다면 `supabase/migrations/002_performance.sql` 을 한 번 실행하세요 (여러 번 실행해도 안전)
