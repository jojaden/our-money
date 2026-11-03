---
version: 1
slug: "src-app-page-tsx"
primary_target: "src/app/page.tsx"
related_targets: ["src/app/plan/page.tsx","src/app/check/page.tsx","src/app/ledger/page.tsx","src/app/settings/page.tsx"]
---

# Surface: 우리 집 가계부 app (home, plan, check, ledger, settings)

Mode: Operate. Audience: the two partners, on Android phones, on payday and a few times a week. Job: see how the two salaries are split, make and tick off the month's transfers, confirm fixed costs and card bills, log a spending in seconds with card/cash/transfer. Constraints: Korean UI, PWA, no balance tracking, two-person access.

Direction source: pinned by the taste-skill app sheet (style `pastel-consumer`, seed 1549873398), not by concept-seed. Code-led build (no image generation available).

## Direction contract

THESIS: The month as a couple's money flow — two salaries running into shared and personal buckets — instead of the category default of a KPI strip, a donut and a transaction table.

OWN-WORLD: Ground #f3f5f7, white cards at 20px radius with no border or shadow; one cobalt (#1d5fd6) on the main data (living-money track, plan bars ramp); each person has a pale identity tint (amber #fdecd8 / rose #fde4ef, joint = cobalt tint) used only on initials, account tiles and the brand mark of two overlapping circles whose overlap is cobalt. Manrope figures (tabular) with Pretendard Hangul; near-black pill primary; green only for done checks.

STORY: Open on payday: know what is left of joint living money and what to move where; tick transfers; during the month log spending with one thumb from the bottom sheet and watch the pace line.

FIRST VIEWPORT: Phone: h1 month name with period and days left, one finding sentence (overdue or pending transfers), then the 남은 공동 생활비 card (32px answer figure, spent track with today's pace tick, card/cash/transfer split), then 이번 달 할 일 with check circles. Bottom tab bar (홈·플랜·체크·가계부·설정); the one primary action "지출 기록" floats above it bottom-right.

FORM: Icon-rail shell (desktop) folding to a bottom bar (phone), the dealt pastel-consumer style; signature element = the two salary lanes (per-person stacked bars on one scale) plus the derived "A 급여통장 → 공동 적금" transfer rows. seed:5d73c2e10270d0d6
STYLE SOURCE: taste-skill app sheet `pastel-consumer`, seed 1549873398. The concept roll ran (operate, assigned index 7 of a grounded list); the user's request pinned the taste skill, and a user- or brief-pinned direction beats the roll, so the dealt sheet stays the direction.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
