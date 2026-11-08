mod bridge;
mod yt_auth;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();
    #[cfg(mobile)]
    let builder = builder.plugin(
        tauri::plugin::Builder::<_, ()>::new("bitchord-tv")
            .setup(|_app, api| {
                #[cfg(target_os = "android")]
                api.register_android_plugin("in.sigidpam.bitchordlite", "BitchordTvPlugin")?;
                Ok(())
            })
            .build(),
    );
    builder
        .setup(|app| {
            bridge::spawn(app.handle().clone());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running BitChord Lite");
}
