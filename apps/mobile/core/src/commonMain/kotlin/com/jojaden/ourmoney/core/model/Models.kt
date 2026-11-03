package com.jojaden.ourmoney.core.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

// 데이터 모델 — supabase/schema.sql 과 1:1 (웹 apps/web/src/lib/types.ts 와 같은 구조)
// Supabase 로 보낼 때 Json 은 explicitNulls = false 로 둔다: upsert 에 rev: null 을 보내면 서버가 충돌로 거절한다 (migrations/004).

@Serializable
enum class Person {
    @SerialName("a") A,
    @SerialName("b") B;

    val other: Person get() = if (this == A) B else A
    val owner: Owner get() = if (this == A) Owner.A else Owner.B
}

/** 비용귀속·소유: 두 사람 또는 공동 */
@Serializable
enum class Owner {
    @SerialName("a") A,
    @SerialName("b") B,
    @SerialName("joint") JOINT;

    val person: Person? get() = when (this) { A -> Person.A; B -> Person.B; JOINT -> null }
}

@Serializable
enum class Group(val label: String, val shortLabel: String) {
    @SerialName("fixed") FIXED("고정비", "고정비"),
    @SerialName("living") LIVING("공동 생활비", "생활비"),
    @SerialName("allowance") ALLOWANCE("용돈", "용돈"),
    @SerialName("saving") SAVING("저축·투자", "저축·투자"),
}

/** 돈이 실제로 나가는 방식 */
@Serializable
enum class Method(val label: String) {
    @SerialName("card_auto") CARD_AUTO("카드 자동결제"),
    @SerialName("account_auto") ACCOUNT_AUTO("자동이체"),
    @SerialName("manual") MANUAL("직접 이체"),
    @SerialName("cash") CASH("현금"),
}

/** 지출 한 건의 결제수단 */
@Serializable
enum class PayKind(val label: String) {
    @SerialName("card") CARD("카드"),
    @SerialName("cash") CASH("현금"),
    @SerialName("transfer") TRANSFER("계좌이체"),
}

@Serializable
enum class AccountKind {
    @SerialName("bank") BANK,
    @SerialName("card") CARD,
}

@Serializable
enum class SplitMode {
    @SerialName("fixed") FIXED,
    @SerialName("income") INCOME,
}

@Serializable
data class Settings(
    val id: Int = 1,
    @SerialName("name_a") val nameA: String = "",
    @SerialName("name_b") val nameB: String = "",
    @SerialName("salary_a") val salaryA: Long = 0,
    @SerialName("salary_b") val salaryB: Long = 0,
    @SerialName("salary_account_a") val salaryAccountA: String? = null,
    @SerialName("salary_account_b") val salaryAccountB: String? = null,
    @SerialName("split_mode") val splitMode: SplitMode = SplitMode.FIXED,
    /** A가 공동비용을 부담하는 비율 (0~100) */
    @SerialName("ratio_a") val ratioA: Int = 50,
    /** 가계부 한 달의 시작일 (1~28). 25면 11월 = 10/25 ~ 11/24 */
    @SerialName("cycle_start") val cycleStart: Int = 1,
    /** 예전 공통 월급날 (v0.1). 사람별 월급날이 없을 때(migrations/006 전)만 쓴다 — paydayOf() 로 읽는다 */
    val payday: Int = 25,
    /** 사람별 월급날 (1~31, 그달에 없는 날이면 말일) */
    @SerialName("payday_a") val paydayA: Int? = null,
    @SerialName("payday_b") val paydayB: Int? = null,
    @SerialName("created_at") val createdAt: String? = null,
    /** 서버가 채우는 칸 (migrations/004). rev 는 읽은 그대로 돌려보낸다 — 다른 기기가 그사이 고쳤으면 저장 거절 */
    val rev: Int? = null,
    @SerialName("created_by") val createdBy: Person? = null,
    @SerialName("updated_at") val updatedAt: String? = null,
    @SerialName("updated_by") val updatedBy: Person? = null,
)

@Serializable
data class Account(
    val id: String,
    val name: String,
    val kind: AccountKind,
    val owner: Owner,
    val institution: String = "",
    /** 카드: 결제 대금이 빠져나가는 계좌 */
    @SerialName("billing_account_id") val billingAccountId: String? = null,
    /** 카드: 결제일 */
    @SerialName("pay_day") val payDay: Int? = null,
    val sort: Int = 0,
    val archived: Boolean = false,
    /** 카드 번호 끝 4자리 — 카드 알림 자동 기록에서 카드를 찾을 때 */
    val last4: String? = null,
    val note: String = "",
    @SerialName("created_at") val createdAt: String? = null,
    /** 서버가 채우는 칸 (migrations/004). rev 는 읽은 그대로 돌려보낸다 — 다른 기기가 그사이 고쳤으면 저장 거절 */
    val rev: Int? = null,
    @SerialName("created_by") val createdBy: Person? = null,
    @SerialName("updated_at") val updatedAt: String? = null,
    @SerialName("updated_by") val updatedBy: Person? = null,
)

/** 매달 반복되는 플랜 항목 (템플릿) */
@Serializable
data class PlanItem(
    val id: String,
    val group: Group,
    val name: String,
    val amount: Long,
    val payer: Owner,
    @SerialName("account_id") val accountId: String? = null,
    val method: Method,
    @SerialName("card_id") val cardId: String? = null,
    @SerialName("due_day") val dueDay: Int? = null,
    val sort: Int = 0,
    val note: String = "",
    val active: Boolean = true,
    @SerialName("goal_amount") val goalAmount: Long? = null,
    @SerialName("goal_start") val goalStart: Long? = null,
    /** 이 달(YYYY-MM)부터 / 이 달까지만 — 대출·할부처럼 끝이 있는 항목 */
    @SerialName("start_month") val startMonth: String? = null,
    @SerialName("end_month") val endMonth: String? = null,
    @SerialName("created_at") val createdAt: String? = null,
    /** 서버가 채우는 칸 (migrations/004). rev 는 읽은 그대로 돌려보낸다 — 다른 기기가 그사이 고쳤으면 저장 거절 */
    val rev: Int? = null,
    @SerialName("created_by") val createdBy: Person? = null,
    @SerialName("updated_at") val updatedAt: String? = null,
    @SerialName("updated_by") val updatedBy: Person? = null,
)

@Serializable
data class Month(
    /** YYYY-MM */
    val id: String,
    @SerialName("income_a") val incomeA: Long = 0,
    @SerialName("income_b") val incomeB: Long = 0,
    @SerialName("extra_income") val extraIncome: Long = 0,
    @SerialName("extra_note") val extraNote: String = "",
    val note: String = "",
    /** 그달을 마감한 시각 */
    @SerialName("closed_at") val closedAt: String? = null,
    @SerialName("created_at") val createdAt: String? = null,
    /** 서버가 채우는 칸 (migrations/004). rev 는 읽은 그대로 돌려보낸다 — 다른 기기가 그사이 고쳤으면 저장 거절 */
    val rev: Int? = null,
    @SerialName("created_by") val createdBy: Person? = null,
    @SerialName("updated_at") val updatedAt: String? = null,
    @SerialName("updated_by") val updatedBy: Person? = null,
)

/** 그달에 고정된 플랜 항목 */
@Serializable
data class MonthItem(
    /** `${month}:${plan_item_id}` */
    val id: String,
    val month: String,
    @SerialName("plan_item_id") val planItemId: String? = null,
    val group: Group,
    val name: String,
    val amount: Long,
    val payer: Owner,
    @SerialName("account_id") val accountId: String? = null,
    val method: Method,
    @SerialName("card_id") val cardId: String? = null,
    @SerialName("due_day") val dueDay: Int? = null,
    val sort: Int = 0,
    val note: String = "",
    val paid: Boolean = false,
    @SerialName("paid_at") val paidAt: String? = null,
    @SerialName("paid_by") val paidBy: Person? = null,
    /** 실제로 나간 금액 (플랜 금액과 다를 때) */
    @SerialName("paid_amount") val paidAmount: Long? = null,
    @SerialName("created_at") val createdAt: String? = null,
    /** 서버가 채우는 칸 (migrations/004). rev 는 읽은 그대로 돌려보낸다 — 다른 기기가 그사이 고쳤으면 저장 거절 */
    val rev: Int? = null,
    @SerialName("created_by") val createdBy: Person? = null,
    @SerialName("updated_at") val updatedAt: String? = null,
    @SerialName("updated_by") val updatedBy: Person? = null,
)

@Serializable
enum class CheckKind {
    @SerialName("transfer") TRANSFER,
    @SerialName("card") CARD,
    @SerialName("settle") SETTLE,
}

@Serializable
data class Check(
    /** transfer: `t:${month}:${from}>${to}`  card: `c:${month}:${cardId}`  settle: `s:${month}` */
    val id: String,
    val month: String,
    val kind: CheckKind,
    val amount: Long = 0,
    @SerialName("done_at") val doneAt: String = "",
    @SerialName("done_by") val doneBy: Person,
)

@Serializable
data class Category(
    val id: String,
    val name: String,
    /** 월 예산 (0이면 미설정) */
    val budget: Long = 0,
    val sort: Int = 0,
    @SerialName("created_at") val createdAt: String? = null,
    /** 서버가 채우는 칸 (migrations/004). rev 는 읽은 그대로 돌려보낸다 — 다른 기기가 그사이 고쳤으면 저장 거절 */
    val rev: Int? = null,
    @SerialName("created_by") val createdBy: Person? = null,
    @SerialName("updated_at") val updatedAt: String? = null,
    @SerialName("updated_by") val updatedBy: Person? = null,
)

@Serializable
data class Spending(
    val id: String,
    /** YYYY-MM-DD */
    val date: String,
    val amount: Long,
    @SerialName("category_id") val categoryId: String? = null,
    @SerialName("pay_kind") val payKind: PayKind,
    /** 카드 또는 계좌 */
    @SerialName("account_id") val accountId: String? = null,
    /** 비용귀속 */
    val owner: Owner,
    /** 실제로 결제한 사람 */
    @SerialName("paid_by") val paidBy: Person,
    val memo: String = "",
    @SerialName("created_at") val createdAt: String? = null,
    /** 어떻게 기록됐나 */
    val source: SpendingSource = SpendingSource.MANUAL,
    val tags: List<String> = emptyList(),
    /** 할부 개월 (1 = 일시불) */
    @SerialName("installment_months") val installmentMonths: Int = 1,
    /** 카드 승인번호 — 같은 승인 건이 두 번 기록되지 않게 */
    @SerialName("approval_no") val approvalNo: String? = null,
    /** 서버가 채우는 칸 (migrations/004). rev 는 읽은 그대로 돌려보낸다 — 다른 기기가 그사이 고쳤으면 저장 거절 */
    val rev: Int? = null,
    @SerialName("created_by") val createdBy: Person? = null,
    @SerialName("updated_at") val updatedAt: String? = null,
    @SerialName("updated_by") val updatedBy: Person? = null,
)

@Serializable
enum class SpendingSource {
    @SerialName("manual") MANUAL,
    @SerialName("preset") PRESET,
    @SerialName("notification") NOTIFICATION,
    @SerialName("import") IMPORT,
}

@Serializable
data class Member(val email: String, val person: Person)

/** 로그인한 계정 (supabase/migrations/003_users.sql). 이름은 그 계정 본인만 바꾼다. */
@Serializable
data class User(
    /** auth.users.id */
    val id: String,
    val email: String,
    val person: Person,
    val name: String = "",
)

/** 앱이 한 번에 들고 있는 전체 데이터 */
data class AppData(
    val settings: Settings = Settings(),
    val accounts: List<Account> = emptyList(),
    val planItems: List<PlanItem> = emptyList(),
    val months: List<Month> = emptyList(),
    val monthItems: List<MonthItem> = emptyList(),
    val checks: List<Check> = emptyList(),
    val categories: List<Category> = emptyList(),
    val spendings: List<Spending> = emptyList(),
    val users: List<User> = emptyList(),
)

val GROUP_ORDER = listOf(Group.FIXED, Group.LIVING, Group.ALLOWANCE, Group.SAVING)
