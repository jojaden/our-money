"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Check, Data, Month, MonthItem, Person, Row, Spending, TableName } from "./types";
import { getRepo, hasSupabase, currentMember, supabase, LIST_TABLES } from "./repo";
import { addMonths, currentMonth, itemsFromMonth, latestMonthBefore, monthRow, periodOf, snapshotItems } from "./calc";
import { haptic } from "./native";

type Auth =
  | { state: "loading" }
  | { state: "demo" }
  | { state: "signed-out" }
  | { state: "not-member"; email: string }
  | { state: "member"; email: string };

interface Toast {
  id: number;
  text: string;
  undo?: () => void;
}

interface Store {
  auth: Auth;
  data: Data | null;
  error: string | null;
  me: Person;
  setMe: (p: Person) => void;
  month: string;
  setMonth: (m: string) => void;
  today: string;
  reload: (table?: TableName) => Promise<void>;
  exportSpendings: () => Promise<Spending[]>;
  upsert: <T extends TableName>(table: T, rows: Row<T>[], opts?: { ignoreDuplicates?: boolean }) => Promise<void>;
  remove: (table: TableName, ids: string[]) => Promise<void>;
  startMonth: (month: string, opts?: { from?: string | null; oneOffs?: boolean }) => Promise<void>;
  toggleCheck: (c: Omit<Check, "done_at" | "done_by">, done: boolean) => Promise<void>;
  togglePaid: (item: MonthItem) => Promise<void>;
  toasts: Toast[];
  toast: (text: string, undo?: () => void) => void;
  dismissToast: (id: number) => void;
}

const Ctx = createContext<Store | null>(null);

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error("StoreProvider 가 없습니다");
  return s;
}

/** 데이터가 준비된 화면에서만 쓴다 */
export function useData(): Store & { data: Data } {
  const s = useStore();
  if (!s.data) throw new Error("데이터가 아직 없습니다");
  return s as Store & { data: Data };
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const ME_KEY = "our-money-me";
const MONTH_KEY = "our-money-month";

function applyLocal<T extends TableName>(d: Data, table: T, rows: Row<T>[], ignoreDuplicates?: boolean): Data {
  if (table === "settings") return { ...d, settings: { ...d.settings, ...(rows[0] as Data["settings"]) } };
  const key = table as (typeof LIST_TABLES)[number];
  const list = [...(d[key] as unknown as { id: string }[])];
  for (const row of rows as unknown as { id: string }[]) {
    const i = list.findIndex((x) => x.id === row.id);
    if (i >= 0) {
      if (!ignoreDuplicates) list[i] = { ...list[i], ...row };
    } else list.push(row);
  }
  return { ...d, [key]: list };
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [auth, setAuth] = useState<Auth>({ state: "loading" });
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [me, setMeState] = useState<Person>("a");
  const [month, setMonthState] = useState<string>("");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [today] = useState(todayStr);
  const toastSeq = useRef(0);
  const repo = useMemo(() => (typeof window === "undefined" ? null : getRepo()), []);

  const toast = useCallback((text: string, undo?: () => void) => {
    const id = ++toastSeq.current;
    setToasts((t) => [...t.slice(-2), { id, text, undo }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), undo ? 5000 : 2600);
  }, []);
  const dismissToast = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  // 지출은 최근 약 13개월만 불러온다 (그 이전 달을 열면 그때 그 기간만 더 불러온다)
  const spendingsFrom = useRef<string>(
    (() => {
      const d = new Date(today);
      d.setDate(d.getDate() - 400);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    })(),
  );
  const lastFull = useRef(0);

  const reload = useCallback(
    async (table?: TableName) => {
      if (!repo) return;
      try {
        if (table) {
          // 바뀐 테이블만 다시 불러온다
          const rows = await repo.loadTable(table, { spendingsFrom: spendingsFrom.current });
          setData((d) => (d ? (table === "settings" ? { ...d, settings: rows as Data["settings"] } : { ...d, [table]: rows }) : d));
          return;
        }
        const d = await repo.load({ spendingsFrom: spendingsFrom.current });
        lastFull.current = Date.now();
        setData(d);
        setError(null);
        setMonthState((m) => {
          if (m) return m;
          let saved: string | null = null;
          try {
            saved = sessionStorage.getItem(MONTH_KEY);
          } catch {}
          return saved ?? currentMonth(d.settings.cycle_start, today);
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [repo, today],
  );

  const exportSpendings = useCallback(async () => (repo ? repo.exportSpendings() : []), [repo]);

  // 로그인 상태
  useEffect(() => {
    if (!repo) return;
    if (!hasSupabase) {
      setAuth({ state: "demo" });
      try {
        const saved = localStorage.getItem(ME_KEY);
        if (saved === "a" || saved === "b") setMeState(saved);
      } catch {}
      return;
    }
    let alive = true;
    const check = async () => {
      const res = await currentMember();
      if (!alive) return;
      if (!res) setAuth({ state: "signed-out" });
      else if (!res.member) setAuth({ state: "not-member", email: res.email });
      else {
        setMeState(res.member.person);
        setAuth({ state: "member", email: res.email });
      }
    };
    void check();
    const sub = supabase()?.auth.onAuthStateChange(() => void check());
    return () => {
      alive = false;
      sub?.data.subscription.unsubscribe();
    };
  }, [repo]);

  // 데이터 로드와 실시간 동기화: 처음엔 전체, 그다음엔 바뀐 테이블만
  useEffect(() => {
    if (!repo || (auth.state !== "demo" && auth.state !== "member")) return;
    void reload();
    const pending = new Set<TableName>();
    let timer: number | undefined;
    const unsub = repo.subscribe((t) => {
      pending.add(t);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const tables = [...pending];
        pending.clear();
        for (const x of tables) void reload(x);
      }, 200);
    });
    // 앱으로 돌아왔을 때: 실시간 연결이 끊겼을 수 있으니 30초 이상 지났으면 전체를 다시
    const onFocus = () => {
      if (Date.now() - lastFull.current > 30_000) void reload();
    };
    window.addEventListener("focus", onFocus);
    return () => {
      unsub();
      window.removeEventListener("focus", onFocus);
      window.clearTimeout(timer);
    };
  }, [repo, auth.state, reload]);

  // 불러온 범위보다 이전 달을 보면 그 기간 지출만 더 불러온다
  useEffect(() => {
    if (!repo || !data || !month) return;
    const start = periodOf(addMonths(month, -1), data.settings.cycle_start).start; // 지난달 비교·카드값까지
    if (start >= spendingsFrom.current) return;
    const until = spendingsFrom.current;
    spendingsFrom.current = start;
    void repo.loadSpendings(start, until).then((older) => {
      setData((d) => {
        if (!d) return d;
        const have = new Set(d.spendings.map((x) => x.id));
        return { ...d, spendings: [...d.spendings, ...older.filter((x) => !have.has(x.id))] };
      });
    });
  }, [repo, data, month]);

  const setMonth = useCallback((m: string) => {
    setMonthState(m);
    try {
      sessionStorage.setItem(MONTH_KEY, m);
    } catch {}
  }, []);

  const setMe = useCallback((p: Person) => {
    setMeState(p);
    try {
      localStorage.setItem(ME_KEY, p);
    } catch {}
  }, []);

  const upsert = useCallback(
    async <T extends TableName>(table: T, rows: Row<T>[], opts?: { ignoreDuplicates?: boolean }) => {
      if (!repo) return;
      setData((d) => (d ? applyLocal(d, table, rows, opts?.ignoreDuplicates) : d));
      try {
        await repo.upsert(table, rows, opts);
      } catch (e) {
        toast(`저장하지 못했어요: ${e instanceof Error ? e.message : e}`);
        await reload();
        throw e;
      }
    },
    [repo, reload, toast],
  );

  const remove = useCallback(
    async (table: TableName, ids: string[]) => {
      if (!repo) return;
      setData((d) => {
        if (!d || table === "settings") return d;
        const key = table as (typeof LIST_TABLES)[number];
        return { ...d, [key]: (d[key] as unknown as { id: string }[]).filter((x) => !ids.includes(x.id)) };
      });
      try {
        await repo.remove(table, ids);
      } catch (e) {
        toast(`삭제하지 못했어요: ${e instanceof Error ? e.message : e}`);
        await reload();
      }
    },
    [repo, reload, toast],
  );

  /**
   * 달 플랜 만들기. from 을 주면 그 달 플랜을 그대로 이어받고(수입 포함), 없으면 반복 항목으로 새로 만든다.
   */
  const startMonth = useCallback(
    async (m: string, opts: { from?: string | null; oneOffs?: boolean } = {}) => {
      if (!data) return;
      const src = opts.from ? monthRow(data, opts.from) : monthRow(data, addMonths(m, -1));
      const row: Month = {
        id: m,
        income_a: src?.income_a ?? data.settings.salary_a,
        income_b: src?.income_b ?? data.settings.salary_b,
        extra_income: 0,
        extra_note: "",
        created_at: new Date().toISOString(),
      };
      const items = opts.from ? itemsFromMonth(data, opts.from, m, { oneOffs: opts.oneOffs }) : snapshotItems(m, data.plan_items);
      await upsert("months", [row], { ignoreDuplicates: true });
      await upsert("month_items", items, { ignoreDuplicates: true });
    },
    [data, upsert],
  );

  // 새 달이 시작되면 지난 플랜을 그대로 이어받아 자동으로 만든다 (앱을 열 때 한 번)
  const autoStarted = useRef<string | null>(null);
  useEffect(() => {
    if (!data || (auth.state !== "member" && auth.state !== "demo")) return;
    const cur = currentMonth(data.settings.cycle_start, today);
    if (autoStarted.current === cur || monthRow(data, cur)) return;
    const from = latestMonthBefore(data, cur);
    if (!from) return;
    autoStarted.current = cur;
    void startMonth(cur, { from }).then(() => {
      const label = (k: string) => `${Number(k.slice(5))}월`;
      toast(`${label(cur)}이 시작돼서 ${label(from)} 플랜을 그대로 이어받았어요`);
    });
  }, [data, auth.state, today, startMonth, toast]);

  const toggleCheck = useCallback(
    async (c: Omit<Check, "done_at" | "done_by">, done: boolean) => {
      haptic(done ? [12, 40, 12] : 8);
      if (done) await upsert("checks", [{ ...c, done_at: new Date().toISOString(), done_by: me }]);
      else await remove("checks", [c.id]);
    },
    [upsert, remove, me],
  );

  const togglePaid = useCallback(
    async (item: MonthItem) => {
      const paid = !item.paid;
      haptic(paid ? [12, 40, 12] : 8);
      await upsert("month_items", [{ ...item, paid, paid_at: paid ? new Date().toISOString() : null, paid_by: paid ? me : null }]);
    },
    [upsert, me],
  );

  const value: Store = {
    auth,
    data,
    error,
    me,
    setMe,
    month,
    setMonth,
    today,
    reload,
    exportSpendings,
    upsert,
    remove,
    startMonth,
    toggleCheck,
    togglePaid,
    toasts,
    toast,
    dismissToast,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
