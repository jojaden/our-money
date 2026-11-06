import assert from "node:assert/strict";
import { test } from "node:test";
import { cssTimeMs } from "./motion.ts";

test("최적화 전후 CSS 시간은 같은 밀리초가 된다", () => {
  for (const [ms, seconds, expected] of [
    ["1100ms", "1.1s", 1100],
    ["800ms", ".8s", 800],
    ["420ms", ".42s", 420],
    ["260ms", ".26s", 260],
    ["560ms", ".56s", 560],
  ]) {
    assert.equal(cssTimeMs(ms, 999), expected);
    assert.equal(cssTimeMs(` ${seconds} `, 999), expected);
  }
});

test("시간 토큰이 비어 있으면 기존 기본값을 쓴다", () => {
  assert.equal(cssTimeMs("", 800), 800);
});
