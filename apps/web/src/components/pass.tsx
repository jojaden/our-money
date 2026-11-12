"use client";

import type { Account, Data, Group, Owner } from "@/lib/types";
import { useData } from "@/lib/store";
import { spendingsIn } from "@/lib/calc";
import { logoOf } from "@/lib/institutions";
import { PersonGlyph } from "./ui";

export const BUCKET: Partial<Record<Group, string>> = { living: "var(--g-living)", allowance: "var(--g-allowance)" };
export const PERSON = { a: "var(--a)", b: "var(--b)", joint: "var(--joint)" } as const;
const DARK = new Set<string>(["black", "red", "green", "blue", "purple"]);

/** 이번 달 이 카드로 쓴 돈의 버킷(많이 쓴 순). 공동 지출 = 생활비, 개인 지출 = 용돈 */
export function cardMix(data: Data, month: string, id: string): Group[] {
  const t = { living: 0, allowance: 0 };
  for (const r of spendingsIn(data, month)) if (r.account_id === id) t[r.owner === "joint" ? "living" : "allowance"] += r.amount;
  return (Object.keys(t) as ("living" | "allowance")[]).filter((k) => t[k] > 0).sort((x, y) => t[y] - t[x]);
}

/** 카드 그림: 신용카드는 고른 색 또는 쓴 버킷 색이 번지고(없으면 흰 카드), 통장은 어두운 바탕에 주인 색 점 */
export function passArt(a: Pick<Account, "kind" | "owner" | "color">, mix: Group[]): { className: string; style: React.CSSProperties } {
  if (a.kind === "bank") return { className: "bank", style: { ["--dot" as string]: PERSON[a.owner] } };
  // 사용자가 고른 색이 있으면 그 색 하나로 (로고 없이 색만, 어두운 색은 흰 글자)
  if (a.color) return { className: `credit tint ${DARK.has(a.color) ? "dark" : ""}`, style: { ["--pt" as string]: `var(--pass-${a.color})` } };
  if (mix.length === 0) return { className: "credit blank", style: {} };
  return { className: "credit", style: { ["--b1" as string]: BUCKET[mix[0]], ["--b2" as string]: BUCKET[mix[1] ?? mix[0]] } };
}

/** 다른 화면에서 카드를 가리키는 작은 카드(36×23) — 지갑과 같은 그림 */
export function MiniCard({ account }: { account: Account }) {
  const { data, month } = useData();
  const art = passArt(account, account.kind === "card" ? cardMix(data, month, account.id) : []);
  return <span className={`mini-pass ${art.className}`} style={art.style} aria-hidden="true" />;
}


/**
 * 통장·카드 왼쪽 위 표시: 은행·카드사·증권사 로고(없으면 이름 첫 글자), 귀퉁이에 주인 반쪽 동전.
 * 기관을 아직 안 적었으면 지금처럼 주인 반쪽 동전만.
 */
export function InstMark({ institution, owner }: { institution: string; owner: Owner }) {
  const name = institution.trim();
  if (!name) {
    return (
      <span className="who-dot">
        <PersonGlyph owner={owner} />
      </span>
    );
  }
  const logo = logoOf(name);
  return (
    <span className="who-dot inst">
      {/* 정적 내보내기라 next/image 최적화가 없다 — 96px 파일을 그대로 */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {logo ? <img src={logo} alt="" width={28} height={28} decoding="async" /> : <span className="inst-initial">{name.replace(/^[A-Za-z]+/, "").slice(0, 1) || name.slice(0, 1)}</span>}
      <span className="inst-owner">
        <PersonGlyph owner={owner} />
      </span>
    </span>
  );
}
