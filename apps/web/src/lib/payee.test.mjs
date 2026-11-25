import assert from "node:assert/strict";
import { test } from "node:test";
import { accountNumberIn, payeeOf } from "./payee.ts";

// 받는 곳 글 → 복사할 계좌번호 (값은 지어냈다)

test("계좌번호는 숫자만 뽑는다", () => {
  assert.equal(accountNumberIn("관리사무소 · 예시은행 000-000-000000"), "000000000000");
  assert.equal(accountNumberIn("집주인 1234 5678 9012"), "123456789012");
  assert.equal(accountNumberIn("부모님 12345678"), "12345678");
});

test("짧은 숫자는 계좌번호가 아니다", () => {
  assert.equal(accountNumberIn("101동 1203호 관리비"), null);
  assert.equal(accountNumberIn("부모님"), null);
});

test("받는 곳: 내 통장이면 이름, 글이면 글과 계좌번호", () => {
  const accounts = [{ id: "acc-save", name: "공동 적금" }];
  assert.deepEqual(payeeOf({ to_account_id: "acc-save", to_name: "" }, accounts), { text: "공동 적금", copy: null });
  assert.deepEqual(payeeOf({ to_account_id: null, to_name: " 부모님 · 예시은행 0000-00-0000000 " }, accounts), { text: "부모님 · 예시은행 0000-00-0000000", copy: "0000000000000" });
  assert.equal(payeeOf({ to_account_id: null, to_name: "" }, accounts), null);
  // 지운 통장은 보이지 않는다
  assert.equal(payeeOf({ to_account_id: "gone", to_name: "" }, accounts), null);
});
