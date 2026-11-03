# our-money (우리 집 가계부)

Household budget app for a couple (person `a` = repo owner, `b` = partner). Korean UI. Two users only. **Public repo**: real names, emails, amounts and connection info never go in; examples use the fictional 현빈 (`a`) and 예진 (`b`).

## Layout
- `apps/web` — Next.js 16 static export (PWA), live at https://our-money-sage.vercel.app
- `apps/mobile` — Kotlin Multiplatform: `core` (models, calc, Supabase), `ui` (Compose MP), `androidApp`, `iosApp` (placeholder)
- `supabase/` — `schema.sql` + `migrations/` (shared by web and mobile)
- `PRODUCT.md`, `DESIGN.md` — product and design source of truth; `CHANGELOG.md` — versions
- `scripts/secret_check.py`, `.githooks/`, `.github/` — secret blocking, CI, PR rules, releases

## Stack
- Supabase: Postgres + Google OAuth + RLS (`members` email allowlist) + Realtime. No custom backend.
- Mobile: Kotlin 2.4.21, Compose MP 1.12.2, AGP 9.5.0, Gradle 9.8.2, supabase-kt 3.8.0, compileSdk 37, minSdk 26.

## Commands
- Web dev: `cd apps/web && WATCHPACK_POLLING=true npx next dev --webpack -p 3000` (polling is required on /mnt/c)
- Web deploy (user runs it; prod deploy is blocked for Claude): `npx vercel deploy --prod --yes --cwd apps/web`
- Mobile: `cd apps/mobile && source env.sh && ./gradlew :core:jvmTest :androidApp:assembleDebug`
- Secrets: `python3 scripts/secret_check.py` (hook: `git config core.hooksPath .githooks`)
- GitHub CLI: `~/.local/bin/gh` (repo `jojaden/our-money`, public)

## Git workflow
- `main` is protected: branch (`feat/…`, `fix/…`, `docs/…`) → PR → CI green (`비밀값 검사`, `웹 빌드`, `모바일 테스트·빌드`, `PR 규칙 점검`) → merge. No force push.
- Commit messages in Korean: `무엇 — 어떻게`, body says why. End with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- User-visible change → one line under `## 다음 버전` in `CHANGELOG.md` plus a `- **DB 이전:**` line (migration file to run, or 없음). Otherwise label the PR `변경기록 없음`.
- Release: rename `다음 버전` → `vX.Y.Z — YYYY-MM-DD`, add an empty `다음 버전`, bump `apps/web/package.json` version + `versionName` (and `versionCode` +1), merge, then `git tag -a vX.Y.Z` on main and push the tag (`release.yml` publishes the GitHub Release). Ask the user before tagging.

## Before any deploy (web prod, Play upload)
Run the Cloudflare `security-audit` skill in **full audit mode with the `standard` profile** on the repo (install if missing: `npx skills add cloudflare/security-audit-skill`). Fix or get the user's sign-off on every confirmed finding before deploying, and report the run directory.

## Android work
Use the `android-skills` plugin (install: `/plugin install android-skills@android-skills`). Invoke the matching skill with the Skill tool before writing code:
- UI: `android-skills:edge-to-edge`, `android-skills:adaptive`, `android-skills:navigation-3`, `android-skills:navigation-event`, `android-skills:jetpack-compose-performance`
- Widget: `android-skills:glance-canonical-layouts`, `android-skills:glance-appwidget-updates-and-memory`
- Security (notification listener, intents, permissions): `android-skills:android-permissions-security`, `android-skills:android-intent-security`
- Build, tests, release: `android-skills:testing-setup`, `android-skills:r8-analyzer`, `android-skills:anr-audit-and-fix`, `android-skills:android-cli`
- Before a Play upload: `android-skills:play-policy-insights`
- Note: `android-skills:agp-9-upgrade` does not support KMP projects; don't use it here.

## Rules
- Keep calc logic identical in `apps/web/src/lib/calc.ts` and `apps/mobile/core/.../calc/Calc.kt`; add a `core` test for any change.
- Schema changes: add a new file in `supabase/migrations/` and mirror it in `schema.sql` (PR check enforces).
- Shared logic and UI live in `core`/`ui`; platform-only features (card notification listener, widgets) go in `androidApp`/`iosApp`.
- iOS targets build only on macOS (`-Pios`).
- Never commit secrets or connection info: `.env*`, keystores, `local.properties`, `google-services.json`, `.vercel/`, Supabase keys/URL, real emails. Only the anon key goes in the app; never the service_role key.

## Status
- Done: web app, Supabase + Google login, Vercel deploy, monorepo, mobile scaffold + calc port (tests pass, debug APK builds), public repo with secret checks and versioning (v0.1.0).
- Pending: run `supabase/migrations/002_performance.sql` and `003_users.sql`; port the screens to Compose; Android Google login (Android OAuth client + SHA-1); card-notification auto-logging, widget, push; Play Console internal testing.
