import assert from "node:assert/strict";
import { test } from "node:test";
import { categoryVisual, guessFromMemo } from "./categories.ts";

// 분류 이름 → 그림, 메모 → 분류 (값은 지어냈다)

test("분류 이름에 맞는 그림", () => {
  assert.equal(categoryVisual("카페·간식").icon, "coffee");
  assert.equal(categoryVisual("쇼핑·의류").icon, "bag");
  assert.equal(categoryVisual("여행·숙박").icon, "plane");
  assert.equal(categoryVisual("문화·여가").icon, "ticket");
  assert.equal(categoryVisual("이체·송금").icon, "transfer");
  assert.equal(categoryVisual("모르는 이름").icon, "tag");
  assert.equal(categoryVisual(null).icon, "receipt");
});

const data = (names) => ({ spendings: [], categories: names.map((name, i) => ({ id: `c${i}`, name, budget: 0, sort: i })) });

test("메모로 분류 — 그 분류가 있는 첫 규칙을 따른다", () => {
  const all = data(["외식·배달", "카페·간식", "쇼핑·의류", "여행·숙박", "문화·여가", "이체·송금"]);
  const name = (memo, d = all) => d.categories.find((c) => c.id === guessFromMemo(d, memo).category_id)?.name ?? null;
  assert.equal(name("스타벅스"), "카페·간식");
  assert.equal(name("무신사"), "쇼핑·의류");
  assert.equal(name("제주 호텔"), "여행·숙박");
  assert.equal(name("CGV"), "문화·여가");
  assert.equal(name("메가박스"), "문화·여가");
  assert.equal(name("메가커피"), "카페·간식");
  assert.equal(name("엄마 송금"), "이체·송금");
  // 여행 분류가 없으면 숙소·호텔은 전처럼 문화·여가로
  assert.equal(name("제주 호텔", data(["문화·여가"])), "문화·여가");
  // 카페 분류가 없으면 커피는 외식으로
  assert.equal(name("스타벅스", data(["외식·배달"])), "외식·배달");
});
