import assert from "node:assert/strict";
import { test } from "node:test";
import { clockParts, durationText, followEnd, fromMin, joinClock, minuteSteps, nextHour, toMin } from "./clock.ts";

test("바퀴 세 줄과 HH:MM 을 오간다 (자정·정오 포함)", () => {
  assert.deepEqual(clockParts("00:30"), { pm: false, h12: 12, m: 30 });
  assert.deepEqual(clockParts("12:00"), { pm: true, h12: 12, m: 0 });
  assert.deepEqual(clockParts("15:37"), { pm: true, h12: 3, m: 37 });
  assert.equal(joinClock(false, 12, 30), "00:30");
  assert.equal(joinClock(true, 12, 0), "12:00");
  assert.equal(joinClock(true, 3, 37), "15:37");
});

test("분·시각 셈과 길이 글자", () => {
  assert.equal(toMin("09:05"), 545);
  assert.equal(fromMin(545), "09:05");
  assert.equal(fromMin(1440), "");
  assert.equal(durationText(30), "30분");
  assert.equal(durationText(60), "1시간");
  assert.equal(durationText(90), "1시간 30분");
});

test("시작을 옮기면 끝이 같은 길이로 따라가고, 자정을 넘으면 지운다", () => {
  assert.equal(followEnd("15:00", "16:30", "16:00"), "17:30");
  assert.equal(followEnd("15:00", "23:30", "17:00"), "");
  assert.equal(followEnd("", "16:00", "18:00"), "18:00");
  assert.equal(followEnd("15:00", "16:00", ""), "");
});

test("분 바퀴는 5분 단위, 사이 값은 끼워 넣는다", () => {
  assert.equal(minuteSteps(null).length, 12);
  assert.deepEqual(minuteSteps(37).slice(7, 9), [35, 37]);
  assert.equal(nextHour(new Date(2026, 10, 23, 14, 20)), "15:00");
  assert.equal(nextHour(new Date(2026, 10, 23, 23, 40)), "23:00");
});
