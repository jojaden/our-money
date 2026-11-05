"use client";

import { useState } from "react";
import { Share2, Download } from "lucide-react";
import { useData } from "@/lib/store";
import { occurrences, type Range } from "@/lib/calendar";
import { eventKind, toIcs } from "@/lib/ics";
import { appCan, toApp, useInApp } from "@/lib/native";
import { Seg, Sheet } from "./ui";

/**
 * 일정 내보내기 — 달력의 일정·할 일·D-day 를 .ics 파일로. 구글·애플·삼성 캘린더로 옮길 때 쓴다.
 * 웹은 파일을 내려받고, 안드로이드 앱은 공유 창을 연다(앱이 파일을 만들어 넘긴다 — MainActivity).
 * 기간을 고르면 그 기간에 한 번이라도 걸치는 일정만(반복 일정은 반복째로) 넣는다.
 */
export function IcsSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { data, today, toast } = useData();
  const [scope, setScope] = useState<"all" | "range">("all");
  const [range, setRange] = useState<Range>(() => ({ from: today, to: `${Number(today.slice(0, 4)) + 1}${today.slice(4)}` }));
  const events = scope === "all" ? data.events : data.events.filter((e) => occurrences(e, range.from, range.to).length > 0);
  const count = (k: ReturnType<typeof eventKind>) => events.filter((e) => eventKind(e) === k).length;
  const app = useInApp();
  // 예전 앱은 공유를 못 하고 웹뷰는 내려받기도 못 한다 → 앱을 새로 받으라고만
  const share = app && appCan("ics");

  const save = () => {
    const text = toIcs(events, data.settings);
    if (share) toApp({ type: "ics", text });
    else {
      const url = URL.createObjectURL(new Blob([text], { type: "text/calendar;charset=utf-8" }));
      const a = Object.assign(document.createElement("a"), { href: url, download: `우리집-일정-${today.replace(/-/g, "")}.ics` });
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast(`일정 ${events.length}개를 파일로 내려받았어요`);
    }
    onOpenChange(false);
  };

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="일정 내보내기"
      footer={
        <button type="button" className="btn block" disabled={events.length === 0 || (app && !share)} onClick={save}>
          {share ? <Share2 aria-hidden="true" /> : <Download aria-hidden="true" />}{" "}
          {events.length === 0 ? "내보낼 일정이 없어요" : app && !share ? "앱을 새로 받으면 공유할 수 있어요" : share ? "공유하기" : ".ics 파일 내려받기"}
        </button>
      }
    >
      <p className="sheet-lead">달력의 일정·할 일·D-day를 .ics 파일로 꺼내요. 구글·애플·삼성 캘린더가 모두 가져올 수 있어요. 앱에는 그대로 남아요.</p>
      <div className="field" style={{ marginTop: 14 }}>
        <Seg
          label="내보낼 범위"
          value={scope}
          onChange={setScope}
          options={[
            { value: "all", label: "모든 일정" },
            { value: "range", label: "기간" },
          ]}
        />
      </div>
      {scope === "range" && (
        <div className="inline-fields field">
          <div className="field" style={{ marginTop: 0 }}>
            <label htmlFor="ics-from">시작</label>
            <input id="ics-from" type="date" className="input" value={range.from} max={range.to} onChange={(e) => e.target.value && setRange((r) => ({ from: e.target.value, to: r.to < e.target.value ? e.target.value : r.to }))} />
          </div>
          <div className="field" style={{ marginTop: 0 }}>
            <label htmlFor="ics-to">끝 (그날까지)</label>
            <input id="ics-to" type="date" className="input" value={range.to} min={range.from} onChange={(e) => e.target.value && setRange((r) => ({ from: r.from > e.target.value ? e.target.value : r.from, to: e.target.value }))} />
          </div>
        </div>
      )}
      <p className="range-now" key={`${scope}${events.length}`}>
        {`일정 ${count("일정")}개 · 할 일 ${count("할 일")}개 · D-day ${count("D-day")}개`}
        <span className="s"> (반복은 하나로 세요)</span>
      </p>
      <div className="field">
        <h3 className="sum-h">옮기는 법</h3>
        <ul className="howto">
          <li>
            <b>구글 캘린더</b> 컴퓨터에서 calendar.google.com → 설정 → 가져오기/내보내기 → 파일을 고르고 넣을 캘린더 선택. 새 캘린더(예: 우리 집)를 만들어 넣으면 나중에 한 번에 지울 수 있어요.
          </li>
          <li>
            <b>애플 캘린더</b> 아이폰·맥에서 파일을 열고 &quot;모두 추가&quot;.
          </li>
          <li>
            <b>삼성 캘린더</b> 구글 계정과 동기화되어 있으면 구글로 가져온 것이 그대로 보여요. 기기에 따라 파일을 열어 바로 가져올 수도 있어요.
          </li>
        </ul>
        <p className="help">체크 완료 여부와 사람 색은 옮겨지지 않아요. 누구·낼 돈·메모는 설명에, 미리 알림은 알림으로 들어가요(구글은 그 캘린더의 기본 알림을 써요). 구글에 같은 파일을 두 번 가져오면 겹칠 수 있어요.</p>
      </div>
    </Sheet>
  );
}
