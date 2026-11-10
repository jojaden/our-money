package com.jojaden.ourmoney

import android.annotation.SuppressLint
import android.content.ClipData
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge
import androidx.browser.customtabs.CustomTabsIntent
import androidx.core.content.FileProvider
import androidx.core.graphics.toColorInt
import androidx.core.net.toUri
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.webkit.JavaScriptReplyProxy
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import com.jojaden.ourmoney.notice.Expects
import com.jojaden.ourmoney.notice.MatchQueue
import com.jojaden.ourmoney.notice.NoticeActivity
import com.jojaden.ourmoney.notice.SpendQueue
import org.json.JSONObject
import java.io.File

/**
 * 하이브리드 앱 껍데기: 화면은 웹앱(BuildConfig.WEB_URL)을 웹뷰로 띄우고, 안드로이드에서만 되는 것(카드 알림 읽기)만 네이티브로.
 *
 * - 웹뷰는 우리 주소만 연다. 바깥 주소는 브라우저로, 구글 로그인(Supabase authorize)은 크롬 맞춤 탭으로
 *   (구글은 웹뷰 안의 로그인을 막는다). 로그인이 끝나면 ourmoney://auth-callback?code=… 로 돌아오고,
 *   그 code 만 꺼내 우리 주소에 붙여 연다 — 웹의 supabase-js 가 웹뷰에 남겨 둔 PKCE 값으로 세션을 만든다.
 *   다른 앱이 같은 스킴으로 code 를 가로채도 PKCE 값이 없어 쓸 수 없다.
 * - 웹 → 앱 메시지는 우리 주소(origin)의 맨 위 화면에서 온 것만 받는다 (WebMessageListener).
 *   "card-notice" 는 카드 알림 화면, {"type":"ics","text":…} 는 일정 .ics 를 파일로 만들어 공유 창으로 넘긴다.
 *   결제 알림 맞추기: {"type":"expect"} 이번 달 남은 할 일 받기, {"type":"matches"} 맞춘 것과 확인할 지출을 답장으로 보내기,
 *   {"type":"applied"} 웹이 체크를 마친 것 지우기. 앱으로 돌아올 때마다 웹에 "ourmoney-resume" 를 알려 다시 가져가게 한다.
 * - 뒤로 가기는 웹의 기록을 따른다 (웹은 시트·상세를 기록 한 칸으로 연다).
 */
class MainActivity : ComponentActivity() {
    private lateinit var web: WebView
    private val home: Uri by lazy { BuildConfig.WEB_URL.toUri() }
    private val origin: String by lazy { "${home.scheme}://${home.authority}" }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // 웹 화면이 밝은 배경 하나라 시스템 막대 아이콘은 늘 어둡게
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.light(Color.TRANSPARENT, Color.TRANSPARENT),
            navigationBarStyle = SystemBarStyle.light(Color.TRANSPARENT, Color.TRANSPARENT),
        )
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)

        web = WebView(this).apply {
            setBackgroundColor(BG)
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true // 로그인 세션·예시 데이터·보내지 못한 저장 (localStorage)
            settings.allowFileAccess = false
            settings.allowContentAccess = false
            settings.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            // 웹이 앱 안인지, 이 앱이 무엇을 할 수 있는지 알도록 (로그인 돌아올 주소, 카드 알림 메뉴, 일정 공유)
            settings.userAgentString = "${settings.userAgentString} OurMoneyApp/${BuildConfig.VERSION_NAME} OurMoneyCan/ics,match"
            webViewClient = ShellClient()
        }
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            WebViewCompat.addWebMessageListener(web, "OurMoneyApp", setOf(origin)) { _, message, _, isMainFrame, reply ->
                val data = message.data
                when {
                    !isMainFrame || data == null || data.length > MAX_ICS -> Unit
                    data == "card-notice" -> startActivity(Intent(this, NoticeActivity::class.java))
                    data.startsWith("{") -> runCatching { JSONObject(data) }.getOrNull()?.let { onMessage(it, reply) }
                }
            }
        }

        // 웹뷰는 시스템 막대·키보드 안쪽에 둔다 (웹은 env(safe-area-inset-*) 없이도 가려지지 않는다)
        val root = FrameLayout(this).apply {
            setBackgroundColor(BG)
            addView(web)
        }
        ViewCompat.setOnApplyWindowInsetsListener(root) { v, insets ->
            val i = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.ime() or WindowInsetsCompat.Type.displayCutout())
            v.setPadding(i.left, i.top, i.right, i.bottom)
            WindowInsetsCompat.CONSUMED
        }
        setContentView(root)

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (web.canGoBack()) web.goBack() else finish()
            }
        })

        if (savedInstanceState == null || web.restoreState(savedInstanceState) == null) {
            web.loadUrl(callbackUrl(intent) ?: BuildConfig.WEB_URL)
        }
    }

    override fun onResume() {
        super.onResume()
        // 결제 알림으로 맞춘 것이 있으면 웹이 가져가 체크하게 (앱으로 돌아올 때마다)
        web.evaluateJavascript("window.dispatchEvent(new Event('ourmoney-resume'))", null)
    }

    private fun onMessage(msg: JSONObject, reply: JavaScriptReplyProxy) {
        when (msg.optString("type")) {
            "ics" -> shareIcs(msg.optString("text"))
            "expect" -> Expects.save(this, msg.optJSONArray("items"))
            "matches" -> reply.postMessage(
                JSONObject().put("type", "matches").put("items", MatchQueue.forWeb(this)).put("spends", SpendQueue.forWeb(this)).toString(),
            )
            "applied" -> msg.optJSONArray("ids")?.let { arr ->
                val ids = (0 until minOf(arr.length(), 200)).map { arr.optString(it) }.filter { it.isNotEmpty() }.toSet()
                MatchQueue.remove(this, ids)
                SpendQueue.remove(this, ids)
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        callbackUrl(intent)?.let(web::loadUrl)
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        web.saveState(outState)
    }

    override fun onDestroy() {
        web.destroy()
        super.onDestroy()
    }

    /**
     * 일정 내보내기: 웹이 만든 .ics 글을 캐시의 exports/ 에 한 파일로 쓰고 공유 창을 연다.
     * 파일 이름은 앱이 정하고(웹이 주는 이름은 쓰지 않는다), 받는 앱에는 그 파일 읽기만 잠깐 허락한다(FileProvider, 내보내지 않음).
     * 공유 창에는 파일을 바로 여는 달력 앱(삼성 캘린더 등)도 함께 보인다.
     */
    private fun shareIcs(text: String) {
        if (!text.startsWith("BEGIN:VCALENDAR") || text.length > MAX_ICS) return
        val file = File(cacheDir, "exports").apply { mkdirs() }.resolve("our-money-calendar.ics")
        file.writeText(text)
        val uri = FileProvider.getUriForFile(this, "$packageName.files", file)
        val send = Intent(Intent.ACTION_SEND).apply {
            type = ICS
            putExtra(Intent.EXTRA_STREAM, uri)
            clipData = ClipData.newRawUri(null, uri)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        val open = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, ICS)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        val chooser = Intent.createChooser(send, "일정 내보내기").putExtra(Intent.EXTRA_INITIAL_INTENTS, arrayOf(open))
        runCatching { startActivity(chooser) }
    }

    /** ourmoney://auth-callback?code=… 이면 우리 주소에 code 만 붙여서. 그 밖의 값은 쓰지 않는다 */
    private fun callbackUrl(intent: Intent?): String? {
        val data = intent?.data ?: return null
        if (data.scheme != "ourmoney" || data.host != "auth-callback") return null
        val code = data.getQueryParameter("code")?.takeIf { CODE.matches(it) } ?: return BuildConfig.WEB_URL
        return home.buildUpon().path("/").clearQuery().appendQueryParameter("code", code).build().toString()
    }

    private inner class ShellClient : WebViewClient() {
        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
            val url = request.url
            if ("${url.scheme}://${url.authority}" == origin) return false
            val http = url.scheme == "https" || url.scheme == "http"
            if (http && url.host?.endsWith(".supabase.co") == true && url.path?.startsWith("/auth/v1/authorize") == true) {
                CustomTabsIntent.Builder().setShowTitle(true).build().launchUrl(this@MainActivity, url)
            } else if (http) {
                runCatching { startActivity(Intent(Intent.ACTION_VIEW, url).addCategory(Intent.CATEGORY_BROWSABLE)) }
            }
            // intent:, file: 같은 다른 스킴은 열지 않는다
            return true
        }
    }

    private companion object {
        /** 웹 배경 (tokens 의 page 색, manifest theme_color) */
        val BG = "#F3F3F1".toColorInt()
        /** OAuth code 는 URL 안전 문자만 */
        val CODE = Regex("^[A-Za-z0-9._~-]{1,512}$")
        const val ICS = "text/calendar"
        /** 일정 수천 개도 넉넉한 크기 — 넘으면 받지 않는다 */
        const val MAX_ICS = 5_000_000
    }
}
