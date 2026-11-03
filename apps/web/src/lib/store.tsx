"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Check, Data, Month, MonthItem, Person, Row, Spending, TableName } from "./types";
import { getRepo, hasSupabase, currentMember, supabase, LIST_TABLES, ConflictError, RetryableError, upsertOp, deleteOp, type Change, type Op } from "./repo";
import { addMonths, currentMonth, itemsFromMonth, latestMonthBefore, monthRow, periodOf, snapshotItems, withUserNames } from "./calc";
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
  /**
   * 저장들. 화면에는 바로 반영하고 서버로 보낸다. 거절하지 않고 결과만 돌려준다:
   * true = 저장됨(또는 연결 문제로 폰에 보관, 나중에 보냄), false = 충돌·잘못된 값으로 못 함(알림과 다시 읽기는 이미 했음)
   */
  upsert: <T extends TableName>(table: T, rows: Row<T>[], opts?: { ignoreDuplicates?: boolean }) => Promise<boolean>;
  remove: (table: TableName, ids: string[]) => Promise<boolean>;
  /** 여러 저장을 한 번에 — 전부 되거나 전부 안 된다 (upsertOp / deleteOp 로 만든다) */
  batch: (ops: Op[]) => Promise<boolean>;
  /** 보내지 못하고 폰에 보관 중인 저장 수 (연결되면 자동으로 보낸다). 보내는 중인 것은 세지 않는다 */
  pending: number;
  startMonth: (month: string, opts?: { from?: string | null; oneOffs?: boolean }) => Promise<boolean>;
  toggleCheck: (c: Omit<Check, "done_at" | "done_by">, done: boolean) => Promise<void>;
  togglePaid: (item: MonthItem) => Promise<void>;
  /** 로그인한 사람(me)의 이름 바꾸기 — 다른 사람 이름은 그 사람만 바꾼다 */
  setMyName: (name: string) => Promise<void>;
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

/** 저장을 화면에 먼저 반영한다 (서버 응답 전, 그리고 서버에서 다시 읽은 뒤 아직 못 보낸 저장을 다시 얹을 때) */
function applyOpsLocal(d: Data, ops: Op[], only?: TableName): Data {
  for (const o of ops) {
    if (only && o.table !== only) continue;
    if (o.op === "upsert") d = applyLocal(d, o.table, o.rows as never, o.ignore_duplicates);
    else if (o.table !== "settings") {
      const key = o.table as (typeof LIST_TABLES)[number];
      d = { ...d, [key]: (d[key] as unknown as { id: string }[]).filter((x) => !o.ids.includes(x.id)) };
    }
  }
  return d;
}

/** 다른 줄에서 복사해 새로 만드는 줄: rev·만든 시각 같은 기록 칸은 서버가 새로 채우게 뺀다 */
export function fresh<T extends object>(row: T): T {
  const out = { ...row } as Record<string, unknown>;
  for (const k of ["rev", "created_at", "created_by", "updated_at", "updated_by"]) delete out[k];
  return out as T;
}

/** 보내지 못한 저장 (폰에 보관, 연결되면 순서대로 다시 보낸다) */
interface Pending {
  seq: number;
  ops: Op[];
  /** 이 저장을 만든 계정 — 다른 계정으로 로그인이 바뀌면 보내지 않는다 */
  email?: string | null;
}
const OUTBOX_KEY = "our-money-outbox";
const MAX_TRIES = 3;
/** 다시 보내기 전 기다림: 0.5·1·2초 … 에 무작위(지터)를 섞어 두 폰이 같은 순간에 몰리지 않게 */
const backoff = (attempt: number) => Math.min(8000, 500 * 2 ** attempt) * (0.5 + Math.random() * 0.5);
const sleep = (ms: number) => new Promise((r) => window.setTimeout(r, ms));

type Revved = { id: string | number; rev?: number };

/**
 * 서버가 보낸 줄을 붙인다 (저장 결과, 실시간 변경). 이미 더 새 rev 를 갖고 있으면 늦게 온 옛 줄은 버린다.
 */
function mergeServer(d: Data, table: TableName, rows: Revved[]): Data {
  if (table === "settings") {
    const row = rows[0] as unknown as Data["settings"] | undefined;
    if (!row || (d.settings.rev ?? 0) > (row.rev ?? 0)) return d;
    return { ...d, settings: { ...d.settings, ...row } };
  }
  const key = table as (typeof LIST_TABLES)[number];
  const list = [...(d[key] as unknown as Revved[])];
  for (const row of rows) {
    const i = list.findIndex((x) => x.id === row.id);
    if (i < 0) list.push(row);
    else if ((list[i].rev ?? 0) <= (row.rev ?? 0)) list[i] = { ...list[i], ...row };
  }
  return { ...d, [key]: list };
}

function applyChange(d: Data, c: Exclude<Change, { type: "RELOAD" }>): Data {
  if (c.type === "DELETE") {
    if (c.table === "settings") return d;
    const key = c.table as (typeof LIST_TABLES)[number];
    return { ...d, [key]: (d[key] as unknown as Revved[]).filter((x) => String(x.id) !== c.id) };
  }
  return mergeServer(d, c.table, [c.row as unknown as Revved]);
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
  const outbox = useRef<Pending[]>([]);
  /** 지금 로그인한 멤버 계정 (멤버가 아니거나 로그아웃이면 null) */
  const authEmail = useRef<string | null>(null);
  const [pending, setPending] = useState(0);

  const reload = useCallback(
    async (table?: TableName) => {
      if (!repo) return;
      try {
        if (table) {
          // 바뀐 테이블만 다시 불러온다
          const rows = await repo.loadTable(table, { spendingsFrom: spendingsFrom.current });
          const pend = outbox.current.flatMap((p) => p.ops);
          setData((d) =>
            d ? applyOpsLocal(table === "settings" ? { ...d, settings: rows as Data["settings"] } : { ...d, [table]: rows }, pend, table) : d,
          );
          return;
        }
        const d = await repo.load({ spendingsFrom: spendingsFrom.current });
        lastFull.current = Date.now();
        // 아직 보내지 못한 저장은 다시 얹는다 (서버 내용으로 덮어 입력이 사라지지 않게)
        setData(applyOpsLocal(d, outbox.current.flatMap((p) => p.ops)));
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
      let res: Awaited<ReturnType<typeof currentMember>>;
      try {
        res = await currentMember();
      } catch (e) {
        // 연결이 안 돼 확인하지 못함: 로그인 상태는 그대로 두고, 연결이 돌아오면 다시 확인한다
        if (alive) setError(`연결할 수 없어요. 인터넷 연결을 확인해 주세요 (${e instanceof Error ? e.message : e})`);
        return;
      }
      if (!alive) return;
      setError(null);
      if (!res || !res.member) authEmail.current = null;
      if (!res) setAuth({ state: "signed-out" });
      else if (!res.member) setAuth({ state: "not-member", email: res.email });
      else {
        setMeState(res.member.person);
        setAuth({ state: "member", email: res.email });
      }
    };
    void check();
    const sub = supabase()?.auth.onAuthStateChange(() => void check());
    const online = () => void check();
    window.addEventListener("online", online);
    return () => {
      alive = false;
      sub?.data.subscription.unsubscribe();
      window.removeEventListener("online", online);
    };
  }, [repo]);

  // 데이터 로드와 실시간 동기화: 처음엔 전체, 그다음엔 바뀐 테이블만
  useEffect(() => {
    if (!repo || (auth.state !== "demo" && auth.state !== "member")) return;
    void reload();
    let timer: number | undefined;
    const unsub = repo.subscribe((c) => {
      // 바뀐 줄을 바로 붙인다. 무엇이 바뀌었는지 모를 때만 다시 읽는다
      if (c.type !== "RELOAD") {
        setData((d) => (d ? applyChange(d, c) : d));
        return;
      }
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void reload(c.table), 200);
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

  // 내가 저장한 rev 의 이어짐: 저장 전 rev → 서버가 준 rev. 옛 rev 로 만든 줄(빠른 연속 수정, 되돌리기)을 내 최신 rev 로 맞춘다
  const myRevs = useRef(new Map<string, Map<number, number>>());
  const rebase = useCallback((table: TableName, row: Revved): Revved => {
    if (row.rev == null) return row;
    const chain = myRevs.current.get(`${table}:${row.id}`);
    let rev = row.rev;
    while (chain?.has(rev)) rev = chain.get(rev)!;
    return rev === row.rev ? row : { ...row, rev };
  }, []);
  const remember = useCallback((table: TableName, sent: Revved[], saved: Revved[]) => {
    for (const s of saved) {
      const before = sent.find((x) => x.id === s.id)?.rev;
      if (before == null || s.rev == null || before === s.rev) continue;
      const key = `${table}:${s.id}`;
      const chain = myRevs.current.get(key) ?? new Map<number, number>();
      chain.set(before, s.rev);
      myRevs.current.set(key, chain);
    }
  }, []);

  /*
   * 저장 대기열 (outbox). 모든 저장은 여기 줄을 서고 한 번에 하나씩 순서대로 나간다
   * (같은 줄을 빠르게 두 번 고쳐도, 외래키 순서도 지켜지게).
   * - 네트워크·서버 문제(RetryableError): 기다렸다가 최대 3번 다시 보낸다. 그래도 안 되면 폰에 보관하고
   *   연결이 돌아오거나 앱으로 돌아올 때 다시 보낸다. 같은 저장을 여러 번 보내도 안전하다:
   *   id 로 upsert 하고, 내용이 같은 수정은 DB 가 건너뛰고(rev 확인 전에), 지운 줄을 또 지우면 0줄이다.
   * - 충돌(ConflictError)·잘못된 값: 다시 보내지 않고 서버 내용으로 다시 읽는다.
   */
  const waiters = useRef(new Map<number, { resolve: () => void; reject: (e: unknown) => void }>());
  const seq = useRef(0);
  const flushing = useRef(false);
  const parkedToast = useRef(0);
  const persist = useCallback(() => {
    setPending((n) => (outbox.current.length === 0 ? 0 : n > 0 ? outbox.current.length : n));
    if (!hasSupabase) return;
    try {
      if (outbox.current.length === 0) localStorage.removeItem(OUTBOX_KEY);
      else localStorage.setItem(OUTBOX_KEY, JSON.stringify({ email: authEmail.current, items: outbox.current }));
    } catch {}
  }, []);

  /** 지웠는데 서버에 아직 남아 있으면 되살리고 알린다 */
  const verifyDeleted = useCallback(
    async (table: TableName, ids: string[]) => {
      if (!repo || table === "settings") return;
      try {
        const rows = (await repo.loadTable(table, { spendingsFrom: spendingsFrom.current })) as unknown as { id: string }[];
        setData((d) => (d ? applyOpsLocal({ ...d, [table]: rows }, outbox.current.flatMap((p) => p.ops), table) : d));
        if (rows.some((r) => ids.includes(r.id))) toast("지우지 못했어요. 로그인 상태를 확인해 주세요");
      } catch {}
    },
    [repo, toast],
  );

  const flush = useCallback(async () => {
    if (!repo || flushing.current) return;
    flushing.current = true;
    try {
      let attempt = 0;
      while (outbox.current.length > 0) {
        const head = outbox.current[0];
        // 저장을 만든 계정과 지금 로그인한 계정이 다르면 (다른 탭에서 로그아웃·다른 계정 로그인) 보내지 않고 버린다
        if (hasSupabase && (head.email ?? null) !== authEmail.current) {
          outbox.current = outbox.current.slice(1);
          persist();
          waiters.current.get(head.seq)?.reject(new Error("account changed"));
          waiters.current.delete(head.seq);
          continue;
        }
        const sent: Op[] = head.ops.map((o) =>
          o.op === "upsert" ? { ...o, rows: o.rows.map((r) => rebase(o.table, r as Revved) as unknown as Record<string, unknown>) } : o,
        );
        const done = (err?: unknown) => {
          outbox.current = outbox.current.filter((p) => p.seq !== head.seq);
          persist();
          const w = waiters.current.get(head.seq);
          waiters.current.delete(head.seq);
          if (err === undefined) w?.resolve();
          else w?.reject(err);
        };
        try {
          const results = await repo.apply(sent);
          results.forEach((res, i) => {
            const o = sent[i];
            if (o?.op === "upsert" && res.rows) {
              remember(o.table, o.rows as Revved[], res.rows as Revved[]);
              if (res.rows.length) setData((d) => (d ? mergeServer(d, o.table, res.rows as Revved[]) : d));
            }
            // 지우려던 줄보다 적게 지워졌으면: 이미 다른 폰이 지웠거나, 권한이 없어 지워지지 않았다 → 서버 내용으로 확인
            if (o?.op === "delete" && (res.deleted ?? o.ids.length) < o.ids.length) void verifyDeleted(o.table, o.ids);
          });
          attempt = 0;
          done();
        } catch (e) {
          if (e instanceof RetryableError) {
            if (attempt < MAX_TRIES) {
              await sleep(backoff(attempt++));
              continue;
            }
            // 3번 다 실패: 보관해 두고 멈춘다. 다음 저장·연결 복구·앱 복귀 때 다시 시도
            if (Date.now() - parkedToast.current > 60_000) {
              parkedToast.current = Date.now();
              toast("연결이 불안정해요. 저장할 내용을 폰에 보관했다가 연결되면 보낼게요");
            }
            setPending(outbox.current.length);
            for (const p of outbox.current) {
              waiters.current.get(p.seq)?.resolve();
              waiters.current.delete(p.seq);
            }
            return;
          }
          done(e);
          const tables = [...new Set(head.ops.map((o) => o.table))];
          if (e instanceof ConflictError) {
            toast("다른 폰에서 먼저 바꿨어요. 최신 내용으로 다시 불러왔어요");
            for (const t of tables) await reload(t);
          } else {
            toast(`저장하지 못했어요: ${e instanceof Error ? e.message : e}`);
            await reload();
          }
        }
      }
    } finally {
      flushing.current = false;
    }
  }, [repo, rebase, remember, persist, reload, toast, verifyDeleted]);

  const batch = useCallback(
    async (ops: Op[]) => {
      if (!repo) return false;
      const real = ops.filter((o) => (o.op === "upsert" ? o.rows.length > 0 : o.ids.length > 0));
      if (real.length === 0) return true;
      setData((d) => (d ? applyOpsLocal(d, real) : d));
      const p: Pending = { seq: ++seq.current, ops: real, email: authEmail.current };
      outbox.current = [...outbox.current, p];
      persist();
      const settled = new Promise<boolean>((resolve) =>
        waiters.current.set(p.seq, { resolve: () => resolve(true), reject: () => resolve(false) }),
      );
      void flush();
      return settled;
    },
    [repo, persist, flush],
  );

  const upsert = useCallback(
    <T extends TableName>(table: T, rows: Row<T>[], opts?: { ignoreDuplicates?: boolean }) => batch([upsertOp(table, rows, opts)]),
    [batch],
  );
  const remove = useCallback((table: TableName, ids: string[]) => batch([deleteOp(table, ids)]), [batch]);

  // 보관해 둔 저장: 로그인한 같은 계정이면 이어서 보내고, 연결이 돌아오면·앱으로 돌아오면 다시 시도
  useEffect(() => {
    if (!repo || auth.state !== "member") return;
    authEmail.current = auth.email;
    try {
      const raw = localStorage.getItem(OUTBOX_KEY);
      if (raw && outbox.current.length === 0) {
        const saved = JSON.parse(raw) as { email?: string; items?: Pending[] };
        if (saved.email === auth.email && Array.isArray(saved.items) && saved.items.length > 0) {
          outbox.current = saved.items.map((p) => ({ ...p, seq: ++seq.current, email: auth.email }));
          setData((d) => (d ? applyOpsLocal(d, outbox.current.flatMap((x) => x.ops)) : d));
          setPending(outbox.current.length);
        } else localStorage.removeItem(OUTBOX_KEY);
      }
    } catch {}
    void flush();
    const retry = () => void flush();
    window.addEventListener("online", retry);
    window.addEventListener("focus", retry);
    const timer = window.setInterval(() => {
      if (outbox.current.length > 0) retry();
    }, 30_000);
    return () => {
      window.removeEventListener("online", retry);
      window.removeEventListener("focus", retry);
      window.clearInterval(timer);
    };
  }, [repo, auth, flush]);

  const setMyName = useCallback(
    async (name: string) => {
      if (!repo) return;
      const next = name.trim().slice(0, 20);
      setData((d) => {
        if (!d) return d;
        const has = d.users.some((u) => u.person === me);
        const users = has
          ? d.users.map((u) => (u.person === me ? { ...u, name: next } : u))
          : [...d.users, { id: `local-${me}`, email: "", person: me, name: next }];
        return { ...d, users };
      });
      try {
        await repo.updateMyName(me, next);
      } catch (e) {
        toast(`이름을 바꾸지 못했어요: ${e instanceof Error ? e.message : e}`);
        await reload();
        throw e;
      }
    },
    [repo, me, reload, toast],
  );

  /**
   * 달 플랜 만들기. from 을 주면 그 달 플랜을 그대로 이어받고(수입 포함), 없으면 반복 항목으로 새로 만든다.
   */
  const startMonth = useCallback(
    async (m: string, opts: { from?: string | null; oneOffs?: boolean } = {}) => {
      if (!data) return false;
      const src = opts.from ? monthRow(data, opts.from) : monthRow(data, addMonths(m, -1));
      const row: Month = {
        id: m,
        income_a: src?.income_a ?? data.settings.salary_a,
        income_b: src?.income_b ?? data.settings.salary_b,
        extra_income: 0,
        extra_note: "",
        created_at: new Date().toISOString(),
      };
      const items = (opts.from ? itemsFromMonth(data, opts.from, m, { oneOffs: opts.oneOffs }) : snapshotItems(m, data.plan_items)).map(fresh);
      // 달과 항목을 한 트랜잭션으로: 달만 생기고 항목이 빠진 반쪽 달이 남지 않게
      return batch([upsertOp("months", [row], { ignoreDuplicates: true }), upsertOp("month_items", items, { ignoreDuplicates: true })]);
    },
    [data, batch],
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
    void startMonth(cur, { from }).then((ok) => {
      if (!ok) return;
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

  // 화면에는 각자 계정의 이름을 쓴다 (계산과 저장은 원본 data 로)
  const view = useMemo(() => (data ? withUserNames(data) : null), [data]);

  const value: Store = {
    auth,
    data: view,
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
    batch,
    pending,
    startMonth,
    toggleCheck,
    togglePaid,
    setMyName,
    toasts,
    toast,
    dismissToast,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
