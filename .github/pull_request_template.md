## 요약
<!-- 무엇을 왜 바꿨는지 -->

## 확인한 것
<!-- 실제로 돌린 명령과 결과. 확인하지 못한 것은 못 했다고 적기 -->
- [ ] `python3 scripts/secret_check.py` 통과
- [ ] 웹: `cd apps/web && npx next build` (웹을 바꿨을 때)
- [ ] 모바일: `./gradlew :core:jvmTest :androidApp:assembleDebug` (모바일을 바꿨을 때)
- [ ] 계산 규칙을 바꿨다면 `calc.ts` 와 `Calc.kt` 를 함께 고치고 `core` 테스트 추가

## 체크리스트
- [ ] `CHANGELOG.md` "다음 버전"에 한 줄 (사용자가 알아챌 변경일 때)
- [ ] DB 를 바꿨다면 `supabase/migrations/` 새 파일 + `schema.sql` 반영 + "DB 이전" 줄에 실행할 파일
- [ ] 비밀값·연결 정보·실제 이메일·실명 없음 (예시는 가상 인물)
