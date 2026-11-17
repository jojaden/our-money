import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { KR_HOLIDAYS, isHoliday } from "./holidays.ts";

// 공휴일 표가 웹과 안드로이드(core Holidays.kt)에서 같은지, 몇 날짜가 맞는지

test("웹과 Kotlin 의 공휴일 표가 같다", () => {
  const kt = readFileSync(new URL("../../../mobile/core/src/commonMain/kotlin/com/jojaden/ourmoney/core/calc/Holidays.kt", import.meta.url), "utf8");
  const fromKt = Object.fromEntries([...kt.matchAll(/(\d{4}) to "([\d ]+)"/g)].map((m) => [Number(m[1]), m[2]]));
  assert.deepEqual(fromKt, KR_HOLIDAYS);
});

test("설·추석·대체공휴일·선거일", () => {
  assert.equal(isHoliday("2026-02-17"), true); // 설날
  assert.equal(isHoliday("2026-09-25"), true); // 추석
  assert.equal(isHoliday("2026-10-05"), true); // 개천절 대체공휴일
  assert.equal(isHoliday("2026-06-03"), true); // 지방선거
  assert.equal(isHoliday("2026-10-06"), false);
  assert.equal(isHoliday("2031-01-01"), false); // 표 밖의 해는 보지 않는다
});
