# our-money (우리 집 가계부)

Household budget app for a couple (person `a` = repo owner, `b` = partner). Korean UI. Two users only. **Public repo**: real names, emails, amounts and connection info never go in; examples use the fictional 현빈 (`a`) and 예진 (`b`).

## Layout
- `apps/web` — Next.js 16 static export (PWA), live at https://our-money-sage.vercel.app
- `apps/mobile` — Kotlin Multiplatform: `core` (models, calc, Supabase), `ui` (Compose MP), `androidApp`, `iosApp` (placeholder)
- `supabase/` — `schema.sql` + `migrations/` (shared by web and mobile)
- `PRODUCT.md` — product source of truth; `CHANGELOG.md` — versions
- `docs/design-system/` — design source of truth: `tokens.json`, rules in `README.md`, per-component `README.md` + live `preview.html`. `DESIGN.md` still describes the current, older UI until the app is migrated.
- `scripts/secret_check.py`, `.githooks/`, `.github/` — secret blocking, CI, PR rules, releases

## Stack
- Supabase: Postgres + Google OAuth + RLS (`members` email allowlist) + Realtime. No custom backend.
- Mobile: Kotlin 2.4.21, Compose MP 1.12.2, AGP 9.5.0, Gradle 9.8.2, supabase-kt 3.8.0, compileSdk 37, minSdk 26.

## Commands
- Web dev: `cd apps/web && WATCHPACK_POLLING=true npx next dev --webpack -p 3000` (polling is required on /mnt/c)
- Web deploy (user runs it; prod deploy is blocked for Claude): `npx vercel deploy --prod --yes --cwd apps/web`
- Mobile: `cd apps/mobile && source env.sh && ./gradlew :core:jvmTest :androidApp:assembleDebug`
- Secrets: `python3 scripts/secret_check.py` (hook: `git config core.hooksPath .githooks`)
- Design previews: `python3 scripts/design_preview.py`, then open `docs/design-system/index.html` (generated, not committed). The same command regenerates `apps/web/src/app/tokens.css` from `tokens.json` (committed; CI `--check` fails on drift)
- GitHub CLI: `~/.local/bin/gh` (repo `jojaden/our-money`, public)

## Git workflow
- `main` is protected: branch (`feat/…`, `fix/…`, `docs/…`) → PR → CI green (`비밀값 검사`, `웹 빌드`, `모바일 테스트·빌드`, `PR 규칙 점검`) → merge. No force push.
- Commit messages in Korean: `무엇 — 어떻게`, body says why. End with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- User-visible change → one line under `## 다음 버전` in `CHANGELOG.md` plus a `- **DB 이전:**` line (migration file to run, or 없음). Otherwise label the PR `변경기록 없음`.
- Release: rename `다음 버전` → `vX.Y.Z — YYYY-MM-DD`, add an empty `다음 버전`, bump `apps/web/package.json` version + `versionName` (and `versionCode` +1), merge, then `git tag -a vX.Y.Z` on main and push the tag (`release.yml` publishes the GitHub Release). Ask the user before tagging.

## Before any deploy or app release
Applies to every build that reaches users:
- web production deploy (Vercel);
- Android: any Play track upload (internal, closed, production) or an APK/AAB handed to anyone;
- iOS: TestFlight or App Store.

Steps:
1. Run the Cloudflare `security-audit` skill in **full audit mode with the `standard` profile** on the repo (install if missing: `npx skills add cloudflare/security-audit-skill`). Include `apps/mobile` in scope for app releases.
2. For Android releases, also run `android-skills:android-permissions-security`, `android-skills:android-intent-security` and `android-skills:play-policy-insights`.
3. Fix every confirmed finding or get the user's sign-off before releasing, and report the run directory.

## Android work
Use the `android-skills` plugin (install: `/plugin install android-skills@android-skills`). Invoke the matching skill with the Skill tool before writing code:
- UI: `android-skills:edge-to-edge`, `android-skills:adaptive`, `android-skills:navigation-3`, `android-skills:navigation-event`, `android-skills:jetpack-compose-performance`
- Widget: `android-skills:glance-canonical-layouts`, `android-skills:glance-appwidget-updates-and-memory`
- Security (notification listener, intents, permissions): `android-skills:android-permissions-security`, `android-skills:android-intent-security`
- Build, tests, release: `android-skills:testing-setup`, `android-skills:r8-analyzer`, `android-skills:anr-audit-and-fix`, `android-skills:android-cli`
- Before a Play upload: see "Before any deploy or app release"
- Note: `android-skills:agp-9-upgrade` does not support KMP projects; don't use it here.

## Rules
- UI work follows `docs/design-system/`: its token names (CSS variables from the generated `tokens.css`; change values only in `tokens.json`) and component rules. Mark people with the half-coin `PersonGlyph`, never initials (both names can start with the same syllable).
- Keep calc logic identical in `apps/web/src/lib/calc.ts` and `apps/mobile/core/.../calc/Calc.kt`; add a `core` test for any change.
- Schema changes: add a new file in `supabase/migrations/` and mirror it in `schema.sql` (PR check enforces).
- Membership is bound to the auth account: `is_member()`/`current_person()` check `members.user_id = auth.uid()` (never the JWT email claim). `ensure_user()` binds on first login only for a confirmed Google account in `auth.users`. anon has no table privileges; keep it that way for new tables (`revoke all … from anon`).
- Writes: send back the `rev` you read (optimistic lock; a stale rev fails with SQLSTATE `OM409` → reload, don't retry). Never send `rev: null` (Kotlin Json `explicitNulls = false`). `created_*`, `updated_*`, `rev` and `history` are filled by triggers; don't write them yourself, and strip them when copying a row into a new one.
- Writes that must land together (month + items, plan item + month item, delete + deactivate) go in one `apply_batch` call (web: `store.batch([upsertOp(…), deleteOp(…)])`). Send full rows, sorted by id. Limits: 500 rows per batch, 200 rows per UPDATE/DELETE statement (`OM413`).
- Retry only `RetryableError` (network, 5xx, 429, 40001, 40P01) with capped backoff and jitter; re-sending is safe because writes are id upserts and identical content is skipped before the rev check. Keep unsent writes in the outbox, never drop them.
- Reads: PostgREST returns at most 1000 rows. Page every list with keyset (`id`, or `date, id` for spendings), never OFFSET.
- Value limits live in DB CHECKs (`migrations/005`); mirror them in inputs (`MAX_SPENDING`, `MAX_AMOUNT`, `MAX_GOAL` in `components/ui.tsx`).
- Shared logic and UI live in `core`/`ui`; platform-only features (card notification listener, widgets) go in `androidApp`/`iosApp`.
- iOS targets build only on macOS (`-Pios`).
- Never commit secrets or connection info: `.env*`, keystores, `local.properties`, `google-services.json`, `.vercel/`, Supabase keys/URL, real emails. Only the anon key goes in the app; never the service_role key.

## Status
- Done: web app, Supabase + Google login, Vercel deploy, monorepo, mobile scaffold + calc port (tests pass, debug APK builds), public repo with secret checks and versioning (v0.1.0).
- Paydays differ per person (`payday_a`/`payday_b`, read via `paydayOf`; the old shared `payday` is only a fallback). Transfers are grouped by the payer's payday on the check page.
- Pending: run `supabase/migrations/007_security_hardening.sql`; port the screens to Compose; Android Google login (Android OAuth client + SHA-1); card-notification auto-logging, widget, push; Play Console internal testing.
