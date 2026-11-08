package `in`.sigidpam.bitchordlite

import android.app.Activity
import android.content.Intent
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.Plugin

/**
 * The page's bridge to [YtLoginActivity]. The desktop bridge opens its own
 * Tauri window; on Android the page asks this plugin instead, then posts the
 * cookie jar to the Rust bridge as `yt.setCookies`.
 */
@TauriPlugin
class BitchordTvPlugin(private val activity: Activity) : Plugin(activity) {
    private fun prefs() = activity.getSharedPreferences("bitchord-tv", Activity.MODE_PRIVATE)

    @Command
    fun openLogin(invoke: Invoke) {
        prefs().edit().putString("loginState", "open").apply()
        activity.startActivity(Intent(activity, YtLoginActivity::class.java))
        invoke.resolve()
    }

    @Command
    fun loginState(invoke: Invoke) {
        invoke.resolveObject(mapOf("state" to (prefs().getString("loginState", "idle") ?: "idle")))
    }

    @Command
    fun getCookies(invoke: Invoke) {
        val header = prefs().getString("cookies", "").orEmpty()
        val cookies = header.split("; ").mapNotNull { pair ->
            val split = pair.indexOf('=')
            if (split <= 0) null else mapOf(
                "name" to pair.substring(0, split),
                "value" to pair.substring(split + 1),
            )
        }
        invoke.resolveObject(cookies)
    }
}
