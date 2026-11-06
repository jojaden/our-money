import assert from "node:assert/strict";
import { test } from "node:test";
import { completeNavigationMotion, trackNavigationMotion } from "./navigationMotion.ts";

test("페이지 앞뒤 기록은 시트·해시 기록과 섞여도 방향과 Next 상태를 보존한다", () => {
  const entries = [{ url: "https://example.test/", state: { __NA: true } }];
  const listeners = new Set();
  let index = 0;
  const location = { href: entries[0].url };
  const history = {
    get state() { return entries[index].state; },
    pushState(state, _, url) {
      entries.splice(index + 1);
      entries.push({ state, url: new URL(url ?? location.href, location.href).href });
      location.href = entries[++index].url;
    },
    replaceState(state, _, url) {
      entries[index] = { state, url: new URL(url ?? location.href, location.href).href };
      location.href = entries[index].url;
    },
  };
  globalThis.window = { history, location, addEventListener: (_, fn) => listeners.add(fn), removeEventListener: (_, fn) => listeners.delete(fn) };
  globalThis.document = { documentElement: { dataset: {} } };
  const originalPush = history.pushState;
  const stop = trackNavigationMotion();
  const direction = () => document.documentElement.dataset.navigation;
  const go = (delta) => {
    index += delta;
    location.href = entries[index].url;
    listeners.forEach((fn) => fn({ state: history.state }));
  };
  try {
    history.pushState({ __NA: true, tree: "체크" }, "", "/check/");
    assert.equal(direction(), "forward");
    assert.equal(history.state.tree, "체크");
    history.pushState({ ...history.state, sheet: true, layers: [1] }, "");
    go(-1);
    assert.equal(direction(), "forward");
    assert.equal(history.state.sheet, undefined);
    go(-1);
    assert.equal(direction(), "back");
    go(1);
    assert.equal(direction(), "forward");
    history.pushState({ ...history.state }, "", "#month-close");
    go(-1);
    assert.equal(direction(), "forward");
    history.pushState({ __NA: true }, "", "/calendar/?from=2026-01&to=2026-12");
    go(-1);
    assert.equal(direction(), "back");
    go(1);
    assert.equal(direction(), "forward");
    history.replaceState({ ...history.state, tree: "기간 변경" }, "", "?from=2026-02&to=2026-12");
    go(-1);
    assert.equal(direction(), "back");
  } finally {
    stop();
    assert.equal(history.pushState, originalPush);
    assert.equal(listeners.size, 0);
    delete globalThis.window;
    delete globalThis.document;
  }
});

test("시스템 복귀는 이전 화면 확보 뒤 이벤트를 한 번만 전달하고 커밋 뒤 시작한다", async () => {
  const listeners = new Set();
  const location = { href: "https://example.test/" };
  const history = {
    state: { __NA: true, ourMoneyPosition: 0 },
    pushState(data, _, url) { this.state = data; location.href = new URL(url, location.href).href; },
    replaceState(data) { this.state = data; },
  };
  let update;
  let delivered = 0;
  let captured = 0;
  globalThis.matchMedia = () => ({ matches: false });
  globalThis.PopStateEvent = class { constructor(_, options) { this.state = options.state; } };
  globalThis.window = {
    history, location,
    addEventListener: (_, fn) => listeners.add(fn),
    removeEventListener: (_, fn) => listeners.delete(fn),
    dispatchEvent(event) { listeners.forEach((fn) => fn(event)); delivered++; completeNavigationMotion(); },
  };
  globalThis.document = {
    documentElement: { dataset: {} },
    startViewTransition(callback) { captured++; update = callback; return { ready: Promise.resolve(), skipTransition() {} }; },
  };
  const stop = trackNavigationMotion();
  try {
    history.pushState({ __NA: true }, "", "/check/");
    location.href = "https://example.test/";
    history.state = { __NA: true, ourMoneyPosition: 0 };
    let stopped = false;
    listeners.forEach((fn) => fn({ state: history.state, stopImmediatePropagation() { stopped = true; } }));
    assert.equal(stopped, true);
    assert.equal(captured, 1);
    assert.equal(delivered, 0);
    await update();
    assert.equal(delivered, 1);
    assert.equal(document.documentElement.dataset.navigation, "back");
    // 캡처 전에 뒤로·앞으로를 연달아 누르면 마지막 기록만 복원한다.
    location.href = "https://example.test/check/";
    listeners.forEach((fn) => fn({ state: { ourMoneyPosition: 1 }, stopImmediatePropagation() {} }));
    const canceledUpdate = update;
    location.href = "https://example.test/";
    listeners.forEach((fn) => fn({ state: { ourMoneyPosition: 0 }, stopImmediatePropagation() {} }));
    await canceledUpdate();
    assert.equal(delivered, 1);
    await update();
    assert.equal(delivered, 2);
  } finally {
    stop();
    delete globalThis.window;
    delete globalThis.document;
    delete globalThis.matchMedia;
    delete globalThis.PopStateEvent;
  }
});
