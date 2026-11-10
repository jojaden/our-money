// 저장소: Supabase 가 설정되어 있으면 Supabase, 아니면 브라우저 저장소의 데모 데이터.
// 두 구현 모두 같은 테이블 단위 연산만 제공한다.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Data, HistoryRow, Member, Person, Row, Spending, TableName, User } from "./types";
import { buildDemoData } from "./demo-data";
import { inApp } from "./native";

export const LIST_TABLES = [
  "accounts",
  "plan_items",
  "months",
  "month_items",
  "checks",
  "categories",
  "spendings",
  "users",
  "events",
] as const satisfies readonly TableName[];

/** 다른 폰이 먼저 같은 줄을 고쳐서 서버가 저장을 거절했다 (SQLSTATE OM409, migrations/005. 005 전에는 40001 + "conflict:") */
export class ConflictError extends Error {}
/** 잠깐의 문제(네트워크, 서버 5xx·429, 교착 40P01, 직렬화 40001) — 같은 저장을 다시 보내면 된다 */
export class RetryableError extends Error {}

/** 저장 한 건. 여러 건을 한 번에 보내면 한 트랜잭션으로 처리된다 (apply_batch) */
export type Op =
  | { table: TableName; op: "upsert"; rows: Record<string, unknown>[]; ignore_duplicates?: boolean }
  | { table: TableName; op: "delete"; ids: string[] };
/** Op 와 같은 순서. upsert 는 서버가 저장한 줄(내용이 같아 건너뛴 줄·이미 있던 줄은 빠짐), delete 는 실제로 지운 줄 수 */
export type OpResult = { table: TableName; rows?: Record<string, unknown>[]; deleted?: number };

export function upsertOp<T extends TableName>(table: T, rows: Row<T>[], opts?: { ignoreDuplicates?: boolean }): Op {
  return { table, op: "upsert", rows: rows as unknown as Record<string, unknown>[], ...(opts?.ignoreDuplicates ? { ignore_duplicates: true } : {}) };
}
export function deleteOp(table: TableName, ids: string[]): Op {
  return { table, op: "delete", ids };
}

/** 실시간 변경 한 건. RELOAD 는 무엇이 바뀌었는지 모를 때 (데모의 다른 탭, 실시간 연결이 다시 붙었을 때) — table 이 없으면 전부 */
export type Change =
  | { type: "INSERT" | "UPDATE"; table: TableName; row: Record<string, unknown> }
  | { type: "DELETE"; table: TableName; id: string }
  | { type: "RELOAD"; table?: TableName };

export interface LoadOpts {
  /** 이 날짜(YYYY-MM-DD)부터의 지출만 불러온다. 지출만 계속 쌓이는 테이블이라 기간으로 자른다. */
  spendingsFrom?: string;
}

export interface Repo {
  mode: "demo" | "supabase";
  load(opts?: LoadOpts): Promise<Data>;
  /** 한 테이블만 다시 불러온다 (실시간 변경 반영용) */
  loadTable<T extends TableName>(table: T, opts?: LoadOpts): Promise<T extends "settings" ? Data["settings"] : Row<T>[]>;
  /** [from, to) 기간의 지출 — 불러온 범위보다 이전 달을 볼 때 */
  loadSpendings(from: string, to: string): Promise<Spending[]>;
  /** 내보내기용 전체 지출 (날짜·id 순) */
  exportSpendings(): Promise<Spending[]>;
  /** 바뀐 기록 — 최근 것부터 한 쪽(HISTORY_PAGE 건). before 를 주면 그 id 보다 앞선 것 */
  history(before: number | null): Promise<HistoryRow[]>;
  /** 저장. 여러 건이면 전부 되거나 전부 안 된다. 실패하면 ConflictError / RetryableError / Error */
  apply(ops: Op[]): Promise<OpResult[]>;
  /** 로그인한 사람(me)의 이름 — 본인 줄만 바꿀 수 있다 */
  updateMyName(me: Person, name: string): Promise<void>;
  /** 다른 기기·탭에서 바뀌면 호출 */
  subscribe(onChange: (change: Change) => void): () => void;
}

/* ---------- Supabase ---------- */

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient | null {
  if (!URL || !KEY) return null;
  if (!client) {
    client = createClient(URL, KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "pkce" },
    });
  }
  return client;
}

export const hasSupabase = Boolean(URL && KEY);

/** 한 번에 받는 줄 수. Supabase API 의 최대 줄 수(기본 1000, Settings > API > Max rows)보다 크면 안 된다 */
const PAGE = 1000;

type PgError = { message: string; code?: string };
type PageResult = { data: unknown[] | null; error: PgError | null };

/** 서버 오류를 앱이 다룰 종류로 나눈다 */
export function toError(e: PgError, status?: number): Error {
  const code = e.code ?? "";
  if (code === "OM409" || (code === "40001" && /^conflict:/.test(e.message))) return new ConflictError(e.message);
  if (/^(40001|40P01|08...|53...|57P0.|PGRST00.|PGRST30[13])$/.test(code)) return new RetryableError(e.message);
  if (/^(22|23|42)/.test(code)) return new Error(e.message);
  if (status === 0 || status === 401 || status === 408 || status === 429 || (status ?? 0) >= 500) return new RetryableError(e.message);
  return new Error(e.message);
}

/** PostgREST or=(...) 안에 넣을 값 */
function quote(v: string) {
  return `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/**
 * 1000줄씩 이어 받는다. 마지막 줄 "다음부터" 다시 묻는 방식(keyset)이라 받는 도중 줄이 생기거나 지워져도
 * 빠지거나 겹치지 않고, 몇 번째 페이지든 인덱스에서 바로 시작한다 (OFFSET 은 앞의 줄을 다 읽고 버린다).
 */
async function pageAll<T>(page: (after: T | null) => PromiseLike<PageResult>): Promise<T[]> {
  const out: T[] = [];
  let after: T | null = null;
  for (;;) {
    const { data, error } = await page(after);
    if (error) throw toError(error);
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < PAGE) return out;
    after = rows[rows.length - 1];
  }
}

class SupabaseRepo implements Repo {
  mode = "supabase" as const;
  constructor(private db: SupabaseClient) {}

  /** 지출: (date, id) 순서로 [from, to) — spendings_date_id 인덱스를 그대로 탄다. installments 면 할부 기록만 */
  private spendings(from: string | null, to: string | null, asc: boolean, installments = false) {
    return pageAll<Spending>((after) => {
      let q = this.db.from("spendings").select("*");
      if (installments) q = q.gt("installment_months", 1);
      if (from) q = q.gte("date", from);
      if (to) q = q.lt("date", to);
      if (after) {
        const [cmp, edge] = asc ? (["gt", "gte"] as const) : (["lt", "lte"] as const);
        q = q[edge]("date", after.date).or(`date.${cmp}.${after.date},and(date.eq.${after.date},id.${cmp}.${quote(after.id)})`);
      }
      return q.order("date", { ascending: asc }).order("id", { ascending: asc }).limit(PAGE);
    });
  }

  private async list(table: (typeof LIST_TABLES)[number], opts?: LoadOpts): Promise<unknown[]> {
    if (table === "spendings") {
      const from = opts?.spendingsFrom ?? null;
      if (!from) return this.spendings(null, null, false);
      const [recent, older] = await Promise.all([this.spendings(from, null, false), this.olderInstallments(from)]);
      return [...recent, ...older];
    }
    try {
      return await pageAll<{ id: string }>((after) => {
        const q = this.db.from(table).select("*");
        return (after ? q.gt("id", after.id) : q).order("id").limit(PAGE);
      });
    } catch (e) {
      // 003 전이면 users, 011 전이면 events 가 없다 → 빈 목록 (이름은 settings 로, 달력은 일정 없이)
      if ((table === "users" || table === "events") && e instanceof Error && isMissingTable({ message: e.message })) return [];
      throw e;
    }
  }

  private async settings() {
    const { data, error } = await this.db.from("settings").select("*").eq("id", 1).maybeSingle();
    if (error) throw toError(error);
    return (data ?? defaultSettings()) as Data["settings"];
  }

  async load(opts?: LoadOpts): Promise<Data> {
    const [settings, ...lists] = await Promise.all([this.settings(), ...LIST_TABLES.map((t) => this.list(t, opts))]);
    const data = Object.fromEntries(LIST_TABLES.map((t, i) => [t, lists[i]])) as Omit<Data, "settings">;
    return { ...data, settings };
  }

  async loadTable<T extends TableName>(table: T, opts?: LoadOpts) {
    if (table === "settings") return (await this.settings()) as never;
    return (await this.list(table as (typeof LIST_TABLES)[number], opts)) as never;
  }

  /** from 전에 산 할부 중 아직 이어지는 것 (최대 60개월) — 불러온 기간의 예산·카드값에 회차가 들어간다 */
  private olderInstallments(from: string) {
    return this.spendings(`${Number(from.slice(0, 4)) - 5}${from.slice(4)}`, from, false, true);
  }

  async loadSpendings(from: string, to: string) {
    const [rows, older] = await Promise.all([this.spendings(from, to, false), this.olderInstallments(from)]);
    return [...rows, ...older];
  }

  exportSpendings() {
    return this.spendings(null, null, true);
  }

  async history(before: number | null) {
    // id 는 쌓인 순서라 keyset 으로 이어 받는다 (history_pkey)
    let q = this.db.from("history").select("*");
    if (before != null) q = q.lt("id", before);
    const { data, error } = await q.order("id", { ascending: false }).limit(HISTORY_PAGE);
    if (error) throw toError(error);
    return (data ?? []) as HistoryRow[];
  }

  async apply(ops: Op[]): Promise<OpResult[]> {
    // id 순서로 보낸다: 두 폰이 같은 줄들을 다른 순서로 저장해도 서로 잠금을 기다리다 교착(deadlock)하지 않게.
    // 한 op 안에 같은 id 가 두 번이면 마지막 줄만 보낸다 (서버는 같은 id 를 한 문장에 두 번 쓰지 못한다 — migrations/014)
    const sorted = ops.map((o) =>
      o.op === "upsert" ? { ...o, rows: [...new Map(o.rows.map((r) => [String(r.id), r])).values()].sort((a, b) => (String(a.id) < String(b.id) ? -1 : 1)) } : o,
    );
    if (sorted.length === 0) return [];
    if (sorted.length > 1) {
      const { data, error, status } = await this.db.rpc("apply_batch", { ops: sorted });
      if (!error) return data as OpResult[];
      // 005 마이그레이션 전: 하나씩 보낸다 (전부-아니면-전무는 아님)
      if (error.code !== "PGRST202" && error.code !== "42883") throw toError(error, status);
    }
    const out: OpResult[] = [];
    for (const o of sorted) out.push(await this.applyOne(o));
    return out;
  }

  private async applyOne(o: Op): Promise<OpResult> {
    if (o.op === "upsert") {
      if (o.rows.length === 0) return { table: o.table, rows: [] };
      const { data, error, status } = await this.db
        .from(o.table)
        .upsert(o.rows, { onConflict: "id", ignoreDuplicates: o.ignore_duplicates })
        .select();
      if (error) throw toError(error, status);
      return { table: o.table, rows: data ?? [] };
    }
    if (o.ids.length === 0) return { table: o.table, deleted: 0 };
    // 실제로 지운 줄을 돌려받는다: 권한이 없거나 로그인이 풀리면 오류 없이 0줄이 지워지기 때문
    const { data, error, status } = await this.db.from(o.table).delete().in("id", o.ids).select("id");
    if (error) throw toError(error, status);
    return { table: o.table, deleted: data?.length ?? 0 };
  }

  async updateMyName(me: Person, name: string) {
    const { data } = await this.db.auth.getSession();
    const uid = data.session?.user.id;
    if (!uid) throw new Error("로그인이 필요해요");
    const res = await this.db.from("users").update({ name }).eq("id", uid).select("id");
    if (res.error && isMissingTable(res.error)) {
      // 003 마이그레이션 전: 예전처럼 settings 의 이름을 바꾼다
      const { error } = await this.db.from("settings").update({ [me === "a" ? "name_a" : "name_b"]: name }).eq("id", 1);
      if (error) throw new Error(error.message);
      return;
    }
    if (res.error) throw toError(res.error, res.status);
    if (!res.data?.length) throw new Error("내 계정 정보를 찾지 못했어요. 다시 로그인해 주세요.");
  }

  subscribe(onChange: (change: Change) => void) {
    const channel = this.db.channel("household");
    for (const t of [...LIST_TABLES, "settings"] as TableName[]) {
      // 바뀐 줄을 그대로 받아서 붙인다 (테이블을 다시 읽지 않는다)
      channel.on("postgres_changes", { event: "*", schema: "public", table: t }, (p) => {
        if (p.eventType === "DELETE") {
          const id = (p.old as { id?: unknown }).id;
          onChange(id == null ? { type: "RELOAD", table: t } : { type: "DELETE", table: t, id: String(id) });
        } else onChange({ type: p.eventType, table: t, row: p.new as Record<string, unknown> });
      });
    }
    // 연결이 끊겼다 다시 붙으면 그사이 바뀐 것을 놓쳤을 수 있으니 전부 다시 읽는다
    let joined = false;
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        if (joined) onChange({ type: "RELOAD" });
        joined = true;
      }
    });
    return () => {
      void this.db.removeChannel(channel);
    };
  }
}

function isMissingTable(e: { code?: string; message: string }) {
  return e.code === "42P01" || e.code === "PGRST205" || /relation .* does not exist|Could not find the table/i.test(e.message);
}

export function defaultSettings(): Data["settings"] {
  return {
    id: 1,
    name_a: "",
    name_b: "",
    salary_a: 0,
    salary_b: 0,
    salary_account_a: null,
    salary_account_b: null,
    split_mode: "fixed",
    ratio_a: 50,
    cycle_start: 1,
    payday: 25,
    payday_a: 25,
    payday_b: 25,
  };
}

/* ---------- 데모 (localStorage) ---------- */

const STORE_KEY = "our-money-demo-v5";
const HISTORY_KEY = "our-money-demo-history";
export const HISTORY_PAGE = 50;

/** 예시 데이터의 바뀐 기록 — DB 트리거(log_change)처럼 수정은 바뀐 칸만, 최근 200건 */
function readDemoHistory(): HistoryRow[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]") as HistoryRow[];
  } catch {
    return [];
  }
}

function logDemo(table: string, id: string, op: HistoryRow["op"], old: object | null, row: object | null) {
  const o = old as Record<string, unknown> | null;
  const n = row as Record<string, unknown> | null;
  let before = o;
  let after = n;
  if (op === "update" && o && n) {
    const keys = Object.keys(n).filter((k) => !["rev", "updated_at", "updated_by"].includes(k) && JSON.stringify(o[k] ?? null) !== JSON.stringify(n[k] ?? null));
    if (keys.length === 0) return;
    before = Object.fromEntries(keys.map((k) => [k, o[k] ?? null]));
    after = Object.fromEntries(keys.map((k) => [k, n[k]]));
  }
  const all = readDemoHistory();
  const h: HistoryRow = { id: (all[0]?.id ?? 0) + 1, at: new Date().toISOString(), person: null, table_name: table, row_id: id, op, before, after };
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify([h, ...all].slice(0, 200)));
  } catch {
    /* 무시 */
  }
}

class LocalRepo implements Repo {
  mode = "demo" as const;
  private data: Data | null = null;

  private read(): Data {
    if (this.data) return this.data;
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        this.data = JSON.parse(raw) as Data;
        // users 가 생기기 전에 저장된 데모 데이터
        if (!this.data.users) this.data.users = demoUsers(this.data.settings);
        // 일정이 생기기 전에 저장된 데모 데이터
        if (!this.data.events) this.data.events = buildDemoData().events;
        return this.data;
      }
    } catch {
      /* 저장소를 쓸 수 없으면 메모리에서만 동작 */
    }
    this.data = buildDemoData();
    this.write();
    return this.data;
  }

  private write() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(this.data));
    } catch {
      /* 무시 */
    }
  }

  async load() {
    this.data = null;
    return structuredClone(this.read());
  }

  async loadTable<T extends TableName>(table: T) {
    this.data = null;
    const d = this.read();
    return structuredClone(table === "settings" ? d.settings : d[table as Exclude<TableName, "settings">]) as never;
  }

  async loadSpendings(from: string, to: string) {
    return structuredClone(this.read().spendings.filter((x) => x.date >= from && x.date < to));
  }

  async exportSpendings() {
    return structuredClone(this.read().spendings);
  }

  async history(before: number | null) {
    return readDemoHistory().filter((h) => before == null || h.id < before).slice(0, HISTORY_PAGE);
  }

  async apply(ops: Op[]): Promise<OpResult[]> {
    const d = this.read();
    const out: OpResult[] = [];
    for (const o of ops) {
      if (o.table === "settings") {
        if (o.op === "upsert") d.settings = { ...d.settings, ...(o.rows[0] as unknown as Data["settings"]) };
        out.push({ table: o.table, rows: o.op === "upsert" ? structuredClone(o.rows) : undefined, deleted: o.op === "delete" ? 0 : undefined });
        continue;
      }
      const key = o.table as Exclude<TableName, "settings">;
      const list = d[key] as unknown as { id: string }[];
      if (o.op === "delete") {
        for (const x of list.filter((x) => o.ids.includes(x.id))) logDemo(key, x.id, "delete", x, null);
        const keep = list.filter((x) => !o.ids.includes(x.id));
        out.push({ table: o.table, deleted: list.length - keep.length });
        (d[key] as unknown as { id: string }[]) = keep;
        continue;
      }
      for (const row of o.rows as unknown as { id: string }[]) {
        const i = list.findIndex((x) => x.id === row.id);
        if (i >= 0) {
          if (!o.ignore_duplicates) {
            logDemo(key, row.id, "update", list[i], row);
            list[i] = { ...list[i], ...row };
          }
        } else {
          logDemo(key, row.id, "insert", null, row);
          list.push(row);
        }
      }
      out.push({ table: o.table, rows: structuredClone(o.rows) });
    }
    this.write();
    return out;
  }

  async updateMyName(me: Person, name: string) {
    const d = this.read();
    d.users = d.users.some((u) => u.person === me)
      ? d.users.map((u) => (u.person === me ? { ...u, name } : u))
      : [...d.users, ...demoUsers(d.settings).filter((u) => u.person === me).map((u) => ({ ...u, name }))];
    this.write();
  }

  subscribe(onChange: (change: Change) => void) {
    const handler = (e: StorageEvent) => {
      if (e.key === STORE_KEY) {
        this.data = null;
        onChange({ type: "RELOAD" });
      }
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }

  reset() {
    this.data = buildDemoData();
    this.write();
  }
}

export function demoUsers(s: Data["settings"]): User[] {
  return (["a", "b"] as const).map((p) => ({ id: `demo-${p}`, email: "", person: p, name: p === "a" ? s.name_a : s.name_b }));
}

let repo: Repo | null = null;

export function getRepo(): Repo {
  if (!repo) {
    const db = supabase();
    repo = db ? new SupabaseRepo(db) : new LocalRepo();
  }
  return repo;
}

export function resetDemo() {
  const r = getRepo();
  if (r instanceof LocalRepo) r.reset();
}

/* ---------- 로그인 ---------- */

export async function currentMember(): Promise<{ email: string; member: Member | null } | null> {
  const db = supabase();
  if (!db) return null;
  const { data } = await db.auth.getSession();
  const email = data.session?.user.email;
  if (!email) return null;
  // 연결 문제로 확인하지 못한 것을 "멤버가 아님"으로 보지 않는다 (오류를 던져서 다시 시도하게)
  let { data: row, error } = await db.from("members").select("email, person").eq("email", email.toLowerCase()).maybeSingle();
  if (error) throw toError(error);
  // 002 마이그레이션 전(대문자로 저장된 이메일)에도 로그인되게
  if (!row) ({ data: row, error } = await db.from("members").select("email, person").ilike("email", email).maybeSingle());
  if (error) throw toError(error);
  if (!row) return { email, member: null };
  // 로그인한 계정을 멤버에 묶고 users 줄을 만들거나 맞춘다 (migrations/007).
  // 이메일이 같아도 이미 다른 계정이 묶여 있거나, 구글로 확인된 계정이 아니면 null → 멤버가 아니다.
  // (행을 돌려주는 함수의 null 은 PostgREST 가 모든 칸이 null 인 객체로 주므로 id 로 본다)
  // 003 전이라 함수가 없으면(오류) 예전처럼 members 줄만으로 판단한다.
  const { data: user, error: rpcError } = await db.rpc("ensure_user");
  if (rpcError && toError(rpcError) instanceof RetryableError) throw toError(rpcError);
  if (!rpcError && !(user as { id?: string } | null)?.id) return { email, member: null };
  return { email, member: row as Member };
}

export async function signInWithGoogle() {
  const db = supabase();
  if (!db) return;
  await db.auth.signInWithOAuth({
    provider: "google",
    // 안드로이드 앱 안이면 로그인 탭이 끝난 뒤 앱으로 돌아온다 (Supabase Redirect URLs 에 ourmoney://auth-callback 필요)
    options: { redirectTo: inApp() ? "ourmoney://auth-callback" : window.location.origin + "/" },
  });
}

export async function signOut() {
  // 이 기기에 남은 보내지 못한 저장도 지운다 (다음에 로그인하는 다른 계정으로 보내지 않게)
  try {
    localStorage.removeItem("our-money-outbox");
  } catch {}
  await supabase()?.auth.signOut();
  window.location.reload();
}
