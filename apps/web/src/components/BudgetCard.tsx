"use client";

import Link from "next/link";
import type { LivingStatus } from "@/lib/calc";
import { PAY_KIND_LABEL } from "@/lib/types";
import { num } from "@/lib/format";
import { Money, Ring } from "./ui";

/** 예산 대비 남은 돈 — 활동 링 하나와 남은 금액. 공동 생활비(lead)와 내 용돈(compact)에 같이 쓴다. */
export function BudgetCard({
  id,
  title,
  status,
  link,
  compact = false,
  className = "",
  color = "var(--g-living)",
  empty,
}: {
  id: string;
  title: React.ReactNode;
  status: LivingStatus;
  link?: { href: string; label: string };
  compact?: boolean;
  className?: string;
  color?: string;
  empty?: React.ReactNode;
}) {
  const paceDiff = status.pace !== null ? status.spent - status.pace : null;
  const pct = status.budget > 0 ? Math.round((status.spent / status.budget) * 100) : 0;
  return (
    <section className={`card budget ${className}`} aria-labelledby={id}>
      <div className="card-head">
        <h2 id={id}>{title}</h2>
        {link && (
          <Link className="aside" href={link.href}>
            {link.label}
          </Link>
        )}
      </div>
      {status.budget === 0 && status.spent === 0 && empty ? (
        <p className="empty">{empty}</p>
      ) : (
        <>
          <div className="budget-main">
            <div style={{ minWidth: 0 }}>
              <div className="kpi-label">{status.left < 0 ? "예산 초과" : "남은 돈"}</div>
              <div className={`${compact ? "kpi sm" : "kpi"} ${status.left < 0 ? "neg" : ""}`}>
                <Money value={Math.abs(status.left)} animate />
              </div>
              <p className="kpi-sub">
                <Money value={status.budget} /> 중 <Money value={status.spent} /> 사용
              </p>
            </div>
            <Ring
              value={status.spent}
              max={status.budget}
              pace={status.pace}
              size={compact ? 80 : 104}
              stroke={compact ? 10 : 12}
              color={color}
              label={`예산의 ${pct}% 사용`}
              center={
                <>
                  <b className="num">{pct}%</b>
                  <small>사용</small>
                </>
              }
            />
          </div>
          <div className="pace">
            <span className="pace-dot" aria-hidden="true" />
            {paceDiff === null ? (
              "이 달은 오늘 기준 예상선이 없어요"
            ) : paceDiff > 0 ? (
              <span>
                오늘까지 예상보다 <b>{num(paceDiff)}원</b> 더 썼어요
              </span>
            ) : (
              <span>
                오늘까지 예상보다 <b>{num(-paceDiff)}원</b> 덜 썼어요
              </span>
            )}
            {status.perDay !== null && (
              <span className="pace-day">
                하루 <b>{num(status.perDay)}원</b>
              </span>
            )}
          </div>
          <dl className="kinds">
            {(["card", "cash", "transfer"] as const).map((k) => (
              <div key={k}>
                <dt>{PAY_KIND_LABEL[k]}</dt>
                <dd>
                  <Money value={status.byKind[k]} />
                </dd>
              </div>
            ))}
          </dl>
        </>
      )}
    </section>
  );
}
