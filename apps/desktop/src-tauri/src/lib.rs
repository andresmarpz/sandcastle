use tauri::{TitleBarStyle, WebviewUrl, WebviewWindowBuilder};

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            let win_builder = WebviewWindowBuilder::new(app, "main", WebviewUrl::default())
                .title("Sandcastle")
                .inner_size(1440.0, 900.0)
                .min_inner_size(800.0, 600.0)
                .resizable(true)
                .fullscreen(false);

            #[cfg(target_os = "macos")]
            let win_builder = win_builder
                .title_bar_style(TitleBarStyle::Overlay)
                .hidden_title(true);

            let window = win_builder.build().unwrap();

            #[cfg(target_os = "macos")]
            {
                use cocoa::appkit::{NSColor, NSWindow};
                use cocoa::base::{id, nil};

                let ns_window = window.ns_window().unwrap() as id;
                unsafe {
                    // Use opaque background for better compositing performance
                    let bg_color = NSColor::colorWithRed_green_blue_alpha_(
                        nil,
                        0.08,
                        0.08,
                        0.08,
                        1.0, // Fully opaque
                    );
                    ns_window.setBackgroundColor_(bg_color);
                }
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![greet])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
