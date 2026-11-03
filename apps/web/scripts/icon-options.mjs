// 아이콘 후보 비교 페이지: node scripts/icon-options.mjs → public/icon-options.html
import { writeFileSync } from "node:fs";
import { designs, iconSvg } from "./icon-designs.mjs";

const cards = Object.entries(designs)
  .map(([k, d], i) => {
    const sizes = [104, 68, 48];
    const icons = sizes.map((s, j) => `<span style="width:${s}px;height:${s}px">${iconSvg(k, { size: s, id: `-${i}-${j}` })}</span>`).join("");
    return `
  <section>
    <h2>${k}. ${d.name}${k === "F1" ? " <em>추천</em>" : ""}</h2>
    <p class="note">${d.note}</p>
    <div class="phone dark">${icons}</div>
    <div class="phone light">${sizes.map((s, j) => `<span style="width:${s}px;height:${s}px">${iconSvg(k, { size: s, id: `-l${i}-${j}` })}</span>`).join("")}</div>
  </section>`;
  })
  .join("");

writeFileSync(
  "public/icon-options.html",
  `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>아이콘 후보</title>
<link rel="stylesheet" href="/fonts/pretendard/pretendard.css">
<style>
body{margin:0;padding:24px 20px 60px;background:#f2f2f7;color:#1c1c1e;font-family:"Pretendard Variable",system-ui,sans-serif}
h1{font-size:28px;margin:0 0 6px;letter-spacing:-.02em}p{color:#6e6e73;margin:0 0 24px}
section{background:#fff;border-radius:22px;padding:20px;margin-bottom:16px}
h2{font-size:18px;margin:0 0 6px}h2 em{font-style:normal;font-size:12px;background:#e6f0fc;color:#0b5bbf;padding:3px 8px;border-radius:999px;margin-left:6px;vertical-align:2px}
.note{font-size:14px;margin:0 0 14px}
.phone{display:flex;align-items:flex-end;gap:22px;padding:22px;border-radius:16px;margin-top:10px}
.phone.dark{background:#22303f}.phone.light{background:#dfe6ef}
.phone span{display:block;filter:drop-shadow(0 4px 10px rgb(0 0 0 / .18))}.phone svg{display:block;width:100%;height:100%}
</style></head><body>
<h1>아이콘 후보</h1><p>어두운·밝은 배경화면 위에서 큰·중간·작은 크기로 본 모습이에요.</p>
${cards}
</body></html>`,
);
console.log("wrote public/icon-options.html");
