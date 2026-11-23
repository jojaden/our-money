"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { Clock, Copy, Share, Trash2, X } from "lucide-react";
import type { CalEvent, Owner, Repeat } from "@/lib/types";
import { REPEAT_LABEL } from "@/lib/types";
import { useData } from "@/lib/store";
import { nameOf } from "@/lib/calc";
import { eul, ro } from "@/lib/format";
import { addDays, cutTime, findTime, occurrences, timeText, type TimeHit } from "@/lib/calendar";
import { AmountInput, MAX_GOAL, radioKeys, radioTab, Seg, Sheet, Toggle } from "./ui";
import type { QuickDraft } from "./QuickAdd";
import { useShareEvent } from "./holdActions";

/** 무엇을 만드나 — 맨 위에서 고르면 그에 맞는 칸만 나온다 */
type Kind = "todo" | "event" | "dday";

const KIND: { value: Kind; label: string; help: string; hint: string }[] = [
  { value: "todo", label: "할 일", help: "끝내면 체크하는 일이에요. 이번 달 할 일에 모여요", hint: "예: 재산세 내기, 양도소득세 신고" },
  { value: "event", label: "일정", help: "약속·계획이에요. 달력과 이번 달 일정에 보여요", hint: "예: 친구 약속 오후 7시부터, 치과 3시 반" },
  { value: "dday", label: "D-day", help: "기념일·만기까지 남은 날을 세요. D-day 목록에 모여요", hint: "예: 결혼기념일, 전세 만기" },
];

/** 미리 알림 고르기 (안드로이드 앱이 그날 아침 알린다) */
const REMIND: { value: string; label: string }[] = [
  { value: "", label: "없음" },
  { value: "0", label: "당일" },
  { value: "1", label: "하루 전" },
  { value: "3", label: "3일 전" },
  { value: "7", label: "일주일 전" },
];

function newId() {
  return `ev-${typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID().slice(0, 8) : Date.now().toString(36)}`;
}

/**
 * 바로 쓰기(달력 첫 화면 아래 막대)로 더하는 일정 하나 — 시트 없이 그 날짜에 "일정"으로 넣는다.
 * 시간을 골랐으면 그 시간, 아니면 제목 속 시간을 시트와 같은 규칙으로 떼어 넣는다("치과 3시 반" → 치과, 15:30). 떼면 제목이 비면 그대로 둔다.
 */
export function quickEvent(draft: QuickDraft, date: string, now = new Date()): CalEvent {
  const t = draft.title.trim();
  const hit = draft.time ? null : findTime(t, now);
  const rest = hit ? `${t.slice(0, hit.index)} ${t.slice(hit.end)}`.replace(/\s+/g, " ").trim() : "";
  const h = hit && rest ? hit : null;
  return {
    id: newId(),
    title: h ? rest : t,
    note: "",
    start_date: date,
    end_date: null,
    repeat: "none",
    owner: "joint",
    todo: false,
    dday: false,
    pin: false,
    remind_days: null,
    amount: null,
    start_time: draft.time || (h?.start ?? null),
    end_time: draft.time ? draft.end || null : (h?.until ?? null),
  };
}

function kindOf(e?: CalEvent): Kind {
  if (!e) return "event";
  return e.todo ? "todo" : e.dday ? "dday" : "event";
}

/**
 * 달력에 하나 더하기·고치기. 맨 위에서 할 일·일정·D-day 를 고른다.
 * - 할 일: 기한(하루 또는 기간), 낼 돈, D-day 세기, 기간이면 알림 모음 고정 → 끝내면 체크 (todo)
 * - 일정: 하루 또는 기간 (체크 없음)
 * - D-day: 하루 (dday)
 * 셋 다 반복(매달·매년)·누구·미리 알림·메모, 할 일·일정은 시간(선택).
 * 제목에 "오후5시", "5시 40분"처럼 시간을 쓰면 그 글자를 카드로 감싸 보여 주고, 띄어 쓰면 제목에서 떼어 시간 칸에 넣는다.
 * 다시 쓰면 바꾼다("9시까지"는 끝 시간만). 오전·오후를 안 쓰면 시트를 연 지금에 맞춘다(지난 시각이면 오후).
 * 열 때마다 새 key 로 그려서 입력이 그 일정(또는 고른 날짜)에서 시작한다.
 */
export function EventSheet({ open, onOpenChange, event, from, date, draft, onCopy }: { open: boolean; onOpenChange: (v: boolean) => void; event?: CalEvent; /** 복사: 이 일정과 같은 내용으로 새로 만든다 (저장하면 새 id) */ from?: CalEvent; date: string; /** 바로 쓰기에 쓰던 제목·시간 (새로 만들 때) */ draft?: QuickDraft; /** 고치기 시트의 "복사": 이 시트를 닫고 같은 내용의 새 시트를 연다 */ onCopy?: (e: CalEvent) => void }) {
  const { data, today, upsert, remove, toast } = useData();
  const share = useShareEvent();
  // 처음 값: 고치기면 그 일정, 복사면 베낄 일정 (저장할 때 id·rev 는 event 에서만 가져오므로 복사는 새 일정이 된다)
  const base = event ?? from;
  const s = data.settings;
  const [kind, setKind] = useState<Kind>(kindOf(base));
  const [title, setTitle] = useState(base?.title ?? draft?.title ?? "");
  const [ranged, setRanged] = useState(Boolean(base?.end_date));
  const [start, setStart] = useState(base?.start_date ?? date);
  const [end, setEnd] = useState(base?.end_date ?? "");
  const [repeat, setRepeat] = useState<Repeat>(base?.repeat ?? "none");
  const [owner, setOwner] = useState<Owner>(base?.owner ?? "joint");
  const [dday, setDday] = useState(base?.todo ? base.dday : false);
  const [pin, setPin] = useState(base?.pin ?? false);
  const [remind, setRemind] = useState(base?.remind_days == null ? "" : String(base.remind_days));
  const [amount, setAmount] = useState(base?.amount ?? 0);
  const [note, setNote] = useState(base?.note ?? "");
  const [startTime, setStartTime] = useState(base?.start_time ?? draft?.time ?? "");
  const [endTime, setEndTime] = useState(base?.end_time ?? draft?.end ?? "");
  /** 오전·오후를 안 쓴 시간을 정할 기준 (시트를 연 때) */
  const [now] = useState(() => new Date());
  // 적던 내용이 있는지: 열 때마다 새 key 로 그리므로 첫 그리기의 값이 연 순간의 값. 새로 만들 때는 제목을 적었으면
  const form = JSON.stringify([kind, title, ranged, start, end, repeat, owner, dday, pin, remind, amount, note, startTime, endTime]);
  const [initial] = useState(form);
  const dirty = form !== initial || (!base && title.trim() !== "");
  const titleRef = useRef<HTMLInputElement>(null);
  const mirrorRef = useRef<HTMLSpanElement>(null);
  /** 제목을 고쳐 쓴 뒤 놓을 커서 자리 */
  const caret = useRef<number | null>(null);
  /** 방금 시간을 뗀 자리 — 바로 이어 "40분 "·"반 "을 쓰면 그 시간의 분을 고친다 ("5시 40분") */
  const lastAt = useRef<{ at: number; field: "start" | "end" } | null>(null);

  const k = KIND.find((x) => x.value === kind)!;
  const isRange = kind !== "dday" && ranged;
  const endBad = isRange && Boolean(end) && end < start;
  const timed = kind !== "dday";
  const timeBad = timed && !isRange && Boolean(startTime) && Boolean(endTime) && endTime < startTime;
  const valid = title.trim().length > 0 && Boolean(start) && (!isRange || Boolean(end)) && !endBad && !timeBad;

  // 띄어 쓰기 전의 시간 (제목 속 카드로 보여 준다)
  const live = timed ? findTime(title, now) : null;

  /** 새 시간을 넣는다 — 시작이 있으면 시작·끝을 바꾸고, "9시까지"처럼 끝만 쓰면 끝만 */
  const applyTime = (hit: TimeHit) => {
    if (hit.start) {
      setStartTime(hit.start);
      setEndTime(hit.until ?? "");
    } else if (hit.until) setEndTime(hit.until);
  };

  /**
   * 띄어 쓴 시간을 제목에서 떼어 시간 칸으로 (바로 이어 쓴 "40분 "·"반 "은 분만 고친다). 고친 제목을 돌려준다.
   * 한글 조합 중에는 부르지 않는다 — 조합이 끝날 때(compositionend) 다시 부른다.
   * 키보드에 따라 빈칸이 조합 안에서 같이 확정되어(안드로이드·사파리) 조합이 아닌 입력이 오지 않기 때문.
   */
  const take = (input: HTMLInputElement): string => {
    let v = input.value;
    const pos = input.selectionStart ?? v.length;
    const l = lastAt.current;
    const typed = l && pos >= l.at ? v.slice(l.at, pos) : null;
    const mm = typed ? /^(?:(\d{1,2})\s*분|반)\s$/.exec(typed) : null;
    if (l && mm && Number(mm[1] ?? 30) <= 59) {
      const cur = l.field === "start" ? startTime : endTime;
      if (cur) (l.field === "start" ? setStartTime : setEndTime)(`${cur.slice(0, 3)}${String(mm[1] ?? 30).padStart(2, "0")}`);
      v = v.slice(0, l.at) + v.slice(pos);
      caret.current = l.at;
      lastAt.current = null;
      return v;
    }
    if (typed === null || !/^(?:\d{0,2}\s*분?|반)$/.test(typed)) lastAt.current = null;
    const hit = findTime(v, now);
    if (hit?.closed) {
      const cut = cutTime(v, hit);
      v = cut.text;
      caret.current = cut.at;
      applyTime(hit);
      lastAt.current = { at: cut.at, field: hit.start ? "start" : "end" };
    }
    return v;
  };

  /** 카드(제목 속 시간)를 누르면 띄어 쓴 것처럼 바로 시간 칸으로 옮긴다 — 입력칸의 초점은 그대로 */
  const takeLive = () => {
    if (!live) return;
    const cut = cutTime(title, live);
    caret.current = cut.at;
    applyTime(live);
    lastAt.current = { at: cut.at, field: live.start ? "start" : "end" };
    setTitle(cut.text);
  };

  // 고쳐 쓴 제목의 커서 자리, 카드 그림(뒤에 깐 글)의 가로 위치를 입력칸에 맞춘다
  const syncMirror = () => {
    if (mirrorRef.current && titleRef.current) mirrorRef.current.style.transform = `translateX(${-titleRef.current.scrollLeft}px)`;
  };
  useLayoutEffect(() => {
    const el = titleRef.current;
    if (el && caret.current !== null) el.setSelectionRange(caret.current, caret.current);
    caret.current = null;
    syncMirror();
  }, [title]);

  const save = async () => {
    if (!valid) return;
    // 띄어 쓰기 전에 저장하면 그때 넣는다 (떼면 제목이 비면 그대로 둔다)
    const rest = live ? `${title.slice(0, live.index)} ${title.slice(live.end)}`.replace(/\s+/g, " ").trim() : "";
    const hit = live && rest ? live : null;
    const st = hit?.start ?? (startTime || null);
    const et = hit ? (hit.start ? hit.until : hit.until ?? (endTime || null)) : endTime || null;
    const row: CalEvent = {
      id: event?.id ?? newId(),
      title: hit ? rest : title.trim(),
      note: note.trim(),
      start_date: start,
      end_date: isRange ? end : null,
      repeat,
      owner,
      todo: kind === "todo",
      dday: kind === "dday" || (kind === "todo" && dday),
      pin: kind === "todo" && isRange && pin,
      remind_days: remind === "" ? null : Number(remind),
      amount: kind === "todo" && amount > 0 ? amount : null,
      start_time: timed ? st : null,
      end_time: timed ? et : null,
      rev: event?.rev,
    };
    onOpenChange(false);
    if (await upsert("events", [row])) toast(event ? `${eul(k.label)} 고쳤어요` : `${eul(k.label)} 만들었어요`);
  };

  const del = async () => {
    if (!event) return;
    const backup = event;
    onOpenChange(false);
    if (!(await remove("events", [event.id]))) return;
    const what = eul(KIND.find((x) => x.value === kindOf(backup))!.label);
    toast(backup.repeat !== "none" ? `반복하는 ${what} 모두 지웠어요` : `${what} 지웠어요`, () => void upsert("events", [backup]));
  };

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      keep={dirty}
      title={event ? event.title : `새 ${k.label}`}
      headerAction={
        event && (
          <button type="button" className="btn danger sm" onClick={() => void del()}>
            <Trash2 aria-hidden="true" /> 삭제
          </button>
        )
      }
      footer={
        <>
          <button type="button" className="btn secondary" onClick={() => onOpenChange(false)}>취소</button>
          <button type="button" className="btn block" disabled={!valid} onClick={() => void save()}>
            저장
          </button>
        </>
      }
    >
      <div className="field">
        <Seg label="무엇을 만들까요" value={kind} onChange={setKind} options={KIND.map((x) => ({ value: x.value, label: x.label }))} />
        <p className="help" key={kind}>
          {k.help}
        </p>
      </div>

      <div className="field">
        <label htmlFor="ev-title">제목</label>
        <div className={`title-field ${live ? "has-time" : ""}`}>
          {live && (
            <span className="title-mirror" aria-hidden="true">
              <span ref={mirrorRef}>
                <span>{title.slice(0, live.index)}</span>
                {/* 누르면 시간으로 넣는다(포인터 전용 — 키보드는 띄어 쓰기). 누를 때 입력칸 초점을 빼앗지 않는다 */}
                <mark onPointerDown={(e) => e.preventDefault()} onClick={takeLive}>
                  {live.text}
                </mark>
                <span>{title.slice(live.end)}</span>
              </span>
            </span>
          )}
          <input ref={titleRef} id="ev-title" className="input" value={title} onChange={(e) => setTitle(timed && !(e.nativeEvent as InputEvent).isComposing ? take(e.target) : e.target.value)}
            onCompositionEnd={(e) => timed && setTitle(take(e.currentTarget))}
            onScroll={syncMirror} onSelect={syncMirror} placeholder={k.hint} maxLength={40} />
        </div>
        {live ? (
          <p className="help" role="status">
            띄어 쓰거나 시간을 누르면 {ro(timeText({ start_time: live.start, end_time: live.until }))} 시간에 넣어요
          </p>
        ) : (
          timed &&
          (startTime || endTime) && (
            <div className="time-chip">
              <Clock aria-hidden="true" />
              {timeText({ start_time: startTime || null, end_time: endTime || null })}
              <button
                type="button"
                aria-label="시간 지우기"
                onClick={() => {
                  setStartTime("");
                  setEndTime("");
                }}
              >
                <X aria-hidden="true" />
              </button>
            </div>
          )
        )}
      </div>

      <div className="field">
        {kind !== "dday" && (
          <span className="label" key={kind}>
            {kind === "todo" ? "언제까지" : "언제"}
          </span>
        )}
        {kind !== "dday" && (
          <Seg
            label="하루 또는 기간"
            value={ranged ? "range" : "day"}
            onChange={(v) => setRanged(v === "range")}
            options={[
              { value: "day", label: "하루" },
              { value: "range", label: kind === "todo" ? "기간 (신고·납부 기간)" : "기간" },
            ]}
          />
        )}
        <div className="inline-fields">
          <div className="field" style={{ marginTop: 0 }}>
            <label htmlFor="ev-start">{isRange ? "시작" : "날짜"}</label>
            <input id="ev-start" type="date" className="input" value={start} onChange={(e) => e.target.value && setStart(e.target.value)} />
          </div>
          {isRange && (
            <div className="field" style={{ marginTop: 0 }}>
              <label htmlFor="ev-end">끝 (그날까지)</label>
              <input id="ev-end" type="date" className="input" value={end} min={start} onChange={(e) => setEnd(e.target.value)} />
            </div>
          )}
        </div>
        {endBad && (
          <p className="help" role="alert">
            끝 날은 시작 날보다 앞일 수 없어요
          </p>
        )}
      </div>

      {timed && (
        <div className="field">
          <span className="label">시간 (비우면 하루 종일)</span>
          <div className="inline-fields">
            <div className="field" style={{ marginTop: 0 }}>
              <label htmlFor="ev-start-time">{isRange ? "첫날 시작" : "시작"}</label>
              <input id="ev-start-time" type="time" className="input" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </div>
            <div className="field" style={{ marginTop: 0 }}>
              <label htmlFor="ev-end-time">{isRange ? "끝 날 끝" : "끝"}</label>
              <input id="ev-end-time" type="time" className="input" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </div>
          </div>
          {timeBad && (
            <p className="help" role="alert">
              끝 시간은 시작 시간보다 앞일 수 없어요
            </p>
          )}
        </div>
      )}

      <div className="field">
        <span className="label">반복</span>
        <Seg label="반복" value={repeat} onChange={setRepeat} options={(["none", "monthly", "yearly"] as Repeat[]).map((r) => ({ value: r, label: REPEAT_LABEL[r] }))} />
        {kind === "todo" && repeat === "yearly" && <p className="help">1년에 두 번 내는 세금(재산세 등)은 매년 할 일을 두 개 만들어요. 반복하면 회차마다 따로 체크해요.</p>}
        {kind === "dday" && repeat === "none" && <p className="help">기념일은 매년으로 두면 해마다 다시 세요.</p>}
      </div>

      <div className="field">
        <span className="label">누구</span>
        <Seg
          label="누구"
          value={owner}
          onChange={setOwner}
          options={[
            { value: "joint", label: "공동" },
            { value: "a", label: nameOf(s, "a") },
            { value: "b", label: nameOf(s, "b") },
          ]}
        />
      </div>

      {kind === "todo" && (
        <>
          <div className="inline-fields field">
            <div className="field">
              <label htmlFor="ev-amount">낼 돈 (선택)</label>
              <AmountInput id="ev-amount" value={amount} onChange={setAmount} max={MAX_GOAL} />
            </div>
          </div>
          <div className="field">
            <div className="switchrow">
              <div>
                <div className="t">D-day 세기</div>
                <div className="s">D-day 목록에도 남은 날을 보여 줘요</div>
              </div>
              <Toggle on={dday} onChange={setDday} label="D-day 세기" />
            </div>
            {isRange && (
              <div className="switchrow">
                <div>
                  <div className="t">기간 동안 알림 모음에 고정</div>
                  <div className="s">예: 5월 내내 종 알림 맨 위에 &quot;양도소득세 신고 기간&quot;</div>
                </div>
                <Toggle on={pin} onChange={setPin} label="기간 동안 알림 모음에 고정" />
              </div>
            )}
          </div>
        </>
      )}

      <div className="field">
        <span className="label">미리 알림 (앱)</span>
        <div className="chips" role="radiogroup" aria-label="미리 알림" onKeyDown={radioKeys}>
          {REMIND.map((r, i) => (
            <button key={r.value} type="button" className="chip" role="radio" aria-checked={remind === r.value} tabIndex={radioTab(remind === r.value, i, REMIND.some((x) => x.value === remind))} onClick={() => setRemind(r.value)}>
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label htmlFor="ev-note">메모</label>
        <input id="ev-note" className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder={kind === "todo" ? "예: 홈택스에서 신고, 위택스로 납부" : "예: 장소, 준비물"} maxLength={500} />
      </div>

      {/* 꾹 누르기 메뉴에만 있던 일(복사·공유)을 시트에도 — 키보드·화면 읽기·꾹 누르기를 모르는 사람의 길. 저장한 내용을 쓰므로 고치던 중에는 막는다 */}
      {event && (
        <div className="field">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {onCopy && (
              <button type="button" className="btn secondary sm" disabled={dirty} aria-describedby={dirty ? "ev-more-help" : undefined} onClick={() => onCopy(event)}>
                <Copy aria-hidden="true" /> 복사
              </button>
            )}
            <button
              type="button"
              className="btn secondary sm"
              disabled={dirty}
              aria-describedby={dirty ? "ev-more-help" : undefined}
              // 반복 일정은 처음 날짜가 아니라 오늘부터 가장 가까운 회차를 보낸다 (없으면 처음 날짜)
              onClick={() => share(occurrences(event, today, addDays(today, 400))[0] ?? { event, start: event.start_date, end: event.end_date ?? event.start_date })}
            >
              <Share aria-hidden="true" /> 공유
            </button>
          </div>
          {dirty && (
            <p className="help" id="ev-more-help">
              고친 내용을 저장한 뒤 복사·공유할 수 있어요.
            </p>
          )}
        </div>
      )}
    </Sheet>
  );
}
