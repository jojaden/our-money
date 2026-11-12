---
name: 우리 집 가계부 (OUR MONEY)
description: 두 사람의 한 달 돈 흐름을 다정하고 차분하게 보여 주는 가계부. Pantone 2021의 두 색으로 짠다: Ultimate Gray를 옅게 푼 중성 회색 바탕에 흰 카드를 옅은 그림자로 띄우고, 누를 곳과 고른 곳은 Illuminating 노랑으로 밝히며, 금액은 Alan Sans로 쓴다.
---

# 디자인 — 우리 집 가계부

디자인 기준은 [`docs/design-system/`](docs/design-system/README.md)입니다. 이 문서는 길잡이만 둡니다. 값과 규칙은 그 폴더에만 적고 여기에 다시 옮기지 않습니다. 두 곳에 적으면 언젠가 서로 어긋나기 때문입니다.

## 어디에 무엇이 있나

- **값:**
  - 색·글꼴·간격·모서리·그림자·움직임 값은 [`tokens.json`](docs/design-system/tokens.json)에 있습니다.
  - `python3 scripts/design_preview.py`가 이 파일로 앱의 `apps/web/src/app/tokens.css`를 만듭니다. CI가 `--check`로 둘이 어긋나지 않았는지 봅니다.
- **규칙:** [`README.md`](docs/design-system/README.md)에 말투, 색, 글꼴, 모양과 깊이, 게이지와 막대, 지갑, 위쪽 막대와 하단 메뉴, 레이아웃, 아이콘, 움직임, 특별한 화면, 하지 말 것이 있습니다.
- **컴포넌트:** `docs/design-system/components/<이름>/` 폴더마다 두 파일이 있습니다.
  - `README.md`: 구성, 움직임, 접근성, 앱에서 쓰는 곳
  - `preview.html`: 움직이는 미리보기
- **미리보기:** `python3 scripts/design_preview.py`를 돌린 뒤 `docs/design-system/index.html`을 엽니다. 이 파일은 만들어 쓰는 것이라 커밋하지 않습니다.

## 컴포넌트

| 묶음 | 컴포넌트 |
|---|---|
| 셸 | [TopBar](docs/design-system/components/TopBar/README.md) · [TabBar](docs/design-system/components/TabBar/README.md) · [TextTabs](docs/design-system/components/TextTabs/README.md) · [Arrange](docs/design-system/components/Arrange/README.md) |
| 컨트롤 | [Button](docs/design-system/components/Button/README.md) · [Chip](docs/design-system/components/Chip/README.md) · [Segmented](docs/design-system/components/Segmented/README.md) · [ListRow](docs/design-system/components/ListRow/README.md) |
| 홈 | [Nudges](docs/design-system/components/Nudges/README.md) · [BudgetCard](docs/design-system/components/BudgetCard/README.md) · [HighlightCard](docs/design-system/components/HighlightCard/README.md) |
| 체크 | [StepTrack](docs/design-system/components/StepTrack/README.md) · [Celebrate](docs/design-system/components/Celebrate/README.md) |
| 가계부 | [SpendCurve](docs/design-system/components/SpendCurve/README.md) · [StatTiles](docs/design-system/components/StatTiles/README.md) |
| 플랜 | [SplitBar](docs/design-system/components/SplitBar/README.md) · [GoalBar](docs/design-system/components/GoalBar/README.md) |
| 지갑 | [Wallet](docs/design-system/components/Wallet/README.md) · [AddPass](docs/design-system/components/AddPass/README.md) |
| 처음과 기다림 | [Login](docs/design-system/components/Login/README.md) · [Loading](docs/design-system/components/Loading/README.md) |

## 앱의 CSS

`apps/web/src/app/layout.tsx`가 아래 순서로 읽습니다.

| 파일 | 담는 것 |
|---|---|
| `tokens.css` | `tokens.json`에서 만든 CSS 변수. 손으로 고치지 않습니다. |
| `globals.css` | 바탕 규칙, 12열 그리드, 여러 화면이 나눠 쓰는 작은 조각 |
| `controls.css` | 카드, 목록 줄, 버튼, 칩, 세그먼트, 입력, 토글, 체크 링, 알약, 시트 |
| `cards.css` | Meter, BudgetCard, StepTrack, SpendCurve, StatTiles, 막대, GoalBar, SplitBar |
| `moments.css` | 100% 축하, 로그인·로딩의 따뜻한 무대 |
| `wallet.css` | 지갑, 카드 상세, AddPass, 작은 카드 |
| `shell.css` | 위쪽 막대, 하단 캡슐, 데스크톱 레일, 화면 전환, 토스트 |

## 고칠 때

- **값:** 색이나 움직임 값을 바꿀 때는 `tokens.json`만 고치고 `python3 scripts/design_preview.py`를 돌립니다.
- **새 컴포넌트:** 컴포넌트 폴더에 `README.md`와 `preview.html`을 먼저 만들고 앱에 옮깁니다.
- **사람 표시:** 동전 반쪽(`PersonGlyph`)으로만 합니다. 이니셜은 쓰지 않습니다.
- **레이아웃·움직임·뒤로 가기:** 이런 것을 바꿀 때는 맞는 `android-skills`를 먼저 불러 그 원리를 웹에 옮깁니다. 어떤 스킬을 쓸지는 [`CLAUDE.md`](CLAUDE.md) "Design work"에 있습니다.
