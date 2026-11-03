# -*- coding: utf-8 -*-
"""저장소 규칙 점검 (CI 전용). 표준 라이브러리만 쓴다.

  python3 .github/scripts/repo_check.py pr <기준>        PR 이 바꾼 파일로 규칙 점검 (<기준>...HEAD)
  python3 .github/scripts/repo_check.py release <태그>   태그·버전·CHANGELOG 를 맞춰 보고 릴리스 본문을 출력

pr: 앱이 바뀌는 파일을 바꿨는데 CHANGELOG.md 가 그대로면 실패 (SKIP_CHANGELOG=true 면 넘김 — PR 의 '변경기록 없음' 라벨),
    CHANGELOG '다음 버전'에 줄이 있는데 '**DB 이전:**' 줄이 없으면 실패, 마이그레이션을 더했는데 schema.sql 이 그대로면 실패.
release: 태그 vX.Y.Z = apps/web/package.json version = androidApp versionName, CHANGELOG 에 '## vX.Y.Z — YYYY-MM-DD' 절과
    그 줄(DB 이전 줄 포함)이 있어야 한다.
"""
import json
import os
import re
import subprocess
import sys
from typing import List, Tuple

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
# 바꾸면 두 사람이 알아채는 곳 (앱 코드·화면 자원·의존성·DB). docs/·.github/·scripts/ 는 아니다.
USER_FACING = (
    "apps/web/src/", "apps/web/public/", "apps/web/package.json",
    "apps/mobile/core/src/commonMain/", "apps/mobile/ui/src/", "apps/mobile/androidApp/src/",
    "apps/mobile/gradle/libs.versions.toml", "supabase/",
)
SKIP_LABEL = "변경기록 없음"
MIGRATION = r"^- \*\*DB 이전:\*\*"      # 버전마다 있어야 하는 줄 (실행할 SQL 이 없으면 "없음")
WEB_PKG = ("apps", "web", "package.json")
ANDROID_GRADLE = ("apps", "mobile", "androidApp", "build.gradle.kts")


def _read(*parts: str) -> str:
    with open(os.path.join(ROOT, *parts), encoding="utf-8") as f:
        return f.read()


def _section(changelog: str, heading: str) -> str:
    """'## <heading>' 으로 시작하는 절의 본문 (다음 '## ' 앞까지). 없으면 빈 글자."""
    m = re.search(rf"^## {re.escape(heading)}\s*$\n(.*?)(?=^## |\Z)", changelog, re.M | re.S)
    return m.group(1).strip() if m else ""


def pr_problems(changed: List[str], changelog: str, skip_changelog: bool) -> List[str]:
    errors = []
    facing = [f for f in changed if f.startswith(USER_FACING)]
    if facing and "CHANGELOG.md" not in changed and not skip_changelog:
        errors.append(f"앱이 바뀌는 파일을 바꿨는데 CHANGELOG.md 가 그대로입니다 ({', '.join(facing[:5])}"
                      f"{' …' if len(facing) > 5 else ''}). '다음 버전'에 한 줄을 더하거나, 알아챌 변경이 아니면 "
                      f"PR 에 '{SKIP_LABEL}' 라벨을 붙이세요.")
    if "CHANGELOG.md" in changed:
        if not re.search(r"^## 다음 버전\s*$", changelog, re.M):
            errors.append("CHANGELOG.md 에 '## 다음 버전' 절이 없습니다.")
        elif _section(changelog, "다음 버전"):
            if not re.search(MIGRATION, _section(changelog, "다음 버전"), re.M):
                errors.append("CHANGELOG.md '다음 버전'에 '- **DB 이전:**' 줄이 없습니다 (실행할 SQL 이 없으면 '없음').")
        else:                                       # 릴리스 PR: 빈 '다음 버전' 아래 새 버전 절을 본다
            head = re.search(r"^## (v\d+\.\d+\.\d+ — \d{4}-\d{2}-\d{2})\s*$", changelog, re.M)
            if head and not re.search(MIGRATION, _section(changelog, head.group(1)), re.M):
                errors.append(f"CHANGELOG.md '{head.group(1)}' 절에 '- **DB 이전:**' 줄이 없습니다 (없으면 '없음').")
    if any(f.startswith("supabase/migrations/") for f in changed) and "supabase/schema.sql" not in changed:
        errors.append("supabase/migrations/ 를 바꿨는데 supabase/schema.sql 이 그대로입니다. 새로 설치하는 사람도 같은 DB 가 되도록 함께 고치세요.")
    return errors


def versions() -> Tuple[str, str]:
    web = json.loads(_read(*WEB_PKG)).get("version", "")
    m = re.search(r'versionName\s*=\s*"([^"]+)"', _read(*ANDROID_GRADLE))
    return web, m.group(1) if m else ""


def release_notes(tag: str) -> Tuple[List[str], str]:
    errors = []
    if not re.fullmatch(r"v\d+\.\d+\.\d+", tag):
        return [f"태그 '{tag}' 가 vX.Y.Z 형식이 아닙니다."], ""
    ver = tag[1:]
    web, android = versions()
    if web != ver:
        errors.append(f"apps/web/package.json version 이 {web} 입니다 (태그 {tag}).")
    if android != ver:
        errors.append(f"androidApp versionName 이 {android} 입니다 (태그 {tag}).")
    changelog = _read("CHANGELOG.md")
    head = re.search(rf"^## ({re.escape(tag)} — \d{{4}}-\d{{2}}-\d{{2}})\s*$", changelog, re.M)
    if not head:
        errors.append(f"CHANGELOG.md 에 '## {tag} — YYYY-MM-DD' 절이 없습니다.")
        return errors, ""
    body = _section(changelog, head.group(1))
    if not body:
        errors.append(f"CHANGELOG.md '{head.group(1)}' 절이 비어 있습니다.")
    elif not re.search(MIGRATION, body, re.M):
        errors.append(f"CHANGELOG.md '{head.group(1)}' 절에 '- **DB 이전:**' 줄이 없습니다.")
    return errors, body


def main() -> None:
    if len(sys.argv) != 3 or sys.argv[1] not in ("pr", "release"):
        sys.exit(__doc__)
    cmd, arg = sys.argv[1], sys.argv[2]
    if cmd == "pr":
        out = subprocess.run(["git", "-C", ROOT, "diff", "--name-only", f"{arg}...HEAD"],
                             capture_output=True, text=True, check=True).stdout
        changed = [f for f in out.splitlines() if f]
        errors = pr_problems(changed, _read("CHANGELOG.md"), os.environ.get("SKIP_CHANGELOG") == "true")
    else:
        errors, body = release_notes(arg)
        if not errors:
            print(body)
    for e in errors:
        print(f"::error::{e}", file=sys.stderr)
    if errors:
        sys.exit(1)
    if cmd == "pr":
        print("PR 규칙 점검 통과", file=sys.stderr)


if __name__ == "__main__":
    main()
