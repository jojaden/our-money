package com.jojaden.ourmoney.core.notice

import kotlinx.datetime.LocalDate
import kotlinx.datetime.daysUntil
import kotlin.math.abs

// 결제 알림 ↔ 이번 달 할 일 맞추기. 웹이 앱을 열어 둘 때 넘겨 둔 "남은 할 일"과 알림에서 읽은 돈을 맞춰 본다.
// 금액이 같고 날짜가 가까워야 후보이고, 카드 끝자리나 이름까지 맞아 하나로 좁혀지면 확실(자동 체크), 아니면 물어본다.

/** 웹이 넘긴 이번 달 남은 할 일 하나 (웹 tasks 의 Task) */
data class Expect(
    /** 할 일 키 — 웹이 이 키로 체크한다 */
    val key: String,
    /** "pay"(고정비·저축 납부) · "card"(카드값) · "transfer"(옮길 돈) · "settle"(정산) · "event"(낼 돈이 있는 할 일) */
    val kind: String,
    /** 폰 알림에 쓰는 이름 (예: 관리비) */
    val title: String,
    val amount: Long,
    /** 기한 YYYY-MM-DD — 없으면 그달 아무 때나 */
    val due: String?,
    /** 납부 방법: card_auto · account_auto · manual · cash (pay 만) */
    val method: String?,
    /** 카드 자동결제면 그 카드 번호 끝 4자리 */
    val last4: String?,
)

enum class Sureness { SURE, MAYBE }

data class Match(val expect: Expect, val sureness: Sureness)

/** 기한 며칠 전부터 며칠 뒤까지를 그 할 일로 보나 (미리 옮기기, 주말·휴일이면 자동이체가 다음 영업일로 밀림) */
private const val EARLY = 7
private const val LATE = 4

/** [p]가 [on](YYYY-MM-DD)에 온 결제 알림일 때 맞는 할 일. 나간 돈이 아니거나 맞는 것이 없으면 null */
fun matchPayment(p: Payment, on: String, expects: List<Expect>): Match? {
    if (p.kind == PaymentKind.CANCEL || p.kind == PaymentKind.DEPOSIT) return null
    val day = LocalDate.parse(on)
    val gap = { e: Expect -> e.due?.let { abs(LocalDate.parse(it).daysUntil(day)) } ?: Int.MAX_VALUE }
    val hits = expects.filter { e ->
        e.amount == p.amount && fits(p, e) && (e.due == null || LocalDate.parse(e.due).daysUntil(day) in -EARLY..LATE)
    }
    if (hits.isEmpty()) return null
    val sure = hits.filter { e -> sameCard(p, e) || sameName(p.counterpart, e.title) }
    val best = sure.ifEmpty { hits }.minBy(gap)
    // 하나로 좁혀지고 나간 돈이 분명할 때만 확실 (들어왔는지 나갔는지 모르는 계좌 알림은 늘 물어본다)
    val certain = sure.size == 1 && p.kind != PaymentKind.MOVE
    return Match(best, if (certain) Sureness.SURE else Sureness.MAYBE)
}

/** 카드 사용은 카드 자동결제 납부와, 계좌에서 나간 돈은 이체·자동이체·카드값·정산과. 낼 돈이 있는 할 일은 둘 다 */
private fun fits(p: Payment, e: Expect): Boolean = when {
    e.kind == "event" -> true
    p.isCard -> e.kind == "pay" && e.method == "card_auto"
    else -> (e.kind == "pay" && (e.method == "account_auto" || e.method == "manual")) || e.kind == "card" || e.kind == "transfer" || e.kind == "settle"
}

private fun sameCard(p: Payment, e: Expect): Boolean {
    val a = p.last4 ?: return false
    val b = e.last4 ?: return false
    return p.isCard && (a.endsWith(b) || b.endsWith(a))
}

private fun norm(s: String): String = s.replace(Regex("""\(주\)|㈜|주식회사"""), "").replace(Regex("""[^\p{L}\p{N}]"""), "").lowercase()

/** 가맹점(받는 쪽)과 할 일 이름이 같은 말을 품고 있나 — "한국도시가스(주)" ↔ "도시가스", "현빈" ↔ "현빈 ISA로 옮길 돈" */
fun sameName(counterpart: String?, title: String): Boolean {
    val c = norm(counterpart ?: return false)
    if (c.length < 2) return false
    return title.split(Regex("""\s+""")).map(::norm).filter { it.length >= 2 }.any { it in c || c in it }
}
