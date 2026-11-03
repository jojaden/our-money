// 저장소: Supabase 가 설정되어 있으면 Supabase, 아니면 브라우저 저장소의 데모 데이터.
// 두 구현 모두 같은 테이블 단위 연산만 제공한다.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Data, Member, Person, Row, Spending, TableName, User } from "./types";
import { buildDemoData } from "./demo-data";

export const LIST_TABLES = [
  "accounts",
  "plan_items",
  "months",
  "month_items",
  "checks",
  "categories",
  "spendings",
  "users",
] as const satisfies readonly TableName[];

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
  /** 내보내기용 전체 지출 */
  exportSpendings(): Promise<Spending[]>;
  upsert<T extends TableName>(table: T, rows: Row<T>[], opts?: { ignoreDuplicates?: boolean }): Promise<void>;
  remove(table: TableName, ids: string[]): Promise<void>;
  /** 로그인한 사람(me)의 이름 — 본인 줄만 바꿀 수 있다 */
  updateMyName(me: Person, name: string): Promise<void>;
  /** 다른 기기·탭에서 바뀌면 호출 */
  subscribe(onChange: (table: TableName) => void): () => void;
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

class SupabaseRepo implements Repo {
  mode = "supabase" as const;
  constructor(private db: SupabaseClient) {}

  private query(table: (typeof LIST_TABLES)[number], opts?: LoadOpts) {
    const q = this.db.from(table).select("*");
    // 003 마이그레이션 전이면 users 가 없다 → 빈 목록 (이름은 settings 로)
    if (table === "users") return q.then((r) => (r.error && isMissingTable(r.error) ? { ...r, error: null, data: [] } : r));
    // spendings (date desc, created_at desc) 인덱스를 타는 기간 조건
    if (table === "spendings" && opts?.spendingsFrom) return q.gte("date", opts.spendingsFrom).order("date", { ascending: false });
    return q;
  }

  async load(opts?: LoadOpts): Promise<Data> {
    const [settings, ...lists] = await Promise.all([
      this.db.from("settings").select("*").eq("id", 1).maybeSingle(),
      ...LIST_TABLES.map((t) => this.query(t, opts)),
    ]);
    const err = settings.error ?? lists.find((r) => r.error)?.error;
    if (err) throw new Error(err.message);
    const data = Object.fromEntries(LIST_TABLES.map((t, i) => [t, lists[i].data ?? []])) as Omit<Data, "settings">;
    return { ...data, settings: settings.data ?? defaultSettings() };
  }

  async loadTable<T extends TableName>(table: T, opts?: LoadOpts) {
    if (table === "settings") {
      const { data, error } = await this.db.from("settings").select("*").eq("id", 1).maybeSingle();
      if (error) throw new Error(error.message);
      return (data ?? defaultSettings()) as never;
    }
    const { data, error } = await this.query(table as (typeof LIST_TABLES)[number], opts);
    if (error) throw new Error(error.message);
    return (data ?? []) as never;
  }

  async loadSpendings(from: string, to: string) {
    const { data, error } = await this.db.from("spendings").select("*").gte("date", from).lt("date", to).order("date", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as Spending[];
  }

  async exportSpendings() {
    const out: Spending[] = [];
    // PostgREST 기본 최대 1000행 → 1000행씩 끊어서 받는다
    for (let from = 0; ; from += 1000) {
      const { data, error } = await this.db.from("spendings").select("*").order("date").order("created_at").range(from, from + 999);
      if (error) throw new Error(error.message);
      out.push(...((data ?? []) as Spending[]));
      if (!data || data.length < 1000) break;
    }
    return out;
  }

  async upsert<T extends TableName>(table: T, rows: Row<T>[], opts?: { ignoreDuplicates?: boolean }) {
    if (rows.length === 0) return;
    const { error } = await this.db.from(table).upsert(rows as object[], { onConflict: "id", ignoreDuplicates: opts?.ignoreDuplicates });
    if (error) throw new Error(error.message);
  }

  async remove(table: TableName, ids: string[]) {
    if (ids.length === 0) return;
    const { error } = await this.db.from(table).delete().in("id", ids);
    if (error) throw new Error(error.message);
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
    if (res.error) throw new Error(res.error.message);
    if (!res.data?.length) throw new Error("내 계정 정보를 찾지 못했어요. 다시 로그인해 주세요.");
  }

  subscribe(onChange: (table: TableName) => void) {
    const channel = this.db.channel("household");
    for (const t of [...LIST_TABLES, "settings"] as TableName[]) {
      channel.on("postgres_changes", { event: "*", schema: "public", table: t }, () => onChange(t));
    }
    channel.subscribe();
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
  };
}

/* ---------- 데모 (localStorage) ---------- */

const STORE_KEY = "our-money-demo-v4";

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

  async upsert<T extends TableName>(table: T, rows: Row<T>[], opts?: { ignoreDuplicates?: boolean }) {
    const d = this.read();
    if (table === "settings") {
      d.settings = { ...d.settings, ...(rows[0] as Data["settings"]) };
    } else {
      const list = d[table as Exclude<TableName, "settings">] as unknown as { id: string }[];
      for (const row of rows as unknown as { id: string }[]) {
        const i = list.findIndex((x) => x.id === row.id);
        if (i >= 0) {
          if (!opts?.ignoreDuplicates) list[i] = { ...list[i], ...row };
        } else list.push(row);
      }
    }
    this.write();
  }

  async remove(table: TableName, ids: string[]) {
    const d = this.read();
    if (table === "settings") return;
    const key = table as Exclude<TableName, "settings">;
    (d[key] as unknown as { id: string }[]) = (d[key] as unknown as { id: string }[]).filter((x) => !ids.includes(x.id));
    this.write();
  }

  async updateMyName(me: Person, name: string) {
    const d = this.read();
    d.users = d.users.some((u) => u.person === me)
      ? d.users.map((u) => (u.person === me ? { ...u, name } : u))
      : [...d.users, ...demoUsers(d.settings).filter((u) => u.person === me).map((u) => ({ ...u, name }))];
    this.write();
  }

  subscribe(onChange: (table: TableName) => void) {
    const handler = (e: StorageEvent) => {
      if (e.key === STORE_KEY) {
        this.data = null;
        onChange("spendings");
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
  let { data: row } = await db.from("members").select("email, person").eq("email", email.toLowerCase()).maybeSingle();
  // 002 마이그레이션 전(대문자로 저장된 이메일)에도 로그인되게
  if (!row) ({ data: row } = await db.from("members").select("email, person").ilike("email", email).maybeSingle());
  // 로그인한 계정의 users 줄을 만들거나 맞춘다 (003 마이그레이션 전이면 조용히 넘어간다)
  if (row) await db.rpc("ensure_user");
  return { email, member: (row as Member | null) ?? null };
}

export async function signInWithGoogle() {
  const db = supabase();
  if (!db) return;
  await db.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: window.location.origin + "/" },
  });
}

export async function signOut() {
  await supabase()?.auth.signOut();
  window.location.reload();
}
