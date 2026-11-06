mod bridge;
mod yt_auth;

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            bridge::spawn(app.handle().clone());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running BitChord Lite");
}
