// 화면 캡처: node scripts/shots.mjs [base-url] — 각 탭과 시트 상태를 .impeccable/review 에 저장
import { Browser } from "/home/jaden/.claude/plugins/cache/taste-skill/taste-skill/2.1.5/skills/taste-skill/scripts/lib/cdp.mjs";

const base = process.argv[2] ?? "http://localhost:4321";
const out = ".impeccable/review";
const b = await Browser.launch();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const routes = [["home", "/"], ["plan", "/plan/"], ["check", "/check/"], ["ledger", "/ledger/"], ["settings", "/settings/"]];
for (const [w, h, tag, mobile] of [[390, 844, "mobile", true], [1440, 900, "desktop", false]]) {
  const p = await b.newPage({ width: w, height: h, dsf: mobile ? 2 : 1, mobile });
  for (const [name, path] of routes) {
    await p.goto(base + path, { settleMs: 1800 });
    await p.screenshot({ path: `${out}/${tag}-${name}.png`, format: "png", fullPage: true });
  }
  // 지출 기록 시트
  await p.goto(base + "/", { settleMs: 1800 });
  await p.eval(() => [...document.querySelectorAll("button")].find((x) => x.textContent?.includes("지출 기록"))?.click());
  await sleep(900);
  await p.eval(() => {
    const i = document.querySelector("#sp-amount");
    if (i) {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      set.call(i, "18500");
      i.dispatchEvent(new Event("input", { bubbles: true }));
    }
  });
  await sleep(300);
  await p.screenshot({ path: `${out}/${tag}-sheet-spending.png`, format: "png" });
  // 플랜 항목 시트
  await p.goto(base + "/plan/", { settleMs: 1800 });
  await p.eval(() => [...document.querySelectorAll("button.row")].find((x) => x.textContent?.includes("월세"))?.click());
  await sleep(900);
  await p.screenshot({ path: `${out}/${tag}-sheet-item.png`, format: "png" });
  // 체크 탭에서 이체 펼치기
  await p.goto(base + "/check/", { settleMs: 1800 });
  await p.eval(() => document.querySelector("button[aria-expanded]")?.click());
  await sleep(400);
  await p.screenshot({ path: `${out}/${tag}-check-expanded.png`, format: "png" });
  await p.close();
}
await b.close();
console.log("done");
