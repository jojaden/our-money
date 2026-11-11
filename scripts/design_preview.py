#!/usr/bin/env python3
"""디자인 시스템 미리보기 — docs/design-system 의 토큰과 컴포넌트 미리보기를 한 페이지로 묶는다.

    python3 scripts/design_preview.py          → docs/design-system/index.html 을 브라우저로 연다
    python3 scripts/design_preview.py --check  → 앱 tokens.css 가 tokens.json 과 같은지만 본다 (CI)

돌릴 때마다 앱이 읽는 apps/web/src/app/tokens.css 도 tokens.json 에서 다시 만든다 (커밋한다).

components/<이름>/preview.html 은 토큰 CSS 변수(--ground, --font-display …)를 쓰는 조각이라
그대로 열면 색과 글꼴이 빠진다. tokens.json 을 CSS 변수로 바꿔 조각마다 iframe 에 넣는다.
만든 index.html 은 커밋하지 않는다(.gitignore) — 토큰이나 미리보기를 고치면 다시 돌린다.
"""
import html
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DS = ROOT / "docs" / "design-system"
APP_TOKENS = ROOT / "apps" / "web" / "src" / "app" / "tokens.css"
FAMILIES = ("color", "spacing", "radius", "shadow", "easing", "duration")


def token_decls(tokens: dict) -> list[str]:
    """토큰 → '--이름: 값' 목록. 값 안의 {이름} 은 var(--이름) 으로 바꾼다."""
    out = []
    for fam in FAMILIES:
        for t in tokens[fam]["tokens"]:
            value = re.sub(r"\{([\w-]+)\}", r"var(--\1)", str(t["value"]))
            out.append(f"--{t['name']}: {value}")
    return out + [f"--font-{k}: {v}" for k, v in tokens["type"]["families"].items()]


def css_vars(tokens: dict) -> str:
    """미리보기 iframe 에 넣는 한 줄짜리 :root."""
    return ":root{" + ";".join(token_decls(tokens)) + "}"


def dark_decls(tokens: dict) -> list[str]:
    """다크 테마에서 바뀌는 토큰만 (토큰의 dark 값). 없는 토큰은 라이트 값을 그대로 쓴다."""
    out = []
    for fam in FAMILIES:
        for t in tokens[fam]["tokens"]:
            if "dark" in t:
                out.append(f"--{t['name']}: " + re.sub(r"\{([\w-]+)\}", r"var(--\1)", str(t["dark"])))
    return out


def tokens_css(tokens: dict) -> str:
    """앱이 읽는 tokens.css 본문. 테마는 <html data-theme="light|dark|system"> 이 고른다 (apps/web/src/lib/theme.ts)."""
    body = "".join(f"  {d};\n" for d in token_decls(tokens))
    dark = "".join(f"  {d};\n" for d in dark_decls(tokens))
    dark_in_media = "".join(f"    {d};\n" for d in dark_decls(tokens))
    return ("/* docs/design-system/tokens.json 에서 만든 파일. 손으로 고치지 말고 tokens.json 을 고친 뒤\n"
            "   python3 scripts/design_preview.py 를 돌린다 (CI 가 --check 로 어긋남을 막는다). */\n"
            f":root {{\n  color-scheme: light;\n{body}}}\n"
            f":root[data-theme=\"dark\"] {{\n  color-scheme: dark;\n{dark}}}\n"
            "@media (prefers-color-scheme: dark) {\n"
            f"  :root[data-theme=\"system\"] {{\n    color-scheme: dark;\n{dark_in_media}  }}\n}}\n")


def card(path: Path, root: str) -> tuple[str, str]:
    """미리보기 하나 → (묶음 이름, 카드 HTML). 첫 줄 <!-- @dsCard group="…" height=… subtitle="…" --> 을 읽는다."""
    body = path.read_text(encoding="utf-8")
    attr = {k: a or b for k, a, b in re.findall(r'(\w+)=(?:"([^"]*)"|(\d+))', body.split("\n", 1)[0])}
    name = path.parent.name
    doc = f'<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>{root}</style></head><body>{body}</body></html>'
    link = f' · <a href="components/{name}/README.md">규칙</a>' if (path.parent / "README.md").exists() else ""
    return attr.get("group", "표지"), (
        f'<figure><figcaption><b>{name}</b>{link}<span>{html.escape(attr.get("subtitle", ""))}</span></figcaption>'
        f'<iframe title="{name}" loading="lazy" style="height:{int(attr.get("height", 400))}px" srcdoc="{html.escape(doc, quote=True)}"></iframe></figure>'
    )


def swatches(tokens: dict) -> str:
    """색 토큰 견본. 다른 토큰을 가리키는 값은 끝까지 따라가 실제 색을 적는다."""
    colors = {t["name"]: t["value"] for t in tokens["color"]["tokens"]}
    resolve = lambda v: resolve(colors[v[1:-1]]) if v.startswith("{") else v
    return "".join(
        f'<div class="sw"><i style="background:var(--{n})"></i><b>{n}</b><code>{resolve(v)}</code></div>' for n, v in colors.items()
    )


def main() -> None:
    tokens = json.loads((DS / "tokens.json").read_text(encoding="utf-8"))
    if "--check" in sys.argv:
        if not APP_TOKENS.exists() or APP_TOKENS.read_text(encoding="utf-8") != tokens_css(tokens):
            sys.exit(f"{APP_TOKENS.relative_to(ROOT)} 가 tokens.json 과 다릅니다. python3 scripts/design_preview.py 를 돌려 다시 만드세요.")
        print("tokens.css = tokens.json")
        return
    APP_TOKENS.write_text(tokens_css(tokens), encoding="utf-8")
    root = css_vars(tokens)
    groups: dict[str, list[str]] = {}
    for p in sorted(DS.glob("components/*/preview.html")):
        g, html_card = card(p, root)
        groups.setdefault(g, []).append(html_card)
    sections = "".join(f"<h2>{g}</h2><div class='grid'>{''.join(cs)}</div>" for g, cs in sorted(groups.items(), key=lambda x: x[0] != "표지"))
    page = f"""<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>우리 집 가계부 디자인 시스템</title><style>{root}
body{{margin:0;padding:24px 20px 60px;background:var(--ground);color:var(--text);font-family:var(--font-text);word-break:keep-all}}
h1{{margin:0;font-size:28px}} h2{{margin:40px 0 12px;font-size:18px}} p.lead{{color:var(--muted);margin:8px 0 0}}
a{{color:var(--accent-ink)}} code{{font-size:12px;color:var(--faint)}}
.grid{{display:grid;grid-template-columns:repeat(auto-fill,minmax(440px,1fr));gap:16px;align-items:start}}
figure{{margin:0;background:var(--surface);border-radius:16px;box-shadow:var(--shadow-card);overflow:hidden}}
figcaption{{display:grid;gap:2px;padding:12px 16px;font-size:13px;color:var(--faint)}} figcaption b{{color:var(--text);font-size:15px}}
iframe{{display:block;width:100%;border:0}}
.sws{{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:8px}}
.sw{{display:grid;grid-template-columns:28px 1fr;column-gap:10px;align-items:center;padding:8px;background:var(--surface);border-radius:12px;font-size:13px}}
.sw i{{grid-row:span 2;width:28px;height:28px;border-radius:8px;box-shadow:inset 0 0 0 1px #0000001a}}
</style></head><body>
<h1>우리 집 가계부 디자인 시스템</h1>
<p class="lead">규칙은 <a href="README.md">README.md</a>, 값은 <a href="tokens.json">tokens.json</a>. 고친 뒤 <code>python3 scripts/design_preview.py</code> 로 이 페이지를 다시 만든다.</p>
<h2>색</h2><div class="sws">{swatches(tokens)}</div>{sections}
</body></html>"""
    (DS / "index.html").write_text(page, encoding="utf-8")
    print(f"{DS / 'index.html'} — 미리보기 {sum(map(len, groups.values()))}개, {APP_TOKENS.relative_to(ROOT)} 도 다시 만듦")


if __name__ == "__main__":
    main()
