import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

// 실제 훅을 실행하되 React의 ref 보존·effect 설치/정리 수명만 재현한다.
function sheetHarness() {
  const refs = [];
  const listeners = new Map();
  const entries = [{ __NA: true }];
  let at = 0;
  let cursor = 0;
  let effect;
  let cleanup;
  const window = {
    history: {
      get state() { return entries[at]; },
      pushState(state) { entries.splice(at + 1); entries.push(state); at++; },
      back() {
        at--;
        for (const [fn, options] of [...listeners]) {
          if (options?.once) listeners.delete(fn);
          fn();
        }
      },
    },
    addEventListener: (_, fn, options) => listeners.set(fn, options),
    removeEventListener: (_, fn) => listeners.delete(fn),
  };
  const react = {
    useRef(value) {
      const i = cursor++;
      return refs[i] ?? (refs[i] = { current: value });
    },
    useEffect(fn) { effect = fn; },
  };
  const source = readFileSync(new URL("./ui.tsx", import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } });
  const exports = {};
  runInNewContext(outputText, { exports, window, setTimeout, require: (name) => name === "react" ? react : {} });
  return {
    render(open, onClose) {
      cursor = 0;
      exports.useBackToClose(open, onClose);
      cleanup?.();
      cleanup = effect();
    },
    restartEffect() { cleanup?.(); cleanup = effect(); },
    dispose() { cleanup?.(); },
    afterSheet: exports.afterSheet,
    window, entries, listeners,
  };
}

test("열린 날짜·일정 시트의 effect를 재설치해도 뒤로 한 번이면 닫힌다", () => {
  const h = sheetHarness();
  const closed = [];
  h.render(true, (open) => closed.push(open));
  h.restartEffect();
  assert.equal(h.entries.length, 2);
  assert.equal(h.listeners.size, 1);
  assert.equal(h.window.history.state.layers.length, 1);
  h.window.history.back();
  assert.deepEqual(closed, [false]);
  assert.equal(h.window.history.state.sheet, undefined);
  h.dispose();
  assert.equal(h.listeners.size, 0);
});

test("날짜 패널을 닫은 뒤 기록을 정리하고 일정 입력을 연다", async () => {
  const h = sheetHarness();
  h.render(true, () => {});
  let stateWhenEditing;
  h.afterSheet(() => { stateWhenEditing = h.window.history.state; });
  h.render(false, () => {});
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(stateWhenEditing.sheet, undefined);
  assert.equal(stateWhenEditing.__NA, true);
  h.render(true, () => {});
  assert.equal(h.window.history.state.layers.length, 1);
  h.dispose();
});
