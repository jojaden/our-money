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

    @Test fun user_names_override_settings() {
        val data = AppData(settings = settings, users = listOf(User("u-a", "a@example.com", Person.A, " 빈이 ")))
        val named = data.withUserNames()
        assertEquals("빈이", named.settings.nameOf(Person.A))
        assertEquals("예진", named.settings.nameOf(Person.B)) // 로그인 전이면 settings 이름
        val blank = AppData(settings = settings, users = listOf(User("u-b", "b@example.com", Person.B, "")))
        assertEquals("예진", blank.withUserNames().settings.nameB) // 빈 이름이면 settings 이름
        val plain = AppData(settings = settings)
        assertTrue(plain.withUserNames() === plain) // 바뀔 게 없으면 그대로
    }

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

    @Test fun weekend_payday_moves_to_friday() {
        assertEquals("2026-10-23", businessDayOnOrBefore("2026-10-25", false)) // 일
        assertEquals("2026-10-23", businessDayOnOrBefore("2026-10-24", false)) // 토
        assertEquals("2026-10-23", businessDayOnOrBefore("2026-10-23", false)) // 금 그대로
        assertEquals("2026-10-26", businessDayOnOrBefore("2026-10-26", false)) // 월 그대로
    }

    @Test fun holiday_payday_moves_to_business_day_before() {
        // 2026 추석 9/24~26(목~토) → 9/25 월급은 9/23(수)에. 공휴일을 보지 않는 사람은 그날(9/25, 금)
        assertEquals("2026-09-23", businessDayOnOrBefore("2026-09-25", true))
        assertEquals("2026-09-25", businessDayOnOrBefore("2026-09-25", false))
        // 대체공휴일 2026-10-05(월) → 앞 금요일 10/2. 개천절 10/3 은 토요일이라 주말로 이미 당겨진다
        assertEquals("2026-10-02", businessDayOnOrBefore("2026-10-05", true))
        assertEquals("2026-10-05", businessDayOnOrBefore("2026-10-05", false))
        // 표에 없는 해는 주말만
        assertEquals("2031-01-01", businessDayOnOrBefore("2031-01-01", true))
        assertTrue(isHoliday("2027-02-09")) // 설 대체공휴일
        val s = settings.copy(paydayA = 25, paydayB = 25, paydayHolidayB = false)
        // 2026-12-25(금) 성탄절: 현빈은 12/24(목), 예진은 공휴일에도 받아 12/25
        assertEquals("2026-12-24", s.paydayDate("2027-01", Person.A))
        assertEquals("2026-12-25", s.paydayDate("2027-01", Person.B))
    }

    @Test fun paydays_per_person() {
        val s = settings.copy(paydayA = 25, paydayB = 10)
        // 2026-10-25 는 일요일 → 월급은 앞 금요일(10-23)에 들어온다
        assertEquals("2026-10-23", s.paydayDate("2026-11", Person.A))
        assertEquals("2026-11-10", s.paydayDate("2026-11", Person.B))
        // 006 전(사람별 월급날 없음)에는 공통 월급날
        assertEquals(25, settings.paydayOf(Person.B))
        // 그달에 없는 날은 말일
        assertEquals("2026-11-30", dateInMonth("2026-11", 31, 1))
        assertEquals("2027-02-28", dateInMonth("2027-02", 31, 1))
        assertEquals("2026-10-31", dateInMonth("2026-11", 31, 25))
    }

    @Test fun shared_salary_account_splits_transfers_by_person() {
        val s = settings.copy(salaryAccountB = "acc-a")
        val ids = transfersOf(s, month, nov, accounts).transfers.map { it.id }.toSet()
        assertTrue("acc-a>acc-joint:a" in ids && "acc-a>acc-joint:b" in ids)
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
            // 11월 플랜을 만든 뒤에 새로 만든 반복 항목
            PlanItem("new", Group.SAVING, "new", 300_000, Owner.A, "acc-a", Method.MANUAL, createdAt = "2026-11-10T00:00:00Z"),
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
        assertTrue(dec.none { it.paidAmount != null })
        assertTrue(data.itemsFromMonth("2026-11", "2026-12", oneOffs = true).any { it.id == "2026-12:one-x" })
        assertEquals("2026-11", data.latestMonthBefore("2027-01"))
        assertNull(data.latestMonthBefore("2026-11"))
    }

    @Test fun paid_amount_feeds_card_bill_and_goal() {
        // 통신비(카드 자동결제)가 플랜 98,001원인데 실제로 103,500원 나갔다
        val items = nov.map { if (it.planItemId == "phone") it.copy(paid = true, paidAmount = 103_500) else it } +
            item("save", Group.SAVING, 300_000, Owner.A, Method.ACCOUNT_AUTO, "acc-a").copy(paid = true, paidAmount = 250_000)
        val plan = listOf(PlanItem("save", Group.SAVING, "save", 300_000, Owner.A, "acc-a", Method.ACCOUNT_AUTO, goalAmount = 1_000_000))
        val data = AppData(settings = settings, accounts = accounts, planItems = plan, months = listOf(month), monthItems = items)
        assertEquals(103_500, data.cardBills("2026-11").first().usingAmount)
        assertEquals(250_000, data.goalProgress(plan.first())!!.saved)
        // 완료가 아니면 적어 둔 금액은 보지 않는다
        assertEquals(98_001, items.first { it.planItemId == "phone" }.copy(paid = false).actualAmount)
    }

    @Test fun allowance_uses_personal_cycle() {
        // 공동 기준 25일(11월 = 10/25~11/24), 예진은 자기 월급날 10일부터. 오늘 11/12 → 예진의 지금 기간은 11/10~12/9
        val s = settings.copy(cycleStartB = 10)
        val items = nov + item("allow-b", Group.ALLOWANCE, 300_000, Owner.B, Method.MANUAL, "acc-b")
        val data = AppData(
            settings = s, accounts = accounts, months = listOf(month), monthItems = items,
            spendings = listOf(
                Spending("old", "2026-11-05", 50_000, null, PayKind.CARD, null, Owner.B, Person.B, "지난 기간"),
                Spending("new", "2026-11-11", 20_000, null, PayKind.CARD, null, Owner.B, Person.B, "이번 기간"),
            ),
        )
        assertEquals(10, s.cycleOf(Person.B))
        assertEquals(25, s.cycleOf(Person.A)) // 따로 정하지 않으면 공동 기준
        assertEquals("2026-12", s.personalMonth("2026-11", Person.B, "2026-11-12"))
        val st = data.allowanceStatus("2026-11", Person.B, "2026-11-12")
        assertEquals(300_000, st.budget) // 예산은 공동 11월 플랜에서
        assertEquals(20_000, st.spent) // 쓴 돈은 예진의 기간(11/10~)만
        assertEquals("2026-11-10", st.periodStart)
        assertEquals("2026-12-09", st.periodLast)
        assertTrue(st.own)
        // 지출 한 건이 어느 공동 달 용돈에서 빠지는지
        assertEquals("2026-11", s.sharedMonthOf("2026-11-11", Person.B, "2026-11-12"))
        assertEquals("2026-10", s.sharedMonthOf("2026-11-05", Person.B, "2026-11-12"))
        // 공동 생활비는 그대로 공동 기간
        assertTrue(!data.livingStatus("2026-11", "2026-11-12").own)
    }

    @Test fun split_joint_item_moves_each_share_from_own_source() {
        // 공동 생활비 70만을 나눠 낸다: 현빈 40만은 급여통장 → 공동통장, 예진 30만은 공동 카드로
        val pa = PlanItem("liv-a", Group.LIVING, "공동 생활비", 400_000, Owner.A, "acc-joint", Method.MANUAL, pairId = "pr-1")
        val pb = PlanItem("liv-b", Group.LIVING, "공동 생활비", 300_000, Owner.B, null, Method.CARD_AUTO, cardId = "card-joint", pairId = "pr-1")
        val items = snapshotItems("2026-11", listOf(pa, pb))
        assertEquals(listOf("pr-1", "pr-1"), items.map { it.pairId })
        val plan = transfersOf(settings, month, items, accounts)
        // 각자 자기 몫만, 분담 비율(50:50)과 상관없이
        assertEquals(400_000, plan.transfers.single { it.person == Person.A }.amount)
        assertEquals(300_000, plan.transfers.single { it.person == Person.B }.amount)
        val l = lanes(settings, month, items).associateBy { it.person }
        assertEquals(400_000, l.getValue(Person.A).jointShare)
        assertEquals(300_000, l.getValue(Person.B).jointShare)
        // 공동 생활비 예산은 두 몫의 합
        val data = AppData(settings = settings, accounts = accounts, planItems = listOf(pa, pb), months = listOf(month), monthItems = items)
        assertEquals(700_000, data.livingStatus("2026-11", "2026-11-03").budget)
    }

    @Test fun payee_is_copied_to_month_and_does_not_change_transfers() {
        // 받는 곳은 새 달 항목에 그대로 넘어가고, 옮길 돈은 나가는 곳(account_id) 기준 그대로
        val rent = PlanItem("rent", Group.FIXED, "월세", 1_000_000, Owner.JOINT, "acc-joint", Method.MANUAL, toName = "집주인 · 테스트은행 000-0000-0000")
        val save = PlanItem("save", Group.SAVING, "적금", 200_000, Owner.A, "acc-joint", Method.ACCOUNT_AUTO, toAccountId = "acc-save")
        val items = snapshotItems("2026-11", listOf(rent, save))
        assertEquals(listOf("집주인 · 테스트은행 000-0000-0000", ""), items.map { it.toName })
        assertEquals(listOf(null, "acc-save"), items.map { it.toAccountId })
        val key = { xs: List<MonthItem> -> transfersOf(settings, month, xs, accounts).transfers.map { Triple(it.from, it.to, it.amount) } }
        assertEquals(key(items.map { it.copy(toAccountId = null, toName = "") }), key(items))
    }

    @Test fun split_saving_goal_counts_both_shares() {
        val pa = PlanItem("sv-a", Group.SAVING, "여행 적금", 200_000, Owner.A, "acc-joint", Method.ACCOUNT_AUTO, pairId = "pr-2", goalAmount = 1_000_000, goalStart = 100_000)
        val pb = PlanItem("sv-b", Group.SAVING, "여행 적금", 100_000, Owner.B, "acc-joint", Method.ACCOUNT_AUTO, pairId = "pr-2", goalAmount = 1_000_000, goalStart = 100_000)
        val items = snapshotItems("2026-11", listOf(pa, pb)).map { it.copy(paid = true) }
        val data = AppData(settings = settings, accounts = accounts, planItems = listOf(pa, pb), months = listOf(month), monthItems = items)
        assertEquals(400_000, data.goalProgress(pa)!!.saved)
        assertEquals(400_000, data.goalProgress(pb)!!.saved)
    }

    @Test fun installments_split_monthly_with_remainder_first() {
        // 10/28(11월 기간)에 공동 카드로 100,000원 3개월 할부 → 33,334 / 33,333 / 33,333
        val tv = Spending("tv", "2026-10-28", 100_000, null, PayKind.CARD, "card-joint", Owner.JOINT, Person.A, "TV", installmentMonths = 3)
        val data = AppData(settings = settings, accounts = accounts, months = listOf(month), monthItems = nov, spendings = listOf(tv))
        assertEquals(listOf(33_334L, 33_333L, 33_333L, 0L), listOf("2026-11", "2026-12", "2027-01", "2027-02").map { m -> data.spendingsIn(m).sumOf { it.amount } })
        assertEquals("2026-11-28", data.spendingsIn("2026-12").single().date)
        assertEquals(33_334, data.livingStatus("2026-11", "2026-11-03").spent)
        // 카드값: 11월 사용분(통신비 + 1회차)이 12월에 청구된다
        assertEquals(98_001 + 33_334L, data.cardBills("2026-12").first().dueAmount)
        assertEquals(33_333, data.spentToDay("2026-12", Owner.JOINT, 10))
        // 카드가 아니면 할부 개월을 보지 않는다
        val cash = tv.copy(id = "cash", payKind = PayKind.CASH, accountId = null)
        assertEquals(100_000, data.copy(spendings = listOf(cash)).spendingsIn("2026-11").single().amount)
    }

    @Test fun plan_period_limits_months() {
        // 보험은 2027-03 ~ 2027-08 만, 대출은 2026-12 까지
        val plan = listOf(
            PlanItem("ins", Group.FIXED, "ins", 50_000, Owner.A, "acc-a", Method.ACCOUNT_AUTO, startMonth = "2027-03", endMonth = "2027-08"),
            PlanItem("loan", Group.FIXED, "loan", 200_000, Owner.JOINT, "acc-fixed", Method.ACCOUNT_AUTO, endMonth = "2026-12"),
        )
        assertEquals(listOf("2026-12:loan"), snapshotItems("2026-12", plan).map { it.id })
        assertEquals(emptyList<String>(), snapshotItems("2027-01", plan).map { it.id })
        assertEquals(listOf("2027-03:ins"), snapshotItems("2027-03", plan).map { it.id })
        // 지난달에서 이어받을 때도: 끝난 대출은 빠지고, 시작된 보험은 더해진다
        val feb = snapshotItems("2027-02", plan)
        val data = AppData(settings = settings, planItems = plan, months = listOf(Month("2027-02")), monthItems = feb)
        assertEquals(listOf("2027-03:ins"), data.itemsFromMonth("2027-02", "2027-03").map { it.id })
        val dec = AppData(settings = settings, planItems = plan, months = listOf(Month("2026-12")), monthItems = snapshotItems("2026-12", plan))
        assertTrue(dec.itemsFromMonth("2026-12", "2027-01").isEmpty())
    }

    @Test fun carry_over_skips_recurring_left_out_of_from_month() {
        // 12월을 빈 플랜에서 인터넷 하나로 시작했다 → 1월에 12월을 가져와도 월세는 다시 끌어오지 않는다.
        // 12월을 만든 뒤에 새로 만든 반복 항목(적금)은 더한다
        val plan = listOf(
            PlanItem("rent", Group.FIXED, "rent", 1_100_000, Owner.JOINT, "acc-fixed", Method.ACCOUNT_AUTO, createdAt = "2026-10-01T00:00:00Z"),
            PlanItem("net", Group.FIXED, "net", 33_000, Owner.JOINT, "acc-fixed", Method.ACCOUNT_AUTO, createdAt = "2026-11-20T00:00:00Z"),
            PlanItem("save", Group.SAVING, "save", 300_000, Owner.A, "acc-a", Method.MANUAL, createdAt = "2026-12-05T00:00:00Z"),
        )
        val dec = Month("2026-12", createdAt = "2026-11-20T00:00:00Z")
        val data = AppData(settings = settings, planItems = plan, months = listOf(dec), monthItems = listOf(item("net", Group.FIXED, 33_000, Owner.JOINT, Method.ACCOUNT_AUTO, "acc-fixed", month = "2026-12")))
        assertEquals(setOf("2027-01:net", "2027-01:save"), data.itemsFromMonth("2026-12", "2027-01").map { it.id }.toSet())
    }
}
