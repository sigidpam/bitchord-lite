fn main() {
    // The Android sign-in plugin is app-local; its commands still need an ACL
    // manifest, or the IPC layer rejects them.
    let attributes = tauri_build::Attributes::new().plugin(
        "bitchord-tv",
        tauri_build::InlinedPlugin::new()
            .commands(&["openLogin", "loginState", "getCookies"])
            .default_permission(tauri_build::DefaultPermissionRule::AllowAllCommands),
    );
    tauri_build::try_build(attributes).expect("failed to run tauri-build");
}
