"use client";

import { useEffect, useState } from "react";
import type { Data, HistoryRow, Owner } from "@/lib/types";
import { GROUP_LABEL, METHOD_LABEL, PAY_KIND_LABEL, REPEAT_LABEL } from "@/lib/types";
import { useData } from "@/lib/store";
import { nameOf } from "@/lib/calc";
import { dayLabel, monthLabel, num, shortDate, ymd } from "@/lib/format";
import { HISTORY_PAGE } from "@/lib/repo";
import { PersonGlyph, Sheet } from "./ui";

const TABLE: Record<string, string> = {
  spendings: "지출",
  month_items: "이번 달 항목",
  plan_items: "플랜 항목",
  accounts: "카드·통장",
  categories: "분류",
  months: "달",
  settings: "설정",
  checks: "체크",
  users: "이름",
  events: "일정",
};

const FIELD: Record<string, string> = {
  amount: "금액",
  paid_amount: "실제 낸 금액",
  name: "이름",
  memo: "메모",
  note: "메모",
  date: "날짜",
  category_id: "분류",
  account_id: "계좌·카드",
  card_id: "카드",
  billing_account_id: "결제 계좌",
  owner: "누구 돈",
  payer: "누구 돈",
  pay_kind: "결제수단",
  method: "나가는 방식",
  group: "종류",
  due_day: "날짜",
  pay_day: "결제일",
  paid: "완료",
  budget: "예산",
  installment_months: "할부",
  tags: "태그",
  review: "확인 필요",
  start_month: "시작 달",
  end_month: "끝 달",
  goal_amount: "목표",
  income_a: "수입",
  income_b: "수입",
  extra_income: "추가 수입",
  closed_at: "마감",
  active: "반복",
  archived: "숨김",
  institution: "카드사·은행",
  last4: "끝 4자리",
  color: "색",
  salary_a: "월급",
  salary_b: "월급",
  payday_a: "월급날",
  payday_b: "월급날",
  ratio_a: "나누는 비율",
  name_a: "이름",
  name_b: "이름",
  title: "이름",
  start_date: "시작",
  end_date: "끝",
  repeat: "반복",
  dday: "D-day",
  pin: "알림 모음 고정",
  remind_days: "미리 알림",
  todo: "할 일",
};

const MONEY = new Set(["amount", "paid_amount", "budget", "goal_amount", "goal_start", "income_a", "income_b", "extra_income", "salary_a", "salary_b"]);
/** 사람이 볼 필요 없는 칸 (트리거가 채우거나 화면 순서) */
const HIDDEN = new Set(["id", "rev", "created_at", "created_by", "updated_at", "updated_by", "sort", "paid_at", "paid_by", "source", "approval_no"]);

function value(data: Data, key: string, v: unknown): string {
  if (v == null || v === "") return "없음";
  if (MONEY.has(key) && typeof v === "number") return `${num(v)}원`;
  if (key === "category_id") return data.categories.find((c) => c.id === v)?.name ?? "지운 분류";
  if (key === "account_id" || key === "card_id" || key === "billing_account_id") return data.accounts.find((a) => a.id === v)?.name ?? "지운 카드·통장";
  if (key === "owner" || key === "payer") return nameOf(data.settings, v as Owner);
  if (key === "pay_kind") return PAY_KIND_LABEL[v as keyof typeof PAY_KIND_LABEL] ?? String(v);
  if (key === "method") return METHOD_LABEL[v as keyof typeof METHOD_LABEL] ?? String(v);
  if (key === "group") return GROUP_LABEL[v as keyof typeof GROUP_LABEL] ?? String(v);
  if (key === "date" || key === "start_date" || key === "end_date") return shortDate(String(v));
  if (key === "repeat") return REPEAT_LABEL[v as keyof typeof REPEAT_LABEL] ?? String(v);
  if (key === "remind_days") return Number(v) === 0 ? "당일" : `${v}일 전`;
  if (key === "start_month" || key === "end_month") return monthLabel(String(v));
  if (key === "installment_months") return Number(v) > 1 ? `${v}개월` : "일시불";
  if (key === "closed_at") return "마감함";
  if (typeof v === "boolean") return v ? "예" : "아니오";
  if (Array.isArray(v)) return v.length ? v.join(", ") : "없음";
  const t = String(v);
  return t.length > 20 ? `${t.slice(0, 20)}…` : t;
}

/** 어떤 줄이 바뀌었나 — 기록에 이름이 없으면(수정은 바뀐 칸만 남는다) 지금 데이터에서 찾는다 */
function subject(data: Data, h: HistoryRow): string {
  const row = (h.after ?? h.before ?? {}) as Record<string, unknown>;
  const text = (row.name ?? row.memo ?? row.title) as string | undefined;
  if (text) return text;
  const id = h.row_id;
  // 일정 할 일 체크: e:${month}:${일정 id}@${회차 시작일}
  if (h.table_name === "checks" && id?.startsWith("e:")) return data.events.find((e) => e.id === id.split(":")[2]?.split("@")[0])?.title ?? "";
  if (h.table_name === "months" && id) return monthLabel(id);
  if (h.table_name === "settings") return "";
  const list = (data as unknown as Record<string, { id: string; name?: string; memo?: string; title?: string }[]>)[h.table_name];
  const now = Array.isArray(list) ? list.find((x) => x.id === id) : undefined;
  return now?.name || now?.memo || now?.title || "";
}

function describe(data: Data, h: HistoryRow): { title: string; lines: string[] } {
  const what = TABLE[h.table_name] ?? h.table_name;
  const name = subject(data, h);
  const head = name ? `${what} '${name}'` : what;
  if (h.table_name === "checks") return { title: `${head} ${h.op === "delete" ? "완료 취소" : "완료"}`, lines: [] };
  if (h.op === "insert") return { title: `${head} 추가`, lines: [] };
  if (h.op === "delete") return { title: `${head} 삭제`, lines: [] };
  const b = h.before ?? {};
  const a = h.after ?? {};
  const keys = Object.keys(a).filter((k) => !HIDDEN.has(k));
  if (keys.length === 1 && keys[0] === "paid") return { title: `${head} ${a.paid ? "완료" : "완료 취소"}`, lines: [] };
  if (keys.length === 1 && keys[0] === "closed_at") return { title: `${head} ${a.closed_at ? "마감" : "다시 열기"}`, lines: [] };
  const lines = keys.slice(0, 3).map((k) => `${FIELD[k] ?? k}: ${value(data, k, b[k])} → ${value(data, k, a[k])}`);
  if (keys.length > 3) lines.push(`외 ${keys.length - 3}칸`);
  return { title: `${head} 수정`, lines };
}

/** 누가 언제 무엇을 바꿨나 (설정 → 변경 이력). 최근 것부터 HISTORY_PAGE 건씩. 열 때마다 새 key 로 그려 처음부터 불러온다 */
export function HistorySheet({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { data, loadHistory, today } = useData();
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [state, setState] = useState<"loading" | "more" | "end" | "error">("loading");

  const page = async (before: number | null) => {
    try {
      const got = await loadHistory(before);
      setRows((r) => (before == null ? got : [...r, ...got]));
      setState(got.length < HISTORY_PAGE ? "end" : "more");
    } catch {
      setState("error");
    }
  };

  useEffect(() => {
    if (!open) return;
    let alive = true;
    loadHistory(null)
      .then((got) => {
        if (!alive) return;
        setRows(got);
        setState(got.length < HISTORY_PAGE ? "end" : "more");
      })
      .catch(() => alive && setState("error"));
    return () => {
      alive = false;
    };
  }, [open, loadHistory]);

  // 날짜별로 묶는다 (받은 순서가 최근 것부터)
  const days: [string, HistoryRow[]][] = [];
  for (const h of rows) {
    const d = ymd(new Date(h.at));
    const last = days[days.length - 1];
    if (last && last[0] === d) last[1].push(h);
    else days.push([d, [h]]);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="변경 이력">
      {state === "error" ? (
        <p className="empty">이력을 불러오지 못했어요. 연결을 확인하고 다시 열어 주세요.</p>
      ) : rows.length === 0 ? (
        <p className="empty">{state === "loading" ? "불러오는 중…" : "아직 바뀐 기록이 없어요."}</p>
      ) : (
        days.map(([d, list]) => (
          <div className="daygroup" key={d}>
            <div className="dayhead">
              <span>{dayLabel(d, today)}</span>
            </div>
            <div className="rows">
              {list.map((h) => {
                const { title, lines } = describe(data, h);
                const at = new Date(h.at);
                return (
                  <div className="row hist" key={h.id}>
                    {h.person ? <PersonGlyph owner={h.person} /> : <span className="hist-dot" aria-hidden="true" />}
                    <div style={{ minWidth: 0 }}>
                      <div className="t">{title}</div>
                      {lines.map((l) => (
                        <div className="s" key={l}>
                          {l}
                        </div>
                      ))}
                    </div>
                    <div className="r">
                      <div className="s">
                        {h.person ? `${nameOf(data.settings, h.person)} · ` : ""}
                        {String(at.getHours()).padStart(2, "0")}:{String(at.getMinutes()).padStart(2, "0")}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}
      {state === "more" && (
        <div className="card-foot" style={{ justifyContent: "center" }}>
          <button type="button" className="btn ghost" onClick={() => void page(rows[rows.length - 1]?.id ?? null)}>
            더 보기
          </button>
        </div>
      )}
    </Sheet>
  );
}
