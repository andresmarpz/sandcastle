//! Unlocks high refresh rate (120fps) rendering in WKWebView on macOS.
//!
//! By default, WKWebView caps requestAnimationFrame and rendering to 60fps,
//! even on ProMotion displays that support 120Hz. This module uses private
//! WebKit APIs to disable this limitation.
//!
//! ## How it works
//!
//! Safari has a preference called "Prefer Page Rendering Updates near 60fps"
//! (key: `PreferPageRenderingUpdatesNear60FPSEnabled`) that caps rendering
//! to 60fps for power efficiency. This preference is exposed through WebKit's
//! private `_experimentalFeatures` API on `WKPreferences`.
//!
//! We access this API to disable the preference, allowing the WebView to
//! render at the display's native refresh rate (e.g., 120Hz on ProMotion).
//!
//! ## Compatibility
//!
//! - **macOS**: 10.14.4+ (when `_experimentalFeatures` was introduced)
//! - **Tested on**: macOS 15 (Sequoia)
//!
//! ## Caveats
//!
//! - **App Store**: This uses private APIs. Apple will reject submissions.
//!   Only use for direct distribution (GitHub releases, website downloads).
//! - **Future macOS versions**: Private APIs can change. The code gracefully
//!   fails if the API is unavailable, so updates won't break the app.
//! - **Battery life**: Higher frame rates use more power. This is why Apple
//!   defaults to 60fps.

use objc2::rc::Retained;
use objc2::runtime::{AnyClass, AnyObject, Bool};
use objc2::{class, msg_send};
use objc2_foundation::{NSArray, NSString};

/// Disables the 60fps frame rate lock on a WKWebView, enabling ProMotion 120fps.
///
/// Returns `Ok(())` if the preference was found and disabled, or an error
/// describing why it couldn't be disabled (API unavailable, preference not found).
///
/// This function is safe to call even if the API changes - it will simply
/// return an error and the app will continue to work at 60fps.
pub fn unlock_high_refresh_rate(webview_ptr: *mut std::ffi::c_void) -> Result<(), String> {
    if webview_ptr.is_null() {
        return Err("WebView pointer is null".to_string());
    }

    unsafe {
        let webview = webview_ptr as *mut AnyObject;

        // Get WKWebViewConfiguration -> WKPreferences
        let config: *mut AnyObject = msg_send![webview, configuration];
        if config.is_null() {
            return Err("Failed to get WKWebViewConfiguration".to_string());
        }

        let preferences: *mut AnyObject = msg_send![config, preferences];
        if preferences.is_null() {
            return Err("Failed to get WKPreferences".to_string());
        }

        let wk_preferences_class = class!(WKPreferences);

        // The 60fps preference moved between internal debug features and
        // experimental features across macOS versions. Check both.
        if let Some(result) = try_disable_in_features(
            wk_preferences_class,
            preferences,
            FeatureType::InternalDebug,
        ) {
            return result;
        }

        if let Some(result) =
            try_disable_in_features(wk_preferences_class, preferences, FeatureType::Experimental)
        {
            return result;
        }

        Err("60fps preference not found in internal debug or experimental features".to_string())
    }
}

#[derive(Clone, Copy)]
enum FeatureType {
    InternalDebug,
    Experimental,
}

/// Attempts to find and disable the 60fps preference in the given feature list.
/// Returns `Some(Ok(()))` if found and disabled, `Some(Err(...))` if found but
/// failed to disable, or `None` if not found in this feature list.
unsafe fn try_disable_in_features(
    wk_preferences_class: &AnyClass,
    preferences: *mut AnyObject,
    feature_type: FeatureType,
) -> Option<Result<(), String>> {
    let features: Option<Retained<NSArray<AnyObject>>> = match feature_type {
        FeatureType::InternalDebug => msg_send![wk_preferences_class, _internalDebugFeatures],
        FeatureType::Experimental => msg_send![wk_preferences_class, _experimentalFeatures],
    };

    let features = features?;
    let count: usize = msg_send![&*features, count];

    for i in 0..count {
        let feature: *mut AnyObject = msg_send![&*features, objectAtIndex: i];
        if feature.is_null() {
            continue;
        }

        let key: Option<Retained<NSString>> = msg_send![feature, key];
        let key = match key {
            Some(k) => k,
            None => continue,
        };

        let key_str = key.to_string();

        // Match the preference by key name
        // Known names: "PreferPageRenderingUpdatesNear60FPSEnabled"
        if key_str.contains("PreferPageRenderingUpdatesNear60FPS")
            || key_str.contains("60FPS")
            || key_str.contains("60fps")
        {
            // Disable the preference based on feature type
            match feature_type {
                FeatureType::InternalDebug => {
                    let _: () = msg_send![
                        preferences,
                        _setEnabled: Bool::NO,
                        forInternalDebugFeature: feature
                    ];
                }
                FeatureType::Experimental => {
                    let _: () = msg_send![
                        preferences,
                        _setEnabled: Bool::NO,
                        forExperimentalFeature: feature
                    ];
                }
            }

            let type_name = match feature_type {
                FeatureType::InternalDebug => "internal debug",
                FeatureType::Experimental => "experimental",
            };
            println!(
                "[high_refresh_rate] Disabled '{}' ({} feature) - 120fps unlocked",
                key_str, type_name
            );

            return Some(Ok(()));
        }
    }

    None
}
