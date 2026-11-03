"use client";

import { useState } from "react";
import { ArrowRight, ChevronDown } from "lucide-react";
import { useData } from "@/lib/store";
import { nameOf } from "@/lib/calc";
import { CheckButton, Money } from "./ui";
import { dueState, dueText, type Task } from "./tasks";

export function TaskRow({ task, expandable = false }: { task: Task; expandable?: boolean }) {
  const { data, today } = useData();
  const s = data.settings;
  const [open, setOpen] = useState(false);
  const state = dueState(task.due, today, task.done);
  const label = `${task.title} ${task.done ? "완료 취소" : "완료로 표시"}`;

  const meta = task.done ? (
    <span className="s">{task.doneBy ? `${nameOf(s, task.doneBy)} 완료` : "완료"}</span>
  ) : state === "overdue" ? (
    <span className="pill negative">{dueText(task.due, today)}</span>
  ) : state === "soon" ? (
    <span className="pill warning">{dueText(task.due, today)}</span>
  ) : task.due ? (
    <span className="s">{dueText(task.due, today)}</span>
  ) : null;

  return (
    <>
      <div className={`row ${task.done ? "done" : ""}`}>
        <CheckButton on={task.done} onToggle={task.toggle} label={label} />
        <div style={{ minWidth: 0 }}>
          {task.kind === "transfer" ? (
            <div className="t flow">
              <span className="acc">{task.from}</span>
              <span className="acc">
                <ArrowRight aria-label="에서" />
                {task.to}
              </span>
            </div>
          ) : (
            <div className="t">{task.title}</div>
          )}
          {expandable && task.transfer && task.transfer.parts.length > 1 ? (
            <button
              type="button"
              className="s"
              style={{ display: "inline-flex", alignItems: "center", gap: 4, border: 0, background: "none", padding: 0, color: "var(--muted)", maxWidth: "100%" }}
              aria-expanded={open}
              onClick={() => setOpen((v) => !v)}
            >
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{task.sub}</span>
              <ChevronDown aria-hidden="true" width={14} height={14} style={{ flex: "none", transform: open ? "rotate(180deg)" : undefined, transition: "transform 200ms var(--ease-out)" }} />
            </button>
          ) : (
            <div className="s">{task.sub}</div>
          )}
        </div>
        <div className="r">
          <Money value={task.amount} />
          <div style={{ marginTop: 2 }}>{meta}</div>
        </div>
      </div>
      {open && task.transfer && (
        <div className="parts">
          {task.transfer.parts.map((p) => (
            <div className="p" key={p.item.id}>
              <span>
                {p.item.name}
                {p.item.payer === "joint" && p.amount !== p.item.amount ? ` (${nameOf(s, task.transfer!.person)} 몫)` : ""}
              </span>
              <Money value={p.amount} />
            </div>
          ))}
        </div>
      )}
    </>
  );
}
