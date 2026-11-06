mod bridge;

fn main() {
    tauri::Builder::default()
        .setup(|_app| {
            bridge::spawn();
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running BitChord Lite");
}
