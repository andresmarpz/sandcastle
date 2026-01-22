//! macOS Dock badge management
//!
//! Provides commands to set and clear the dock badge count for notifications.

#[cfg(target_os = "macos")]
use cocoa::appkit::NSApp;
#[cfg(target_os = "macos")]
use cocoa::base::nil;
#[cfg(target_os = "macos")]
use cocoa::foundation::NSString;
#[cfg(target_os = "macos")]
use objc::{msg_send, sel, sel_impl};

/// Set the dock badge to show a count.
/// Pass 0 to clear the badge.
#[tauri::command]
pub fn set_dock_badge(count: u32) {
    #[cfg(target_os = "macos")]
    unsafe {
        let app = NSApp();
        let dock_tile: cocoa::base::id = msg_send![app, dockTile];
        let badge_label = if count > 0 {
            NSString::alloc(nil).init_str(&count.to_string())
        } else {
            nil
        };
        let _: () = msg_send![dock_tile, setBadgeLabel: badge_label];
    }

    #[cfg(not(target_os = "macos"))]
    {
        // No-op on other platforms
        let _ = count;
    }
}

/// Clear the dock badge.
#[tauri::command]
pub fn clear_dock_badge() {
    set_dock_badge(0);
}
