# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Next.js (static export, client-rendered) + Supabase (Postgres, Google OAuth, Realtime), deployed on Vercel. Installed on both partners' Android phones as a PWA. Chosen by the user ("3번") from: AppSheet, Apps Script on the existing sheet, or a custom PWA.

## Users

A married couple — the only two users. Both on Android phones. They open it on payday to plan and move money, a few times a week to log spending, and whenever they want to know "how much living money is left this month". One partner (the builder) is a developer; the other is not, so nothing may require spreadsheet literacy.

## Product Purpose

Replace the "OUR MONEY · 우리 집 부부 가계부" Google Sheet, which was too hard to read and edit on a phone. Success: on payday they can see exactly how the two salaries are split (fixed costs, joint living money, allowances, savings/investments) and which transfers to make, tick each one off, and during the month log a spending in a few seconds with its payment method (card / cash / transfer).

## Positioning

A household money plan built around the couple's real money flow: each partner receives their own salary and sends only part to joint accounts. The app derives the month's transfer list (from whose account, to which account, how much) from the plan, instead of only recording spending like generic ledger apps.

## Operating Context

- Each partner is paid on the same day, with nearly fixed amounts.
- Salaries land in each person's own account; a joint share moves to joint account(s). Fixed costs are paid by card auto-pay, account auto-debit, or manual transfer from various accounts.
- Monthly ritual: payday → open the month → make transfers → tick them off → confirm fixed costs and savings went out → prepare card bills before each card's payment date.
- Daily: log joint living spending with method (card / cash / transfer) and which card.
- Joint costs are split between partners by a ratio (50:50 in the old sheet, may be income-proportional).

## Capabilities and Constraints

- Two people only; access limited to two Google accounts (email allowlist).
- Per-account balance tracking is explicitly NOT wanted now.
- Must cover: pooled income → allocation buckets (고정비, 공동 생활비, 용돈, 저축·투자); monthly transfer plan + done checks; fixed-cost payment checks; card vs cash vs transfer per spending; card bill preparation per card.
- Both partners see each other's changes live.
- Display names: each Google account has a `users` row; each partner edits only their own name. Settings names are the fallback before first login.

## Brand Commitments

Name carried over from the sheet: "OUR MONEY · 우리 집". Korean UI throughout.

## Evidence on Hand

The existing sheet (Google Drive, ChatGPT folder) defines the vocabulary: 비용귀속(공동/A/B), 고정비 ID, 결제수단, 정산, 저축목표. It holds no transactions yet. All amounts and names in the demo dataset are synthetic and must be replaced by the couple's own setup.

## Product Principles

1. The month is the unit: everything answers "what do we still need to do this month, and what is left".
2. Derive, don't re-enter: transfers, card bills and settlements are computed from the plan and the log.
3. Logging a spending must take under ten seconds with one thumb.
4. Both partners are equal: every check records who did it, and changes appear on the other phone immediately.
5. Honest numbers: zeros are zeros, unknowns are dashes, sums add up from the rows shown.
