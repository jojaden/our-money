package com.jojaden.ourmoney.notice

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/** 모은 알림 한 건 — 폰 안(앱 전용 저장소)에만 둔다. 서버로 보내지 않는다. */
data class NoticeSample(val at: Long, val pkg: String, val title: String, val text: String)

/**
 * 카드 결제 알림 모으기 (해석기를 만들기 전 단계).
 * 카드사·페이 앱 알림의 실제 문구를 보고 해석 규칙을 정하려고, 최근 MAX 건만 앱 전용 파일에 남긴다.
 * 백업·기기 이전에서 빠진다 (AndroidManifest 의 allowBackup=false, data_extraction_rules).
 */
object NoticeSamples {
    private const val MAX = 50
    private const val FILE = "notice-samples.json"

    private fun file(context: Context) = File(context.filesDir, FILE)

    @Synchronized
    fun list(context: Context): List<NoticeSample> {
        val f = file(context)
        if (!f.exists()) return emptyList()
        return runCatching {
            val arr = JSONArray(f.readText())
            (0 until arr.length()).map { i ->
                val o = arr.getJSONObject(i)
                NoticeSample(o.getLong("at"), o.getString("pkg"), o.optString("title"), o.optString("text"))
            }
        }.getOrDefault(emptyList())
    }

    @Synchronized
    fun add(context: Context, s: NoticeSample) {
        // 같은 알림이 고쳐 올라오면(진행 표시 등) 한 번만
        val all = (listOf(s) + list(context).filterNot { it.pkg == s.pkg && it.text == s.text }).take(MAX)
        val arr = JSONArray()
        all.forEach { arr.put(JSONObject().put("at", it.at).put("pkg", it.pkg).put("title", it.title).put("text", it.text)) }
        file(context).writeText(arr.toString())
    }

    @Synchronized
    fun clear(context: Context) {
        file(context).delete()
    }

    /** 공개 저장소에 붙일 수 있게 숫자를 모두 0 으로 가린다 (금액·카드 끝자리·승인번호·시각). 문구 모양은 그대로 남는다 */
    fun masked(s: NoticeSample): String = "[${s.pkg}]\n${s.title}\n${s.text}".replace(Regex("[0-9]"), "0")
}
