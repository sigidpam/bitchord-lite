# The Rust side registers the mobile plugin by class name, so R8 cannot see
# the reference. The login activity is named in the manifest and by the plugin.
-keep class in.sigidpam.bitchordlite.BitchordTvPlugin { *; }
-keepclassmembers class in.sigidpam.bitchordlite.BitchordTvPlugin {
    @app.tauri.annotation.Command <methods>;
}
-keep class in.sigidpam.bitchordlite.YtLoginActivity { *; }
