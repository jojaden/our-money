"use client";

import type { Account, Data, Group } from "@/lib/types";
import { useData } from "@/lib/store";
import { spendingsIn } from "@/lib/calc";

export const BUCKET: Partial<Record<Group, string>> = { living: "var(--g-living)", allowance: "var(--g-allowance)" };
export const PERSON = { a: "var(--a)", b: "var(--b)", joint: "var(--joint)" } as const;

/** 이번 달 이 카드로 쓴 돈의 버킷(많이 쓴 순). 공동 지출 = 생활비, 개인 지출 = 용돈 */
export function cardMix(data: Data, month: string, id: string): Group[] {
  const t = { living: 0, allowance: 0 };
  for (const r of spendingsIn(data, month)) if (r.account_id === id) t[r.owner === "joint" ? "living" : "allowance"] += r.amount;
  return (Object.keys(t) as ("living" | "allowance")[]).filter((k) => t[k] > 0).sort((x, y) => t[y] - t[x]);
}

/** 카드 그림: 신용카드는 쓴 버킷 색이 번지고(없으면 흰 카드), 통장은 어두운 바탕에 주인 색 점 */
export function passArt(a: Account, mix: Group[]): { className: string; style: React.CSSProperties } {
  if (a.kind === "bank") return { className: "bank", style: { ["--dot" as string]: PERSON[a.owner] } };
  if (mix.length === 0) return { className: "credit blank", style: {} };
  return { className: "credit", style: { ["--b1" as string]: BUCKET[mix[0]], ["--b2" as string]: BUCKET[mix[1] ?? mix[0]] } };
}

/** 다른 화면에서 카드를 가리키는 작은 카드(36×23) — 지갑과 같은 그림 */
export function MiniCard({ account }: { account: Account }) {
  const { data, month } = useData();
  const art = passArt(account, account.kind === "card" ? cardMix(data, month, account.id) : []);
  return <span className={`mini-pass ${art.className}`} style={art.style} aria-hidden="true" />;
}

