package com.jojaden.ourmoney.core

import com.jojaden.ourmoney.core.calc.checkId
import com.jojaden.ourmoney.core.model.*
import kotlinx.serialization.json.Json
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

// Supabase 가 돌려주는 줄(supabase/schema.sql)을 모델로 읽을 수 있는지
class ModelsTest {
    private val json = Json { ignoreUnknownKeys = true }

    @Test fun spending_row_with_004_columns() {
        val s = json.decodeFromString<Spending>(
            """{"id":"s1","date":"2026-11-01","amount":5000,"category_id":null,"pay_kind":"card","account_id":"card1",
               "owner":"joint","paid_by":"a","memo":"이마트","created_at":"2026-11-01T01:00:00Z","source":"notification",
               "tags":["장보기"],"installment_months":3,"approval_no":"12345678","rev":4,"created_by":"b",
               "updated_at":"2026-11-02T01:00:00Z","updated_by":"a"}""",
        )
        assertEquals(SpendingSource.NOTIFICATION, s.source)
        assertEquals(3, s.installmentMonths)
        assertEquals(4, s.rev)
        assertEquals(Person.B, s.createdBy)
    }

    @Test fun spending_row_before_004() {
        val s = json.decodeFromString<Spending>(
            """{"id":"s1","date":"2026-11-01","amount":5000,"pay_kind":"cash","owner":"a","paid_by":"a","memo":"","created_at":"2026-11-01T01:00:00Z"}""",
        )
        assertEquals(SpendingSource.MANUAL, s.source)
        assertEquals(1, s.installmentMonths)
        assertNull(s.rev)
    }

    // 012: 일정 할 일을 끝낸 체크 (회차마다 따로)
    @Test fun event_check_row() {
        val c = json.decodeFromString<Check>(
            """{"id":"e:2026-05:ev-1@2026-05-01","month":"2026-05","kind":"event","amount":0,"done_at":"2026-05-20T01:00:00Z","done_by":"b"}""",
        )
        assertEquals(CheckKind.EVENT, c.kind)
        assertEquals(c.id, checkId(CheckKind.EVENT, "2026-05", "ev-1@2026-05-01"))
    }
}
