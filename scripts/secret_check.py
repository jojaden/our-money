# -*- coding: utf-8 -*-
"""비밀값·연결 정보·개인 자료가 저장소에 들어가지 않게 막는다. 표준 라이브러리만 쓴다.

  python3 scripts/secret_check.py            추적 중인 모든 파일 (CI)
  python3 scripts/secret_check.py --staged   커밋하려는 파일과 더하는 줄 (pre-commit 훅)

막는 것
  - 파일: .env*(.env.example 제외), 키스토어(*.jks · *.keystore · keystore.properties), local.properties,
    google-services.json, GoogleService-Info.plist, .vercel/, *.pem · *.p12 · *.key, 로컬 에이전트 폴더(.agents/ · .claude/)
  - 내용: Supabase 키(JWT · sb_secret_ · sb_publishable_)와 실제 프로젝트 주소, Google OAuth 시크릿 · API 키,
    GitHub · Vercel · Slack · AWS · OpenAI · Anthropic 토큰, 개인 키, 비밀번호가 든 DB 접속 주소, 허용 목록 밖의 이메일
훅 켜기: git config core.hooksPath .githooks   급할 때 건너뛰기: git commit --no-verify (CI 는 그래도 막는다)
"""
import argparse
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SELF = "scripts/secret_check.py"

BLOCKED_PATHS = [
    (re.compile(r"(^|/)\.env(\.(?!example$)[^/]+)?$"), "환경 변수 파일"),
    (re.compile(r"\.(jks|keystore|pem|p12|key)$"), "키·인증서 파일"),
    (re.compile(r"(^|/)keystore\.properties$"), "서명 설정"),
    (re.compile(r"(^|/)local\.properties$"), "로컬 SDK 경로"),
    (re.compile(r"(^|/)google-services\.json$"), "Firebase 설정"),
    (re.compile(r"(^|/)GoogleService-Info\.plist$"), "Firebase 설정"),
    (re.compile(r"(^|/)\.vercel/"), "Vercel 연결 정보"),
    (re.compile(r"(^|/)\.(agents|claude)/"), "로컬 에이전트 폴더"),
]

PLACEHOLDER = re.compile(r"x{3,}|<[^>]+>|your[-_]|example", re.I)
CONTENT = [
    (re.compile(r"eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}"), "JWT (Supabase anon·service_role 키)"),
    (re.compile(r"sb_(secret|publishable)_[A-Za-z0-9_-]{16,}"), "Supabase API 키"),
    (re.compile(r"https://([a-z0-9]{20})\.supabase\.co"), "Supabase 프로젝트 주소"),
    (re.compile(r"GOCSPX-[A-Za-z0-9_-]{20,}"), "Google OAuth 클라이언트 시크릿"),
    (re.compile(r"AIza[0-9A-Za-z_-]{35}"), "Google API 키"),
    (re.compile(r"\b(gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{40,})"), "GitHub 토큰"),
    (re.compile(r"\b(vcp|vci|vca|vcr|vck)_[A-Za-z0-9]{20,}"), "Vercel 토큰"),
    (re.compile(r"\bxox[abprs]-[A-Za-z0-9-]{10,}"), "Slack 토큰"),
    (re.compile(r"\b(AKIA|ASIA)[0-9A-Z]{16}\b"), "AWS 액세스 키"),
    (re.compile(r"\bsk-(ant-|proj-)?[A-Za-z0-9_-]{32,}"), "OpenAI·Anthropic 키"),
    (re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----"), "개인 키"),
    (re.compile(r"\b(postgres(ql)?|mysql|mongodb(\+srv)?|redis)://[^\s:/@]+:[^\s@/]{3,}@"), "비밀번호가 든 DB 주소"),
    (re.compile(r"(?i)\b(password|passwd|secret|api_?key|access_?token)\s*[:=]\s*[\"'][^\"'\s]{8,}[\"']"), "하드코딩된 비밀값"),
]
EMAIL = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
EMAIL_OK = re.compile(
    r"@(example\.(com|org|net)|users\.noreply\.github\.com|anthropic\.com)$"
    r"|^(first|second)-person@gmail\.com$|^noreply@|^git@github\.com$",
    re.I,
)
# 내용 검사를 건너뛰는 파일: 바이너리, 의존성 잠금 파일(패키지 저자 이메일), 이 파일
SKIP_CONTENT = re.compile(r"\.(png|jpe?g|gif|webp|ico|woff2?|ttf|otf|jar|zip)$|(^|/)package-lock\.json$|^" + re.escape(SELF) + "$")


def git(*args: str) -> str:
    return subprocess.run(["git", "-C", ROOT, *args], capture_output=True, text=True, check=True).stdout


def path_problems(paths):
    out = []
    for p in paths:
        for rx, label in BLOCKED_PATHS:
            if rx.search(p):
                out.append(f"{p}: {label}은(는) 저장소에 올리지 않습니다 (.gitignore)")
                break
    return out


def line_problems(path, lineno, line):
    out = []
    for rx, label in CONTENT:
        for m in rx.finditer(line):
            if PLACEHOLDER.search(m.group(0)):
                continue
            out.append(f"{path}:{lineno}: {label} — {m.group(0)[:12]}…")
    for m in EMAIL.finditer(line):
        if not EMAIL_OK.search(m.group(0)):
            out.append(f"{path}:{lineno}: 이메일 주소 — {m.group(0)[:3]}…  (예시는 @example.com 으로)")
    return out


def check_tracked():
    paths = [p for p in git("ls-files", "-z").split("\0") if p]
    problems = path_problems(paths)
    for p in paths:
        if SKIP_CONTENT.search(p) or not os.path.isfile(os.path.join(ROOT, p)):
            continue
        try:
            with open(os.path.join(ROOT, p), encoding="utf-8") as f:
                for i, line in enumerate(f, 1):
                    problems += line_problems(p, i, line)
        except UnicodeDecodeError:
            continue
    return problems


def check_staged():
    paths = [p for p in git("diff", "--cached", "--name-only", "-z", "--diff-filter=ACMR").split("\0") if p]
    problems = path_problems(paths)
    current, lineno = None, 0
    for line in git("diff", "--cached", "-U0", "--no-color", "--diff-filter=ACMR").splitlines():
        if line.startswith("+++ "):
            current = line[6:] if line.startswith("+++ b/") else None
        elif line.startswith("@@"):
            m = re.search(r"\+(\d+)", line)
            lineno = int(m.group(1)) if m else 0
        elif line.startswith("+") and current and not SKIP_CONTENT.search(current):
            problems += line_problems(current, lineno, line[1:])
            lineno += 1
    return problems


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--staged", action="store_true", help="커밋하려는 변경만 검사 (pre-commit)")
    args = ap.parse_args()
    problems = check_staged() if args.staged else check_tracked()
    if problems:
        print("비밀값·연결 정보로 보이는 것이 있어 멈춥니다:", file=sys.stderr)
        for p in problems:
            print("  " + p, file=sys.stderr)
        print("실제 값은 .env.local · local.properties 같은 무시되는 파일이나 GitHub Secrets 에 두세요.", file=sys.stderr)
        sys.exit(1)
    print("비밀값 검사 통과")


if __name__ == "__main__":
    main()
