const POSITION = "ourMoneyPosition";
let finishTraversal: (() => void) | undefined;
let traversalRoute: string | undefined;

export function completeNavigationMotion(href?: string) {
  if (href && traversalRoute !== route(href)) return;
  finishTraversal?.();
  finishTraversal = undefined;
  traversalRoute = undefined;
}

const route = (href: string) => {
  const url = new URL(href, window.location.href);
  return `${url.pathname.replace(/\/$/, "") || "/"}${url.search}`;
};

/** Next의 기록을 보존하며 페이지 앞뒤 방향만 추적한다. 시트·해시 이동은 같은 페이지다. */
export function trackNavigationMotion() {
  const history = window.history;
  const push = history.pushState;
  const replace = history.replaceState;
  let position = history.state?.[POSITION] ?? 0;
  let current = route(window.location.href);
  let replaying = false;
  let generation = 0;
  let transition: ViewTransition | undefined;
  const direction = (value: "forward" | "back") => {
    document.documentElement.dataset.navigation = value;
  };
  replace.call(history, { ...history.state, [POSITION]: position }, "");

  history.pushState = function (data, unused, url) {
    const next = route(url == null ? window.location.href : String(url));
    if (next !== current) {
      position++;
      direction("forward");
    }
    current = next;
    push.call(history, { ...data, [POSITION]: position }, unused, url);
  };
  history.replaceState = function (data, unused, url) {
    current = route(url == null ? window.location.href : String(url));
    replace.call(history, { ...data, [POSITION]: position }, unused, url);
  };
  const onPop = (event: PopStateEvent) => {
    if (replaying) return;
    const next = route(window.location.href);
    const target = event.state?.[POSITION] ?? position;
    const changed = next !== current;
    if (changed) direction(target > position ? "forward" : "back");
    position = target;
    current = next;
    // React는 popstate 복원을 즉시 커밋하므로 브라우저가 먼저 이전 화면을 잡게 한다.
    // 시트 닫기와 시스템 자체 화면 전환은 원래 이벤트를 그대로 전달한다.
    if (!changed || !document.startViewTransition || (event as PopStateEvent & { hasUAVisualTransition?: boolean }).hasUAVisualTransition || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    event.stopImmediatePropagation();
    const request = ++generation;
    transition?.skipTransition();
    completeNavigationMotion();
    transition = document.startViewTransition(() => new Promise<void>((resolve) => {
      if (request !== generation) { resolve(); return; }
      traversalRoute = next;
      const timeout = setTimeout(resolve, 2000);
      finishTraversal = () => { clearTimeout(timeout); resolve(); };
      replaying = true;
      window.dispatchEvent(new PopStateEvent("popstate", { state: event.state }));
      replaying = false;
    }));
    transition.ready.catch(() => {});
  };
  // Next의 popstate 처리보다 먼저 방향을 정한다. 전환을 위해 기록을 추가하지 않는다.
  window.addEventListener("popstate", onPop, true);
  return () => {
    generation++;
    history.pushState = push;
    history.replaceState = replace;
    window.removeEventListener("popstate", onPop, true);
    transition?.skipTransition();
    completeNavigationMotion();
    delete document.documentElement.dataset.navigation;
  };
}
