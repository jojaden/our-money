"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useLayoutEffect, ViewTransition } from "react";
import { completeNavigationMotion } from "@/lib/navigationMotion";

/** 주소가 바뀔 때만 두 화면을 잇는다. 월·체크 갱신은 기존 값 애니메이션에 맡긴다. */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const search = useSearchParams().toString();
  useLayoutEffect(() => completeNavigationMotion(`${path}?${search}`), [path, search]);
  return (
    <ViewTransition key={`${path}?${search}`} name="app-page" default="none" share="page-slide" enter="page-slide" exit="page-slide">
      <div className="route-page">{children}</div>
    </ViewTransition>
  );
}
