# PageTransition — 화면 앞뒤 이동

클릭으로 연 화면과 뒤로 돌아온 화면의 관계를 좌우 이동으로 보여 줍니다.

- **전진:** 기존 화면은 즉시 숨기고 새 화면만 오른쪽 12px → 제자리.
- **뒤로:** 떠나는 화면은 즉시 숨기고 돌아온 화면만 왼쪽 12px → 제자리.
- **박자:** `dur-page`(200ms)·`ease-out`. 화면 가장자리에 이전 내용이 남거나 전체 폭을 이동하지 않습니다. 방향감만 짧게 느껴져야 합니다.
- **기준점:** 위쪽 막대·하단 캡슐·데스크톱 레일은 고정합니다. 기존 게이지·월·시트 움직임은 각자의 규칙을 유지합니다.
- **접근성:** 움직임 줄이기에서는 즉시 끝 상태. 기존 링크·키보드 탐색·브라우저 기록을 그대로 사용하며 가장자리 뒤로 제스처를 가로채지 않습니다.

`apps/web/src/components/PageTransition.tsx`는 React 19.3 `ViewTransition`으로 주소(경로·검색 조건)가 바뀔 때 두 화면을 연결합니다. `lib/navigationMotion.ts`는 Next 기록 상태를 보존하면서 페이지 방문 순서만 추가합니다. 같은 주소의 시트·해시 기록은 순서를 늘리지 않습니다. `instrumentation-client.ts`에서 Next·React가 시작되기 전에 한 번 설치해, StrictMode의 effect 재설치와 기록 함수 복원이 서로 섞이지 않게 합니다.

React는 `popstate` 복원을 즉시 커밋하므로, 페이지 복귀에서는 브라우저 `startViewTransition`으로 이전 화면을 확보한 다음 원래 기록 이벤트를 한 번 전달합니다. `useLayoutEffect`가 새 화면 커밋을 알리면 전환을 시작합니다. 시트·해시·움직임 줄이기·시스템 자체 전환은 원래 이벤트를 그대로 전달합니다. 2초 안에 화면이 확정되지 않으면 캡처 대기를 풀어 화면이 멈추지 않게 합니다.

Android `navigation-event`의 뒤로가기 수명·시트 구분, `navigation-3`의 전진/돌아오기 분리, `jetpack-compose-performance`의 그리기 단계 애니메이션 원칙을 웹의 기록·transform·opacity에 적용했습니다. Impeccable `animate`·iOS 지침과 [Apple Motion](https://developer.apple.com/design/human-interface-guidelines/motion)의 공간적 연속성·역방향 복귀 원칙을 따릅니다.

## 검증

`node --test apps/web/src/lib/navigationMotion.test.mjs`로 페이지/시트/해시가 섞인 기록의 앞뒤 방향과 상태 보존을 확인합니다. 실제 브라우저에서는 이전 화면 잔상이 없고 새 화면만 12px·200ms로 움직이는지, 빠른 연속 입력, 스크롤 복귀, 기간 검색 조건 변경, 시스템·화면 내 뒤로가기와 움직임 줄이기를 함께 확인합니다. View Transitions 미지원 환경도 같은 짧은 방향감을 유지합니다.
