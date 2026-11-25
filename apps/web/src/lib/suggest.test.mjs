import assert from "node:assert/strict";
import { test } from "node:test";
import { initials, jamo, matchRank, suggest } from "./suggest.ts";

// 입력 추천 (값은 지어냈다)

test("한글을 자모로 풀고 초성을 뽑는다", () => {
  assert.equal(jamo("관리비"), "ㄱㅗㅏㄴㄹㅣㅂㅣ");
  assert.equal(initials("관리 비"), "ㄱㄹㅂ");
});

test("조합 중인 글자·낱말 앞·초성으로 찾는다", () => {
  assert.equal(matchRank("관리비", "관ㄹ"), 0);
  assert.equal(matchRank("관리비", "과"), 0); // "관"을 치는 중
  assert.equal(matchRank("과자", "괄"), -1);
  assert.equal(matchRank("토스 송금", "송"), 1);
  assert.equal(matchRank("관리비", "ㄱㄹㅂ"), 2);
  assert.equal(matchRank("관리비", "ㄱ"), 0); // 한 글자 초성은 앞에서부터만
  assert.equal(matchRank("치과", "ㄱ"), -1);
  assert.equal(matchRank("Netflix", "net"), 0);
});

test("많이 쓴 것 → 최근 것, 친 글과 같은 글·이미 있는 글은 빼고 가장 최근 기록을 준다", () => {
  const seen = [
    { text: "치과 정기검진", at: "2026-01-01", item: 1 },
    { text: "치과", at: "2026-03-01", item: 2 },
    { text: "치과", at: "2026-05-01", item: 3 },
    { text: "치킨", at: "2026-06-01", item: 4 },
  ];
  assert.deepEqual(suggest(seen, "치").map((s) => [s.text, s.item, s.count]), [["치과", 3, 2], ["치킨", 4, 1], ["치과 정기검진", 1, 1]]);
  assert.deepEqual(suggest(seen, "치과").map((s) => s.text), ["치과 정기검진"]);
  assert.deepEqual(suggest(seen, "치", { exclude: ["치킨"] }).map((s) => s.text), ["치과", "치과 정기검진"]);
  assert.deepEqual(suggest(seen, " "), []);
  // 끝까지 친 글도 칩으로 (고르면 지난 값까지 채우는 칸) — 맨 앞에
  assert.deepEqual(suggest(seen, "치과", { keepExact: true }).map((s) => s.text), ["치과", "치과 정기검진"]);
});
