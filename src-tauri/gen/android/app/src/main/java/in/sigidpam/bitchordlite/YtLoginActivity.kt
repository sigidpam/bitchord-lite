package `in`.sigidpam.bitchordlite

import android.annotation.SuppressLint
import android.app.Activity
import android.graphics.Color
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout

/**
 * Google sign-in for the TV. The desktop app opens a second Tauri window and
 * reads its cookie jar; Android has one webview, so this screen owns a plain
 * WebView and hands the YouTube cookies back through SharedPreferences.
 *
 * The page is Google's own; a small spatial-navigation shim is injected so a
 * remote can reach its fields and buttons without a mouse.
 */
class YtLoginActivity : Activity() {
    private lateinit var webView: WebView
    private val handler = Handler(Looper.getMainLooper())
    private var finished = false

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        state("open")
        CookieManager.getInstance().setAcceptCookie(true)

        webView = WebView(this)
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true)
        webView.setBackgroundColor(Color.WHITE)
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            mediaPlaybackRequiresUserGesture = false
            userAgentString = DESKTOP_UA
        }
        webView.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView, url: String) {
                view.evaluateJavascript(SPATIAL_NAV, null)
            }
        }
        setContentView(
            webView,
            FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
            ),
        )
        webView.loadUrl(
            "https://accounts.google.com/ServiceLogin?service=youtube&continue=https%3A%2F%2Fmusic.youtube.com%2F",
        )
        webView.requestFocus()
        handler.postDelayed(poll, 1500)
    }

    private val poll = object : Runnable {
        override fun run() {
            if (finished) return
            val cookies = CookieManager.getInstance().getCookie(MUSIC_ORIGIN).orEmpty()
            if (cookies.contains("SAPISID=") || cookies.contains("__Secure-3PAPISID=")) {
                finishWithCookies(cookies)
                return
            }
            handler.postDelayed(this, 1000)
        }
    }

    private fun finishWithCookies(cookies: String) {
        finished = true
        prefs().edit().putString("cookies", cookies).putString("loginState", "done").apply()
        CookieManager.getInstance().flush()
        finish()
    }

    @Deprecated("Android 13 predates the onBackPressedDispatcher for this screen")
    override fun onBackPressed() {
        if (webView.canGoBack()) webView.goBack() else cancel()
    }

    private fun cancel() {
        if (finished) return
        finished = true
        prefs().edit().putString("loginState", "cancelled").apply()
        finish()
    }

    override fun onDestroy() {
        handler.removeCallbacksAndMessages(null)
        CookieManager.getInstance().flush()
        if (::webView.isInitialized) webView.destroy()
        super.onDestroy()
    }

    private fun prefs() = getSharedPreferences("bitchord-tv", MODE_PRIVATE)

    private fun state(value: String) {
        prefs().edit().putString("loginState", value).apply()
    }

    companion object {
        private const val MUSIC_ORIGIN = "https://music.youtube.com"

        // A desktop UA keeps Google from treating the sign-in as an embedded webview.
        private const val DESKTOP_UA =
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36"

        /** Arrow keys move focus; Enter keeps the browser's own activation. */
        private const val SPATIAL_NAV = """
            (function () {
              if (window.__tvNav) return;
              window.__tvNav = true;
              var SEL = 'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"]),[role="button"]';
              function visible(el) {
                if (!el.isConnected) return false;
                var s = getComputedStyle(el);
                if (s.display === 'none' || s.visibility === 'hidden') return false;
                var r = el.getBoundingClientRect();
                return r.width > 2 && r.height > 2;
              }
              function focus(el) {
                el.focus();
                el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
              }
              document.addEventListener('keydown', function (e) {
                var dir = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }[e.key];
                if (!dir) return;
                var cur = document.activeElement;
                if (cur && (cur.tagName === 'INPUT' || cur.tagName === 'TEXTAREA') &&
                    (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) return;
                var list = Array.prototype.slice.call(document.querySelectorAll(SEL)).filter(visible);
                if (!cur || cur === document.body || !cur.getBoundingClientRect) {
                  if (list.length) { focus(list[0]); e.preventDefault(); }
                  return;
                }
                var cr = cur.getBoundingClientRect();
                var cx = (cr.left + cr.right) / 2, cy = (cr.top + cr.bottom) / 2;
                var best = null, bestScore = Infinity;
                list.forEach(function (el) {
                  if (el === cur || el.contains(cur) || cur.contains(el)) return;
                  var r = el.getBoundingClientRect();
                  var dx = (r.left + r.right) / 2 - cx;
                  var dy = (r.top + r.bottom) / 2 - cy;
                  var horizontal = dir === 'left' || dir === 'right';
                  if (dir === 'left' && dx > -1) return;
                  if (dir === 'right' && dx < 1) return;
                  if (dir === 'up' && dy > -1) return;
                  if (dir === 'down' && dy < 1) return;
                  var primary = horizontal ? Math.abs(dx) : Math.abs(dy);
                  var cross = horizontal ? Math.abs(dy) : Math.abs(dx);
                  var score = primary + cross * 2.5;
                  if (score < bestScore) { bestScore = score; best = el; }
                });
                if (best) { focus(best); e.preventDefault(); }
              }, true);
            })();
        """
    }
}
