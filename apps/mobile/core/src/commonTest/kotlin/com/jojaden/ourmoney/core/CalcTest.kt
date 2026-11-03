package com.jojaden.ourmoney.core

import com.jojaden.ourmoney.core.calc.*
import com.jojaden.ourmoney.core.model.*
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

// 웹(apps/web/src/lib/calc.ts)과 같은 결과가 나오는지 확인하는 테스트

class CalcTest {
    private val settings = Settings(
        nameA = "현빈", nameB = "예진", salaryA = 3_800_000, salaryB = 3_200_000,
        salaryAccountA = "acc-a", salaryAccountB = "acc-b", ratioA = 50, cycleStart = 25, payday = 25,
    )
    private val accounts = listOf(
        Account("acc-a", "현빈 급여통장", AccountKind.BANK, Owner.A),
        Account("acc-b", "예진 급여통장", AccountKind.BANK, Owner.B),
        Account("acc-joint", "공동 생활비통장", AccountKind.BANK, Owner.JOINT),
        Account("acc-fixed", "고정비 통장", AccountKind.BANK, Owner.JOINT),
        Account("card-joint", "공동 신용카드", AccountKind.CARD, Owner.JOINT, billingAccountId = "acc-joint", payDay = 14),
    )
    private fun item(id: String, group: Group, amount: Long, payer: Owner, method: Method, account: String? = null, card: String? = null, due: Int? = null, month: String = "2026-11") =
        MonthItem("$month:$id", month, id, group, id, amount, payer, account, method, card, due)

    private val nov = listOf(
        item("rent", Group.FIXED, 1_100_000, Owner.JOINT, Method.ACCOUNT_AUTO, "acc-fixed", due = 27),
        item("phone", Group.FIXED, 98_001, Owner.JOINT, Method.CARD_AUTO, card = "card-joint", due = 3),
        item("living", Group.LIVING, 1_400_000, Owner.JOINT, Method.MANUAL, "acc-joint"),
        item("ins-a", Group.FIXED, 42_000, Owner.A, Method.ACCOUNT_AUTO, "acc-a", due = 10),
    )
    private val month = Month("2026-11", incomeA = 3_800_000, incomeB = 3_200_000)

    @Test fun period_with_cycle_25() {
        val p = periodOf("2026-11", 25)
        assertEquals("2026-10-25", p.start)
        assertEquals("2026-11-25", p.end)
        assertEquals("2026-11-24", p.last)
        assertEquals("2026-11", monthOf("2026-10-25", 25))
        assertEquals("2026-10", monthOf("2026-10-24", 25))
        assertEquals("2026-11", currentMonth(25, "2026-11-03"))
        assertEquals("2026-12-01", periodOf("2026-12", 1).start)
        assertEquals("2027-01", addMonths("2026-12", 1))
    }

    @Test fun due_date_lands_inside_period() {
        assertEquals("2026-10-27", dateInMonth("2026-11", 27, 25))
        assertEquals("2026-11-14", dateInMonth("2026-11", 14, 25))
    }

    @Test fun split_rounds_half_up_and_b_takes_remainder() {
        assertEquals(49_001L to 49_000L, split(98_001, 0.5))
    }

    @Test fun transfers_group_by_from_and_to() {
        val plan = transfersOf(settings, month, nov, accounts)
        val byId = plan.transfers.associateBy { it.id }
        assertEquals(550_000, byId.getValue("acc-a>acc-fixed").amount)
        // 카드 자동결제는 카드의 결제계좌(공동 생활비통장)로 + 생활비
        assertEquals(49_001 + 700_000, byId.getValue("acc-a>acc-joint").amount)
        assertEquals(49_000 + 700_000, byId.getValue("acc-b>acc-joint").amount)
        // 본인 월급통장에서 나가는 보험은 옮길 필요 없음
        assertTrue(plan.transfers.none { t -> t.parts.any { it.item.name == "ins-a" } })
        assertEquals(3, byId.getValue("acc-a>acc-joint").dueDay)
        assertTrue(plan.issues.isEmpty())
    }

    @Test fun lanes_add_up() {
        val l = lanes(settings, month, nov).associateBy { it.person }
        val a = l.getValue(Person.A)
        assertEquals(550_000 + 49_001 + 700_000 + 42_000L, a.allocated)
        assertEquals(3_800_000 - a.allocated, a.left)
    }

    @Test fun living_status_and_settlement() {
        val data = AppData(
            settings = settings, accounts = accounts, months = listOf(month), monthItems = nov,
            spendings = listOf(
                Spending("s1", "2026-10-26", 100_000, null, PayKind.CARD, "card-joint", Owner.JOINT, Person.A, "이마트"),
                Spending("s2", "2026-10-28", 64_000, null, PayKind.CARD, null, Owner.JOINT, Person.B, "저녁"),
                Spending("s3", "2026-10-29", 15_500, null, PayKind.CARD, null, Owner.A, Person.A, "점심"),
            ),
        )
        val st = data.livingStatus("2026-11", "2026-11-03")
        assertEquals(1_400_000, st.budget)
        assertEquals(164_000, st.spent)
        assertEquals(1_236_000, st.left)
        val s = data.settlementOf("2026-11")!!
        assertEquals(Person.A, s.from)
        assertEquals(32_000, s.amount)
        assertEquals(15_500, data.allowanceStatus("2026-11", Person.A, "2026-11-03").spent)
    }

    @Test fun carry_over_keeps_last_month_amounts_and_adds_new_recurring() {
        val plan = listOf(
            PlanItem("rent", Group.FIXED, "rent", 1_100_000, Owner.JOINT, "acc-fixed", Method.ACCOUNT_AUTO),
            PlanItem("new", Group.SAVING, "new", 300_000, Owner.A, "acc-a", Method.MANUAL),
            PlanItem("gone", Group.FIXED, "gone", 1, Owner.A, "acc-a", Method.MANUAL, active = false),
        )
        val oct = listOf(
            item("rent", Group.FIXED, 1_150_000, Owner.JOINT, Method.ACCOUNT_AUTO, "acc-fixed", month = "2026-11").copy(paid = true),
            item("gone", Group.FIXED, 1, Owner.A, Method.MANUAL, month = "2026-11"),
            MonthItem("2026-11:one-x", "2026-11", null, Group.FIXED, "김장 재료", 120_000, Owner.JOINT, "acc-fixed", Method.MANUAL),
        )
        val data = AppData(settings = settings, planItems = plan, months = listOf(month), monthItems = oct)
        val dec = data.itemsFromMonth("2026-11", "2026-12")
        assertEquals(setOf("2026-12:rent", "2026-12:new"), dec.map { it.id }.toSet())
        assertEquals(1_150_000, dec.first { it.id == "2026-12:rent" }.amount)
        assertTrue(dec.none { it.paid })
        assertTrue(data.itemsFromMonth("2026-11", "2026-12", oneOffs = true).any { it.id == "2026-12:one-x" })
        assertEquals("2026-11", data.latestMonthBefore("2027-01"))
        assertNull(data.latestMonthBefore("2026-11"))
    }
}
