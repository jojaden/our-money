package com.jojaden.ourmoney.core.calc

import com.jojaden.ourmoney.core.model.Account
import com.jojaden.ourmoney.core.model.AccountKind
import com.jojaden.ourmoney.core.model.AppData
import com.jojaden.ourmoney.core.model.Check
import com.jojaden.ourmoney.core.model.CheckKind
import com.jojaden.ourmoney.core.model.GROUP_ORDER
import com.jojaden.ourmoney.core.model.Group
import com.jojaden.ourmoney.core.model.Method
import com.jojaden.ourmoney.core.model.Month
import com.jojaden.ourmoney.core.model.MonthItem
import com.jojaden.ourmoney.core.model.Owner
import com.jojaden.ourmoney.core.model.PayKind
import com.jojaden.ourmoney.core.model.Person
import com.jojaden.ourmoney.core.model.PlanItem
import com.jojaden.ourmoney.core.model.Settings
import com.jojaden.ourmoney.core.model.SplitMode
import com.jojaden.ourmoney.core.model.Spending

// 플랜과 기록에서 이체 목록, 카드값, 정산, 예산 사용을 계산한다.
// 화면에 보이는 모든 합계는 여기서 행(row)을 더해서 만든다. (웹 apps/web/src/lib/calc.ts 와 같은 규칙)

/* ---------- 사람과 비율 ---------- */

/**
 * 화면에 쓰는 두 사람 이름을 로그인한 계정(users)의 이름으로 맞춘다.
 * 아직 로그인하지 않았거나 이름이 비어 있는 사람은 settings 의 이름을 그대로 쓴다. (웹 withUserNames 와 같음)
 */
fun AppData.withUserNames(): AppData {
    fun nameFor(p: Person) = users.firstOrNull { it.person == p }?.name?.trim().orEmpty()
    val a = nameFor(Person.A).ifEmpty { settings.nameA }
    val b = nameFor(Person.B).ifEmpty { settings.nameB }
    if (a == settings.nameA && b == settings.nameB) return this
    return copy(settings = settings.copy(nameA = a, nameB = b))
}

fun Settings.nameOf(o: Owner): String = when (o) {
    Owner.A -> nameA.ifBlank { "A" }
    Owner.B -> nameB.ifBlank { "B" }
    Owner.JOINT -> "공동"
}

fun Settings.nameOf(p: Person): String = nameOf(p.owner)

fun ratioA(s: Settings, m: Month?): Double {
    if (s.splitMode == SplitMode.INCOME && m != null) {
        val total = m.incomeA + m.incomeB
        if (total > 0) return m.incomeA.toDouble() / total
    }
    return s.ratioA.coerceIn(0, 100) / 100.0
}

/** 공동 금액을 두 사람 몫으로 나눈다. 원 단위로 반올림하고 나머지는 B 몫. */
fun split(amount: Long, rA: Double): Pair<Long, Long> {
    val a = (amount * rA).roundHalfUp()
    return a to (amount - a)
}

fun shareOf(item: MonthItem, person: Person, rA: Double): Long = when (item.payer) {
    person.owner -> item.amount
    Owner.JOINT -> split(item.amount, rA).let { if (person == Person.A) it.first else it.second }
    else -> 0
}

fun Settings.salaryAccount(p: Person): String? = if (p == Person.A) salaryAccountA else salaryAccountB

/** 이 항목의 돈이 결제일에 있어야 하는 계좌 */
fun destinationOf(item: MonthItem, accounts: Map<String, Account>): String? {
    if (item.method == Method.CARD_AUTO && item.cardId != null) {
        return accounts[item.cardId]?.billingAccountId ?: item.accountId
    }
    return item.accountId
}

/* ---------- 월 데이터 ---------- */

fun AppData.itemsOf(month: String): List<MonthItem> =
    monthItems.filter { it.month == month }.sortedWith(compareBy({ GROUP_ORDER.indexOf(it.group) }, { it.sort }))

fun AppData.monthRow(month: String): Month? = months.find { it.id == month }

fun incomeOf(m: Month?): Long = if (m == null) 0 else m.incomeA + m.incomeB + m.extraIncome

fun groupTotals(items: List<MonthItem>): Map<Group, Long> =
    GROUP_ORDER.associateWith { g -> items.filter { it.group == g }.sumOf { it.amount } }

data class Lane(
    val person: Person,
    val income: Long,
    val byGroup: Map<Group, Long>,
    /** 공동 부담 몫 (그룹 무관) */
    val jointShare: Long,
    val allocated: Long,
    val left: Long,
)

/** 사람별로 월급이 어디에 쓰이는지 */
fun lanes(s: Settings, m: Month?, items: List<MonthItem>): List<Lane> {
    val rA = ratioA(s, m)
    return Person.entries.map { p ->
        val byGroup = GROUP_ORDER.associateWith { g -> items.filter { it.group == g }.sumOf { shareOf(it, p, rA) } }
        val jointShare = items.filter { it.payer == Owner.JOINT }.sumOf { shareOf(it, p, rA) }
        val allocated = byGroup.values.sum()
        val income = if (m == null) 0 else if (p == Person.A) m.incomeA else m.incomeB
        Lane(p, income, byGroup, jointShare, allocated, income - allocated)
    }
}

/* ---------- 이체 ---------- */

data class TransferPart(val item: MonthItem, val amount: Long)

data class Transfer(
    val id: String,
    val from: String,
    val to: String,
    val person: Person,
    val amount: Long,
    val parts: List<TransferPart>,
    /** 이 이체로 채워야 하는 가장 이른 결제일 (없으면 null) */
    val dueDay: Int?,
)

enum class IssueReason { NO_DESTINATION, NO_SALARY_ACCOUNT }

data class TransferIssue(val item: MonthItem, val reason: IssueReason)

data class TransferPlan(val transfers: List<Transfer>, val issues: List<TransferIssue>)

/**
 * 월급 통장에서 각 항목의 돈이 있어야 하는 계좌로 옮길 금액을 모은다.
 * 같은 (출발, 도착) 쌍은 한 줄로 합친다.
 */
fun transfersOf(s: Settings, m: Month?, items: List<MonthItem>, accounts: List<Account>): TransferPlan {
    val rA = ratioA(s, m)
    val acc = accounts.associateBy { it.id }
    val map = linkedMapOf<String, Transfer>()
    val issues = mutableListOf<TransferIssue>()

    for (item in items) {
        val to = destinationOf(item, acc)
        if (to == null) {
            issues += TransferIssue(item, IssueReason.NO_DESTINATION)
            continue
        }
        for (p in Person.entries) {
            val amount = shareOf(item, p, rA)
            if (amount <= 0) continue
            val from = s.salaryAccount(p)
            if (from == null) {
                issues += TransferIssue(item, IssueReason.NO_SALARY_ACCOUNT)
                continue
            }
            if (from == to) continue
            val id = "$from>$to"
            val t = map[id] ?: Transfer(id, from, to, p, 0, emptyList(), null)
            val due = item.dueDay
            map[id] = t.copy(
                amount = t.amount + amount,
                parts = t.parts + TransferPart(item, amount),
                dueDay = if (due != null && (t.dueDay == null || due < t.dueDay)) due else t.dueDay,
            )
        }
    }
    val transfers = map.values.sortedWith(compareBy<Transfer>({ if (it.person == Person.A) 0 else 1 }).thenByDescending { it.amount })
    return TransferPlan(transfers, issues)
}

fun checkId(kind: CheckKind, month: String, key: String = ""): String = when (kind) {
    CheckKind.TRANSFER -> "t:$month:$key"
    CheckKind.CARD -> "c:$month:$key"
    CheckKind.SETTLE -> "s:$month"
}

fun List<Check>.find(id: String): Check? = firstOrNull { it.id == id }

/* ---------- 지출 ---------- */

fun AppData.spendingsIn(month: String): List<Spending> {
    val p = periodOf(month, settings.cycleStart)
    return spendings.filter { it.date in p }
        .sortedWith(compareByDescending<Spending> { it.date }.thenByDescending { it.createdAt })
}

data class BudgetStatus(
    val budget: Long,
    val spent: Long,
    val left: Long,
    val byKind: Map<PayKind, Long>,
    /** 오늘까지 써도 되는 금액 (기간 경과 비율 × 예산) */
    val pace: Long?,
    val daysLeft: Int,
    val perDay: Long?,
)

/** 예산 대비 사용. owner 가 JOINT 면 공동 생활비, 사람이면 그 사람의 용돈. */
fun AppData.budgetStatus(month: String, owner: Owner, today: String = todayString()): BudgetStatus {
    val items = itemsOf(month).filter {
        if (owner == Owner.JOINT) it.group == Group.LIVING else it.group == Group.ALLOWANCE && it.payer == owner
    }
    val budget = items.sumOf { it.amount }
    val rows = spendingsIn(month).filter { it.owner == owner }
    val spent = rows.sumOf { it.amount }
    val byKind = PayKind.entries.associateWith { k -> rows.filter { it.payKind == k }.sumOf { it.amount } }
    val prog = periodProgress(month, settings.cycleStart, today)
    val left = budget - spent
    val current = prog.state == PeriodState.CURRENT
    return BudgetStatus(
        budget = budget,
        spent = spent,
        left = left,
        byKind = byKind,
        pace = if (current) (budget * prog.ratio).roundHalfUp() else null,
        daysLeft = prog.daysLeft,
        perDay = if (current && prog.daysLeft > 0 && left > 0) left / prog.daysLeft else null,
    )
}

fun AppData.livingStatus(month: String, today: String = todayString()) = budgetStatus(month, Owner.JOINT, today)

fun AppData.allowanceStatus(month: String, person: Person, today: String = todayString()) = budgetStatus(month, person.owner, today)

data class CategoryUse(val id: String?, val name: String, val budget: Long, val spent: Long)

fun AppData.categoryUse(month: String): List<CategoryUse> {
    val rows = spendingsIn(month).filter { it.owner == Owner.JOINT }
    val out = categories.sortedBy { it.sort }.map { c ->
        CategoryUse(c.id, c.name, c.budget, rows.filter { it.categoryId == c.id }.sumOf { it.amount })
    }.toMutableList()
    val ids = categories.map { it.id }.toSet()
    val none = rows.filter { it.categoryId == null || it.categoryId !in ids }.sumOf { it.amount }
    if (none > 0) out += CategoryUse(null, "미분류", 0, none)
    return out
}

/* ---------- 카드값 ---------- */

data class CardBill(
    val card: Account,
    /** 이번 달에 결제되는 금액 (지난 기간 사용분) */
    val dueAmount: Long,
    val dueDate: String?,
    /** 이번 기간에 쌓이는 중인 금액 (다음 달 청구) */
    val usingAmount: Long,
    val billing: Account?,
)

private fun AppData.cardUsage(cardId: String, month: String): Long {
    val p = periodOf(month, settings.cycleStart)
    val spent = spendings.filter { it.payKind == PayKind.CARD && it.accountId == cardId && it.date in p }.sumOf { it.amount }
    val fixed = monthItems.filter { it.month == month && it.method == Method.CARD_AUTO && it.cardId == cardId }.sumOf { it.amount }
    return spent + fixed
}

fun AppData.cardBills(month: String): List<CardBill> {
    val acc = accounts.associateBy { it.id }
    return accounts.filter { it.kind == AccountKind.CARD && !it.archived }.sortedBy { it.sort }.map { card ->
        CardBill(
            card = card,
            dueAmount = cardUsage(card.id, addMonths(month, -1)),
            dueDate = card.payDay?.let { dateInMonth(month, it, settings.cycleStart) },
            usingAmount = cardUsage(card.id, month),
            billing = card.billingAccountId?.let { acc[it] },
        )
    }
}

/* ---------- 정산 ---------- */

data class Settlement(
    /** 돈을 보내야 하는 사람 */
    val from: Person,
    val to: Person,
    val amount: Long,
    /** 각자 공동비용을 개인 돈으로 먼저 낸 금액 */
    val advanced: Map<Person, Long>,
)

/** 공동 지출을 개인 카드·계좌·현금으로 먼저 낸 만큼 서로 정산한다. */
fun AppData.settlementOf(month: String): Settlement? {
    val acc = accounts.associateBy { it.id }
    val rA = ratioA(settings, monthRow(month))
    val advanced = mutableMapOf(Person.A to 0L, Person.B to 0L)
    for (x in spendingsIn(month)) {
        if (x.owner != Owner.JOINT) continue
        val account = x.accountId?.let { acc[it] }
        if (account != null && account.owner == Owner.JOINT) continue
        advanced[x.paidBy] = advanced.getValue(x.paidBy) + x.amount
    }
    // A가 먼저 낸 공동비용 중 B 몫, B가 먼저 낸 것 중 A 몫
    val bOwesA = split(advanced.getValue(Person.A), rA).second
    val aOwesB = split(advanced.getValue(Person.B), rA).first
    val net = bOwesA - aOwesB
    if (net == 0L) return if (advanced.values.sum() > 0) Settlement(Person.A, Person.B, 0, advanced) else null
    return if (net > 0) Settlement(Person.B, Person.A, net, advanced) else Settlement(Person.A, Person.B, -net, advanced)
}

/* ---------- 납부 확인·저축 목표 ---------- */

/** 따로 납부 확인이 필요한 항목. 생활비·용돈은 예산, 직접 이체하는 저축은 '옮길 돈' 체크가 곧 납입이다. */
fun needsPayCheck(i: MonthItem): Boolean = i.group == Group.FIXED || (i.group == Group.SAVING && i.method != Method.MANUAL)

/** 항목이 그달에 실제로 나갔는가 */
fun AppData.itemDone(item: MonthItem): Boolean {
    if (needsPayCheck(item)) return item.paid
    if (item.group == Group.SAVING) {
        val plan = transfersOf(settings, monthRow(item.month), itemsOf(item.month), accounts)
        val related = plan.transfers.filter { t -> t.parts.any { it.item.id == item.id } }
        if (related.isEmpty()) return item.paid
        return related.all { checks.find(checkId(CheckKind.TRANSFER, item.month, it.id)) != null }
    }
    return false
}

data class GoalProgress(val saved: Long, val target: Long)

fun AppData.goalProgress(item: PlanItem): GoalProgress? {
    val goal = item.goalAmount ?: return null
    if (goal <= 0) return null
    val paid = monthItems.filter { it.planItemId == item.id && itemDone(it) }.sumOf { it.amount }
    return GoalProgress((item.goalStart ?: 0) + paid, goal)
}

/* ---------- 새 달·불러오기 ---------- */

/** 템플릿에서 그달의 항목을 만든다. id 가 결정적이라 두 폰이 동시에 만들어도 중복되지 않는다. */
fun snapshotItems(month: String, plan: List<PlanItem>): List<MonthItem> = plan.filter { it.active }.map { p ->
    MonthItem(
        id = "$month:${p.id}", month = month, planItemId = p.id, group = p.group, name = p.name, amount = p.amount,
        payer = p.payer, accountId = p.accountId, method = p.method, cardId = p.cardId, dueDay = p.dueDay,
        sort = p.sort, note = p.note,
    )
}

/** m 보다 앞선 달 중 플랜이 있는 가장 최근 달 */
fun AppData.latestMonthBefore(m: String): String? = months.map { it.id }.filter { it < m }.maxOrNull()

/**
 * from 달의 플랜을 to 달 항목으로 옮긴다.
 * 반복 항목은 그 달의 금액·계좌·방식 그대로, 반복을 끈 항목은 빼고, 새 반복 항목은 더한다. 일회성은 oneOffs 일 때만.
 */
fun AppData.itemsFromMonth(from: String, to: String, oneOffs: Boolean = false): List<MonthItem> {
    val active = planItems.filter { it.active }.map { it.id }.toSet()
    val out = mutableListOf<MonthItem>()
    for (i in itemsOf(from)) {
        val reset = i.copy(paid = false, paidAt = null, paidBy = null, month = to)
        if (i.planItemId != null) {
            if (i.planItemId !in active) continue
            out += reset.copy(id = "$to:${i.planItemId}")
        } else if (oneOffs) {
            val key = if (':' in i.id) i.id.substringAfter(':') else i.id
            out += reset.copy(id = "$to:$key")
        }
    }
    val have = out.mapNotNull { it.planItemId }.toSet()
    out += snapshotItems(to, planItems).filter { it.planItemId !in have }
    return out
}

/** 이미 있는 달에 from 달 항목 중 빠진 것만 */
fun AppData.missingFromMonth(from: String, to: String, oneOffs: Boolean = false): List<MonthItem> {
    val cur = itemsOf(to)
    val plans = cur.mapNotNull { it.planItemId }.toSet()
    val names = cur.map { "${it.group}|${it.name.trim()}" }.toSet()
    return itemsFromMonth(from, to, oneOffs).filter {
        if (it.planItemId != null) it.planItemId !in plans else "${it.group}|${it.name.trim()}" !in names
    }
}

/** 그 달 기간의 처음부터 dayIndex 일째까지 쓴 금액 — "지난달 이맘때" 비교용 */
fun AppData.spentToDay(month: String, owner: Owner, dayIndex: Int): Long {
    val p = periodOf(month, settings.cycleStart)
    val cut = shiftDays(p.start, dayIndex + 1)
    return spendings.filter { it.owner == owner && it.date >= p.start && it.date < cut && it.date < p.end }.sumOf { it.amount }
}
