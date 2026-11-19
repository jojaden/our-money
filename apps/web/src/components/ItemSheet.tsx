"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Plus, Trash2 } from "lucide-react";
import type { Account, Group, Method, MonthItem, Owner, Person, PlanItem } from "@/lib/types";
import { GROUP_LABEL, METHOD_LABEL } from "@/lib/types";
import { blankMonth, useData } from "@/lib/store";
import { deleteOp, upsertOp, type Op } from "@/lib/repo";
import { monthRow, nameOf, partnerOf, ratioA, split as splitBy } from "@/lib/calc";
import { monthLabel, num } from "@/lib/format";
import { logoOf } from "@/lib/institutions";
import { AddPass } from "./AddPass";
import { AmountInput, MAX_GOAL, PersonGlyph, Seg, Sheet, Toggle } from "./ui";

function newId(prefix: string) {
  return `${prefix}-${typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID().slice(0, 8) : Date.now().toString(36)}`;
}

/** 돈이 나가는 곳: 카드(카드 자동결제)거나 통장(자동이체·직접 이체·현금) */
interface Source {
  method: Method;
  card_id: string | null;
  account_id: string | null;
}
/** 나눠 낼 때 한 사람 몫 */
type Part = Source & { amount: number };

const sourceOf = (i: Pick<MonthItem, "method" | "card_id" | "account_id"> | undefined, method: Method): Source => ({
  method: i?.method ?? method,
  card_id: i?.card_id ?? null,
  account_id: i?.account_id ?? null,
});
/** 저장할 칸: 카드면 계좌를 비우고, 통장이면 카드를 비운다 */
const sourceFields = (x: Source) => ({ method: x.method, card_id: x.method === "card_auto" ? x.card_id : null, account_id: x.method === "card_auto" ? null : x.account_id });
/** 카드 자동결제는 카드를 골라야 한다 (통장은 비워 둘 수 있다 — 체크에 "계좌 미지정"으로 남는다) */
const sourceOk = (x: Source) => x.method !== "card_auto" || Boolean(x.card_id);
const BANK_METHODS: Method[] = ["account_auto", "manual", "cash"];

/**
 * 나가는 곳 고르기 — 지갑의 카드·통장을 로고와 함께 한 줄 목록으로. 카드를 고르면 카드 자동결제,
 * 통장을 고르면 아래에서 자동이체·직접 이체·현금을 고른다. 끝의 "카드·통장 넣기"는 지갑에 넣는 시트를 위에 연다.
 */
function SourcePicker({
  id,
  label,
  value,
  onChange,
  accounts,
  person,
  saving,
  onAdd,
}: {
  id: string;
  label: string;
  value: Source;
  onChange: (v: Source) => void;
  accounts: Account[];
  /** 이 사람 것과 공동 것을 앞에 */
  person: Owner;
  saving: boolean;
  onAdd: () => void;
}) {
  const [more, setMore] = useState(false);
  const picked = value.method === "card_auto" ? value.card_id : value.account_id;
  // 이 사람 것·공동 것을 먼저 보이고, 다른 사람 것은 "다른 N개"를 눌러야 (골라 둔 것은 늘 보인다)
  const rank = (a: Account) => (a.owner === person ? 0 : a.owner === "joint" ? 1 : 2);
  const sorted = [...accounts].sort((x, y) => rank(x) - rank(y) || x.sort - y.sort);
  const near = (a: Account) => rank(a) < 2 || a.id === picked;
  const hidden = sorted.filter((a) => !near(a)).length;
  const list = more ? sorted : sorted.filter(near);
  const pick = (a: Account) =>
    onChange(
      a.kind === "card"
        ? { method: "card_auto", card_id: a.id, account_id: null }
        : { method: value.method === "card_auto" ? "account_auto" : value.method, card_id: null, account_id: a.id },
    );
  const pickedAcc = accounts.find((a) => a.id === picked);
  return (
    <div className="field">
      <span className="label" id={id}>
        {label}
      </span>
      <div className="chips src-chips" role="radiogroup" aria-labelledby={id}>
        {list.map((a) => {
          const logo = logoOf(a.institution);
          return (
            <button key={a.id} type="button" role="radio" aria-checked={picked === a.id} className="chip" onClick={() => pick(a)}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {logo && <img className="chip-logo" src={logo} alt="" width={18} height={18} />}
              {a.name}
            </button>
          );
        })}
        {hidden > 0 && !more && (
          <button type="button" className="chip src-more" onClick={() => setMore(true)}>
            다른 {hidden}개
            <ChevronDown aria-hidden="true" />
          </button>
        )}
        <button type="button" className="chip src-add" onClick={onAdd}>
          <Plus aria-hidden="true" />
          카드·통장 넣기
        </button>
      </div>
      {value.method !== "card_auto" && (
        <div className="src-method">
          <Seg label={`${label} 방식`} value={value.method} onChange={(m) => onChange({ ...value, method: m })} options={BANK_METHODS.map((m) => ({ value: m, label: METHOD_LABEL[m] }))} />
        </div>
      )}
      <p className="help">
        {value.method === "card_auto"
          ? pickedAcc
            ? "카드값이 빠져나가는 결제 계좌로 돈을 옮기도록 체크에 넣어요."
            : "카드를 골라 주세요."
          : saving
            ? "월급통장이 아닌 계좌면 이번 달 ‘옮길 돈’에 올라가요."
            : pickedAcc
              ? "월급통장이 아닌 계좌면 이번 달 ‘옮길 돈’에 올라가요."
              : "고르지 않으면 체크에 ‘계좌 미지정’으로 남아요."}
      </p>
    </div>
  );
}

export function ItemSheet({
  open,
  onOpenChange,
  item,
  group: initialGroup,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  item?: MonthItem;
  group?: Group;
}) {
  const { data, month, batch, toast } = useData();
  const s = data.settings;
  const plan = item?.plan_item_id ? data.plan_items.find((p) => p.id === item.plan_item_id) : undefined;
  // 나눠 낸 공동 항목이면 두 사람 몫 (같은 달에서 같은 pair_id)
  const partner = item ? partnerOf(data.month_items.filter((i) => i.month === item.month), item) : undefined;
  const paired = Boolean(item?.pair_id && partner);
  const [ia, ib] = paired ? (item!.payer === "a" ? [item, partner] : [partner, item]) : [undefined, undefined];
  const wallet = useMemo(() => data.accounts.filter((a) => !a.archived), [data.accounts]);
  const rA = ratioA(s, monthRow(data, month));

  const [name, setName] = useState("");
  const [group, setGroup] = useState<Group>("fixed");
  const [amount, setAmount] = useState(0);
  const [payer, setPayer] = useState<Owner>("joint");
  const [source, setSource] = useState<Source>({ method: "account_auto", card_id: null, account_id: null });
  const [split, setSplit] = useState(false);
  const [parts, setParts] = useState<Record<Person, Part>>({ a: { method: "account_auto", card_id: null, account_id: null, amount: 0 }, b: { method: "account_auto", card_id: null, account_id: null, amount: 0 } });
  // 합계를 직접 적었는지: 적었으면 한 사람 몫을 바꿀 때 나머지가 상대 몫, 아니면(몫부터 적으면) 합계가 두 몫의 합
  const [totalLed, setTotalLed] = useState(false);
  const [dueDay, setDueDay] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [goal, setGoal] = useState(0);
  const [goalStart, setGoalStart] = useState(0);
  const [forward, setForward] = useState(true);
  // 기간: 시작·끝 달 (YYYY-MM, 비우면 제한 없음)
  const [ranged, setRanged] = useState(false);
  const [startM, setStartM] = useState("");
  const [endM, setEndM] = useState("");
  // 나가는 곳 목록의 "카드·통장 넣기": 어느 칸(한 곳·사람 몫)에서 열었는지 — 넣고 나면 그 칸에 골라 둔다
  const [adding, setAdding] = useState(false);
  const [addTarget, setAddTarget] = useState<"one" | Person>("one");

  // 열 때만 채운다 — 그리는 도중에 바꿔, 위에 겹친 지갑 시트에서 카드를 넣어 data 가 바뀌어도 적던 내용이 그대로 남는다
  const [wasOpen, setWasOpen] = useState(false);
  const [initial, setInitial] = useState<string | null>(null);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      const g = item?.group ?? initialGroup ?? "fixed";
      const dm: Method = g === "living" || g === "allowance" ? "manual" : "account_auto";
      setName(item?.name ?? "");
      setGroup(g);
      setAmount(paired ? ia!.amount + ib!.amount : item?.amount ?? 0);
      setTotalLed(Boolean(item));
      setPayer(paired ? "joint" : item?.payer ?? "joint");
      setSource(sourceOf(paired ? ia : item, dm));
      setSplit(paired);
      setParts({
        a: { ...sourceOf(ia ?? item, dm), amount: ia?.amount ?? 0 },
        b: { ...sourceOf(ib ?? item, dm), amount: ib?.amount ?? 0 },
      });
      setDueDay(item?.due_day ?? null);
      setNote(item?.note ?? "");
      setGoal(plan?.goal_amount ?? 0);
      setGoalStart(plan?.goal_start ?? 0);
      setForward(true);
      setRanged(Boolean(plan?.start_month || plan?.end_month));
      setStartM(plan?.start_month ?? month);
      setEndM(plan?.end_month ?? "");
      setAdding(false);
      setInitial(null);
    }
  }
  // 적던 내용이 있는지: 연 순간의 값과 비교 (다시 불러오기로 바뀌지 않게 채운 바로 다음 그리기에서 한 번 찍어 둔다)
  const form = JSON.stringify([name, group, amount, payer, source, split, parts, dueDay, note, goal, goalStart, forward, ranged, startM, endM]);
  if (open && wasOpen && initial === null) setInitial(form);
  const dirty = initial !== null && form !== initial;

  const splitOn = payer === "joint" && split;
  // 이미 있는 항목에서 나눠 내기를 켜고 끄는 건 다음 달부터도 적용할 때만 (이번 달만 바꾸면 다음 달에 한 사람 몫만 넘어간다)
  const splitLocked = Boolean(item) && !forward;
  const toggleSplit = (on: boolean) => {
    setSplit(on);
    if (on) {
      // 처음 켜면 지금 분담 비율로 나누고, 나가는 곳은 지금 고른 곳으로 시작한다
      const [a, b] = [splitBy(amount, rA).a, splitBy(amount, rA).b];
      setParts({ a: { ...source, amount: a }, b: { ...source, amount: b } });
    } else {
      setSource({ method: parts.a.method, card_id: parts.a.card_id, account_id: parts.a.account_id });
    }
  };
  // 합계를 먼저 적었으면 한 사람 몫을 바꿀 때 나머지가 상대 몫(예: 70만 중 현빈 40만 → 예진 30만).
  // 몫부터 적거나 합계를 넘기면 합계가 두 몫의 합이 된다(현빈 40만, 예진 30만 → 70만)
  const setShare = (p: Person, v: number) => {
    const o: Person = p === "a" ? "b" : "a";
    if (totalLed && v <= amount) {
      setParts((x) => ({ ...x, [p]: { ...x[p], amount: v }, [o]: { ...x[o], amount: amount - v } }));
    } else {
      setParts((x) => ({ ...x, [p]: { ...x[p], amount: v } }));
      setAmount(v + parts[o].amount);
      setTotalLed(false);
    }
  };
  // 합계를 바꾸면 a 몫은 (합계 안에서) 그대로, 나머지가 b 몫 — 나눠 내기가 꺼져 있어도 맞춰 둔다(다시 켜거나 공동으로 돌아올 때 어긋나지 않게)
  const setTotal = (v: number) => {
    setAmount(v);
    setTotalLed(v > 0);
    setParts((x) => ({ a: { ...x.a, amount: Math.min(x.a.amount, v) }, b: { ...x.b, amount: v - Math.min(x.a.amount, v) } }));
  };
  const setPartSource = (p: Person, v: Source) => setParts((x) => ({ ...x, [p]: { ...x[p], ...v } }));

  // 이번 달에 이미 있는 항목은 이번 달이 기간 안이어야 한다. 새 항목은 나중 달부터 시작할 수 있다
  const periodOn = forward && ranged;
  const later = periodOn && !item && Boolean(startM) && startM > month;
  const periodError = !periodOn
    ? null
    : item && startM && startM > month
      ? `이번 달 항목이라 시작 달은 ${monthLabel(month)}이나 그 전이어야 해요`
      : endM && endM < (startM && startM > month ? startM : month)
        ? "끝 달은 시작 달과 이번 달보다 앞일 수 없어요"
        : null;
  // 이번 달만 바꿀 때 나눠 내기를 켜거나 끄면(공동 → 한 사람으로 바꿔도) 다음 달에 한 사람 몫만 넘어간다
  const splitError = item && !forward && splitOn !== paired ? "나눠 내기를 켜고 끄는 건 ‘다음 달부터도 적용’을 켰을 때만 돼요" : null;
  const valid =
    name.trim().length > 0 &&
    amount > 0 &&
    (splitOn
      ? parts.a.amount > 0 && parts.b.amount > 0 && parts.a.amount + parts.b.amount === amount && sourceOk(parts.a) && sourceOk(parts.b)
      : sourceOk(source)) &&
    !periodError &&
    !splitError;

  const save = async () => {
    if (!valid) return;
    const common = { group, name: name.trim(), due_day: dueDay, note: note.trim() };
    const pairId = splitOn ? (paired ? item!.pair_id! : newId("pair")) : null;
    // 저장할 줄: 나눠 내면 두 사람 몫 두 줄, 아니면 한 줄. 나눠 내기를 끄면 a 몫 줄을 공동 항목으로 되돌리고 b 몫 줄은 뺀다
    const lines: { prev?: MonthItem; payer: Owner; amount: number; src: Source }[] = splitOn
      ? [
          { prev: paired ? ia : item, payer: "a", amount: parts.a.amount, src: parts.a },
          { prev: ib, payer: "b", amount: parts.b.amount, src: parts.b },
        ]
      : [{ prev: paired ? ia : item, payer, amount, src: source }];
    const dropped = !splitOn && paired ? ib : undefined;

    // 플랜 항목과 이번 달 항목을 한 트랜잭션으로 (하나만 저장되고 끝나지 않게)
    const ops: Op[] = [];
    const planRows: PlanItem[] = [];
    const monthRows: MonthItem[] = [];
    let nextPlanSort = Math.max(0, ...data.plan_items.map((p) => p.sort)) + 1;
    const monthSort = item?.sort ?? Math.max(0, ...data.month_items.filter((i) => i.month === month).map((i) => i.sort)) + 1;
    for (const line of lines) {
      const prevPlan = line.prev?.plan_item_id ? data.plan_items.find((p) => p.id === line.prev!.plan_item_id) : undefined;
      const fields = { ...common, amount: line.amount, payer: line.payer, ...sourceFields(line.src), pair_id: pairId };
      let planId = line.prev?.plan_item_id ?? null;
      if (forward) {
        planId = planId ?? newId("pi");
        const base: PlanItem = prevPlan ?? { id: planId, ...fields, sort: nextPlanSort++, active: true, goal_amount: null, goal_start: null };
        planRows.push({
          ...base,
          ...fields,
          active: true,
          goal_amount: group === "saving" && goal > 0 ? goal : null,
          goal_start: group === "saving" && goal > 0 ? goalStart : null,
          start_month: periodOn && startM ? startM : null,
          end_month: periodOn && endM ? endM : null,
        });
      }
      const prev = line.prev;
      monthRows.push({
        id: prev?.id ?? (planId ? `${month}:${planId}` : `${month}:${newId("one")}`),
        month,
        plan_item_id: planId,
        // 두 사람 몫은 같은 자리에 (화면에서 한 줄로 묶인다)
        sort: prev?.sort ?? monthSort,
        paid: prev?.paid ?? false,
        paid_at: prev?.paid_at ?? null,
        paid_by: prev?.paid_by ?? null,
        paid_amount: prev?.paid_amount ?? null,
        ...fields,
        rev: prev?.rev,
      });
    }
    if (dropped && forward) {
      const dp = dropped.plan_item_id ? data.plan_items.find((p) => p.id === dropped.plan_item_id) : undefined;
      if (dp) planRows.push({ ...dp, active: false });
    }
    if (planRows.length) ops.push(upsertOp("plan_items", planRows));
    // 나중 달부터 시작하는 새 항목은 이번 달에는 넣지 않는다
    if (!later) {
      // 빈 플랜(아직 시작하지 않은 달)에 처음 넣는 항목이면 그 달도 같이 만든다
      if (!monthRow(data, month)) ops.push(upsertOp("months", [blankMonth(data, month)], { ignoreDuplicates: true }));
      ops.push(upsertOp("month_items", monthRows));
      if (dropped) ops.push(deleteOp("month_items", [dropped.id]));
    }
    onOpenChange(false);
    if (!(await batch(ops))) return;
    toast(later ? `저장했어요 · ${monthLabel(startM)}부터 들어가요` : forward ? "저장했어요 · 다음 달부터도 적용" : "이번 달만 바꿨어요");
  };

  const del = async () => {
    if (!item) return;
    // 나눠 낸 항목은 두 사람 몫을 함께 뺀다
    const rows = paired ? [ia!, ib!] : [item];
    const plans = rows.flatMap((r) => {
      const p = r.plan_item_id ? data.plan_items.find((x) => x.id === r.plan_item_id) : undefined;
      return p ? [p] : [];
    });
    onOpenChange(false);
    // 이번 달에서 빼기와 다음 달부터 끄기를 한 트랜잭션으로
    const off = forward && plans.length > 0;
    if (!(await batch([deleteOp("month_items", rows.map((r) => r.id)), ...(off ? [upsertOp("plan_items", plans.map((p) => ({ ...p, active: false })))] : [])]))) return;
    toast(off ? "이번 달과 다음 달부터 뺐어요" : "이번 달에서 뺐어요", () => {
      void batch([...(plans.length ? [upsertOp("plan_items", plans)] : []), upsertOp("month_items", rows)]);
    });
  };

  const people: { value: Owner; label: string }[] = [
    { value: "joint", label: "공동" },
    { value: "a", label: nameOf(s, "a") },
    { value: "b", label: nameOf(s, "b") },
  ];
  const sourceLabel = group === "saving" ? "어디에 모아요" : "어디서 나가요";
  const openAdd = (target: "one" | Person) => {
    setAddTarget(target);
    setAdding(true);
  };
  // 방금 넣은 카드·통장을 연 칸에 골라 둔다
  const added = (a: Account) => {
    const v: Source = a.kind === "card" ? { method: "card_auto", card_id: a.id, account_id: null } : { method: group === "living" || group === "allowance" ? "manual" : "account_auto", card_id: null, account_id: a.id };
    if (addTarget === "one") setSource(v);
    else setPartSource(addTarget, v);
  };
  const even = splitBy(amount, rA);

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      keep={dirty}
      title={item ? item.name : `${GROUP_LABEL[group]} 추가`}
      headerAction={
        item && (
          <button type="button" className="btn danger sm" onClick={() => void del()}>
            <Trash2 aria-hidden="true" /> 빼기
          </button>
        )
      }
      footer={
        <button type="button" className="btn block" disabled={!valid} onClick={() => void save()}>
          저장
        </button>
      }
    >
      <div className="field">
        <span className="label">종류</span>
        <Seg
          label="종류"
          value={group}
          onChange={setGroup}
          options={(["fixed", "living", "allowance", "saving"] as Group[]).map((g) => ({ value: g, label: g === "living" ? "생활비" : GROUP_LABEL[g] }))}
        />
      </div>
      <div className="field">
        <label htmlFor="it-name">이름</label>
        <input id="it-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 월세, 실손보험, 적금" maxLength={30} />
      </div>
      <div className="inline-fields field">
        <div className="field">
          <label htmlFor="it-amount">{splitOn ? "매달 금액 (합계)" : "매달 금액"}</label>
          <AmountInput id="it-amount" value={amount} onChange={setTotal} />
        </div>
        <div className="field" style={{ marginTop: 0 }}>
          <label htmlFor="it-due">{group === "living" || group === "allowance" ? "이체일 (선택)" : "결제·이체일"}</label>
          <select id="it-due" className="select" value={dueDay ?? ""} onChange={(e) => setDueDay(e.target.value ? Number(e.target.value) : null)}>
            <option value="">없음</option>
            {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
              <option key={d} value={d}>
                매달 {d}일
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="field">
        <span className="label">누구 돈에서 나가나요</span>
        <Seg label="부담" value={payer} onChange={setPayer} options={people} />
      </div>
      {payer === "joint" && (
        <div className="field">
          <div className="switchrow">
            <div>
              <div className="t">나눠 내기</div>
              <div className="s">{splitLocked ? "켜고 끄는 건 ‘다음 달부터도 적용’을 켰을 때만 돼요." : "사람마다 금액과 나가는 곳을 따로 정해요."}</div>
            </div>
            <Toggle on={split} onChange={toggleSplit} label="나눠 내기" disabled={splitLocked} />
          </div>
          {!splitOn && amount > 0 && (
            <p className="help">
              분담 비율대로 {nameOf(s, "a")} {num(even.a)}원 · {nameOf(s, "b")} {num(even.b)}원씩 각자 월급통장에서 옮겨요.
            </p>
          )}
        </div>
      )}
      {splitOn ? (
        (["a", "b"] as Person[]).map((p) => (
          <div className="split-part" key={p}>
            <div className="split-head">
              <PersonGlyph owner={p} />
              <label htmlFor={`it-amt-${p}`}>{nameOf(s, p)} 몫</label>
              <AmountInput id={`it-amt-${p}`} value={parts[p].amount} onChange={(v) => setShare(p, v)} />
            </div>
            <SourcePicker
              id={`it-src-${p}`}
              label={sourceLabel}
              value={parts[p]}
              onChange={(v) => setPartSource(p, v)}
              accounts={wallet}
              person={p}
              saving={group === "saving"}
              onAdd={() => openAdd(p)}
            />
          </div>
        ))
      ) : (
        <SourcePicker id="it-src" label={sourceLabel} value={source} onChange={setSource} accounts={wallet} person={payer} saving={group === "saving"} onAdd={() => openAdd("one")} />
      )}
      {group === "saving" && (
        <div className="inline-fields field">
          <div className="field">
            <label htmlFor="it-goal">목표 금액 (선택)</label>
            <AmountInput id="it-goal" value={goal} onChange={setGoal} max={MAX_GOAL} />
          </div>
          <div className="field" style={{ marginTop: 0 }}>
            <label htmlFor="it-goal-start">지금까지 모은 돈</label>
            <AmountInput id="it-goal-start" value={goalStart} onChange={setGoalStart} max={MAX_GOAL} />
          </div>
        </div>
      )}
      <div className="field">
        <label htmlFor="it-note">메모</label>
        <input id="it-note" className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="예: 급여통장에서 연금저축으로 자동이체" maxLength={60} />
      </div>
      <div className="field">
        <div className="switchrow">
          <div>
            <div className="t">다음 달부터도 적용</div>
            <div className="s">끄면 {item ? "이번 달만 바뀌어요" : "이번 달에만 들어가요"}.</div>
          </div>
          <Toggle on={forward} onChange={setForward} label="다음 달부터도 적용" />
        </div>
        {splitError && (
          <p className="help" role="alert">
            {splitError}
          </p>
        )}
        {/* 목표는 플랜 항목에만 저장된다 — 이번 달만 바꾸면 적은 목표가 말없이 버려지지 않게 */}
        {group === "saving" && !forward && (goal !== (plan?.goal_amount ?? 0) || goalStart !== (plan?.goal_start ?? 0)) && (
          <p className="help" role="alert">
            목표 금액은 ‘다음 달부터도 적용’을 켰을 때만 저장돼요
          </p>
        )}
      </div>
      {forward && (
        <div className="field">
          <div className="switchrow">
            <div>
              <div className="t">기간 정하기</div>
              <div className="s">대출·보험처럼 끝이 있거나 몇 달만 내는 항목</div>
            </div>
            <Toggle on={ranged} onChange={setRanged} label="기간 정하기" />
          </div>
          {ranged && (
            <div className="inline-fields" style={{ marginTop: 8 }}>
              <div className="field" style={{ marginTop: 0 }}>
                <label htmlFor="it-start">시작 달</label>
                <input id="it-start" type="month" className="input" value={startM} onChange={(e) => setStartM(e.target.value)} />
              </div>
              <div className="field" style={{ marginTop: 0 }}>
                <label htmlFor="it-end">끝 달 (선택)</label>
                <input id="it-end" type="month" className="input" value={endM} min={startM || undefined} onChange={(e) => setEndM(e.target.value)} />
              </div>
            </div>
          )}
          {periodError ? (
            <p className="help" role="alert">
              {periodError}
            </p>
          ) : (
            later && <p className="help">이번 달에는 넣지 않고 {monthLabel(startM)}부터 들어가요.</p>
          )}
        </div>
      )}
      <AddPass open={adding} onOpenChange={setAdding} owner={addTarget === "one" ? payer : addTarget} onSaved={added} />
    </Sheet>
  );
}

export function IncomeSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { data, month, upsert, toast } = useData();
  const s = data.settings;
  const saved = data.months.find((x) => x.id === month);
  // 빈 플랜이면 지난달(없으면 설정) 월급으로 채운 새 달 — 저장하면 그 달이 시작된다
  const m = useMemo(() => saved ?? blankMonth(data, month), [saved, data, month]);
  const [a, setA] = useState(0);
  const [b, setB] = useState(0);
  const [extra, setExtra] = useState(0);
  const [note, setNote] = useState("");
  // 열 때만 채운다 — 다른 앱에 다녀와 다시 불러오거나 상대가 그 달을 고쳐도 적던 값이 되돌아가지 않게
  const [wasOpen, setWasOpen] = useState(false);
  const [initial, setInitial] = useState("");
  const form = JSON.stringify([a, b, extra, note]);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setA(m.income_a);
      setB(m.income_b);
      setExtra(m.extra_income);
      setNote(m.extra_note);
      setInitial(JSON.stringify([m.income_a, m.income_b, m.extra_income, m.extra_note]));
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      keep={form !== initial}
      title="이번 달 수입"
      footer={
        <button
          type="button"
          className="btn block"
          onClick={async () => {
            onOpenChange(false);
            if (!(await upsert("months", [{ ...m, income_a: a, income_b: b, extra_income: extra, extra_note: note.trim() }]))) return;
            toast("수입을 저장했어요");
          }}
        >
          저장
        </button>
      }
    >
      <div className="field">
        <label htmlFor="in-a">{nameOf(s, "a")} 월급 (실수령)</label>
        <AmountInput id="in-a" value={a} onChange={setA} />
      </div>
      <div className="field">
        <label htmlFor="in-b">{nameOf(s, "b")} 월급 (실수령)</label>
        <AmountInput id="in-b" value={b} onChange={setB} />
      </div>
      <div className="field">
        <label htmlFor="in-x">기타 수입</label>
        <AmountInput id="in-x" value={extra} onChange={setExtra} />
        <input className="input" aria-label="기타 수입 메모" placeholder="예: 명절 상여금" value={note} onChange={(e) => setNote(e.target.value)} maxLength={40} />
        <p className="help">기타 수입은 합계에만 더해지고 이체 목록에는 들어가지 않아요.</p>
      </div>
    </Sheet>
  );
}
