import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { KR_HOLIDAYS, holidayName, isHoliday, specialDayName } from "./holidays.ts";

// 공휴일 표가 웹과 안드로이드(core Holidays.kt)에서 같은지, 몇 날짜가 맞는지

test("웹과 Kotlin 의 공휴일 표가 같다", () => {
  const kt = readFileSync(new URL("../../../mobile/core/src/commonMain/kotlin/com/jojaden/ourmoney/core/calc/Holidays.kt", import.meta.url), "utf8");
  const fromKt = Object.fromEntries([...kt.matchAll(/(\d{4}) to "([\d ]+)"/g)].map((m) => [Number(m[1]), m[2]]));
  assert.deepEqual(fromKt, KR_HOLIDAYS);
});

test("웹과 Kotlin 의 기념일 표가 같다 (위젯 초록)", () => {
  const kt = readFileSync(new URL("../../../mobile/core/src/commonMain/kotlin/com/jojaden/ourmoney/core/calc/Holidays.kt", import.meta.url), "utf8");
  const days = new Set(kt.match(/KR_SPECIAL_DAYS = "([\d ]+)"/)[1].split(" "));
  // 2028(윤년) 하루하루: 웹이 기념일이라 하는 날 = Kotlin 표에 있고 공휴일이 아닌 날
  for (let t = Date.UTC(2028, 0, 1); t < Date.UTC(2029, 0, 1); t += 864e5) {
    const d = new Date(t).toISOString().slice(0, 10);
    assert.equal(specialDayName(d) !== null, days.has(d.slice(5, 7) + d.slice(8, 10)) && !isHoliday(d), d);
  }
});

test("설·추석·대체공휴일·선거일", () => {
  assert.equal(isHoliday("2026-02-17"), true); // 설날
  assert.equal(isHoliday("2026-09-25"), true); // 추석
  assert.equal(isHoliday("2026-10-05"), true); // 개천절 대체공휴일
  assert.equal(isHoliday("2026-06-03"), true); // 지방선거
  assert.equal(isHoliday("2026-10-06"), false);
  assert.equal(isHoliday("2031-01-01"), false); // 표 밖의 해는 보지 않는다
});

test("공휴일마다 이름이 있다 (달력 칸)", () => {
  for (const [y, days] of Object.entries(KR_HOLIDAYS))
    for (const md of days.split(" ")) assert.notEqual(holidayName(`${y}-${md.slice(0, 2)}-${md.slice(2)}`), "공휴일", `${y}${md} 이름 없음`);
  assert.equal(holidayName("2026-12-25"), "크리스마스");
  assert.equal(holidayName("2026-02-17"), "설날");
  assert.equal(holidayName("2026-09-24"), "추석");
  assert.equal(holidayName("2026-05-05"), "어린이날");
  assert.equal(holidayName("2026-10-05"), "대체공휴일");
  assert.equal(holidayName("2026-10-06"), null);
});

test("기념일 (쉬는 날 아님)", () => {
  assert.equal(specialDayName("2026-12-24"), "크리스마스 이브");
  assert.equal(specialDayName("2026-11-11"), "빼빼로데이");
  assert.equal(specialDayName("2026-03-14"), "화이트데이");
  assert.equal(specialDayName("2026-05-08"), "어버이날");
  assert.equal(specialDayName("2026-12-25"), null); // 공휴일이 먼저
  assert.equal(specialDayName("2026-11-12"), null);
});
