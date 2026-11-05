// 모아 보기 화면(/calendar/?from=…&to=…)으로 가고 오기.
// 달력에서 밀어 넣었으면 돌아갈 때 뒤로가기를 써서 기록이 쌓이지 않게 하고, 주소로 바로 열었으면 달력으로 바꿔 놓는다.

import type { useRouter } from "next/navigation";

type Router = ReturnType<typeof useRouter>;

let pushed = false;

/** 모아 보기로 — 이미 모아 보기에서 기간만 바꾸면 replace */
export function enterSummary(router: Router, href: string, replace: boolean) {
  if (replace) router.replace(href);
  else {
    pushed = true;
    router.push(href);
  }
}

/** 모아 보기에서 달력으로 */
export function leaveSummary(router: Router) {
  if (pushed) {
    pushed = false;
    router.back();
  } else router.replace("/calendar/");
}

/** 달력 화면이 다시 보이면(시스템 뒤로가기 포함) 잊는다 */
export function resetSummary() {
  pushed = false;
}
