use tauri::{Manager, TitleBarStyle, WebviewUrl, WebviewWindowBuilder};

mod dock;
mod markdown;
mod sidecar;
use sidecar::SidecarState;

#[cfg(target_os = "macos")]
mod high_refresh_rate;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

/// Get the port the embedded server is running on.
/// Returns None if the server hasn't started yet or failed to start.
#[tauri::command]
async fn get_server_port(state: tauri::State<'_, SidecarState>) -> Result<Option<u16>, String> {
    Ok(state.get_port().await)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_opener::init())
        .manage(SidecarState::new())
        .setup(|app| {
            // Start sidecar on app launch
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let state = app_handle.state::<SidecarState>();
                if let Err(e) = state.start(&app_handle).await {
                    eprintln!("[sidecar] Failed to start: {}", e);
                }
            });

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
                        nil, 0.08, 0.08, 0.08, 1.0, // Fully opaque
                    );
                    ns_window.setBackgroundColor_(bg_color);
                }

                // Unlock 120fps rendering on ProMotion displays
                // Uses private WebKit APIs - for direct distribution only, not App Store
                let _ = window.with_webview(|wv| {
                    if let Err(e) = high_refresh_rate::unlock_high_refresh_rate(wv.inner()) {
                        // Non-fatal: app works fine at 60fps if this fails
                        eprintln!("[high_refresh_rate] {}", e);
                    }
                });
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                // Stop sidecar when window is destroyed
                let app_handle = window.app_handle().clone();
                tauri::async_runtime::spawn(async move {
                    let state = app_handle.state::<SidecarState>();
                    if let Err(e) = state.stop().await {
                        eprintln!("[sidecar] Failed to stop: {}", e);
                    }
                });
            }
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            get_server_port,
            markdown::parse_markdown_command,
            dock::set_dock_badge,
            dock::clear_dock_badge
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
