mod db;

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
};

use db::DbManager;

#[tauri::command]
fn toggle_window(app: tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        if window.is_visible().unwrap_or(false) {
            let _ = window.hide();
        } else {
            let _ = window.show();
            let _ = window.set_focus();
        }
    }
}

#[tauri::command]
fn hide_window(app: tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.hide();
    }
}

#[tauri::command]
fn minimize_window(app: tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.minimize();
    }
}

#[tauri::command]
fn close_window(app: tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.close();
    }
}

#[tauri::command]
fn start_feishu_agent() -> Result<String, String> {
    use std::process::Command;

    // 启动 ngrok（新 CMD 窗口）
    Command::new("cmd")
        .args(["/c", "start", "cmd", "/k", "ngrok http 8000"])
        .spawn()
        .map_err(|e| format!("启动 ngrok 失败: {}", e))?;

    // 启动 Flask 服务（新 CMD 窗口）
    Command::new("cmd")
        .args(["/c", "start", "cmd", "/k", "cd /d D:\\Data Agent\\data_analysis_agents && python feishu_server.py"])
        .spawn()
        .map_err(|e| format!("启动 Flask 失败: {}", e))?;

    Ok("已启动 ngrok 和飞书 Agent 服务".to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_log::Builder::default().build())
        .plugin(tauri_plugin_sql::Builder::new().add_migrations("sqlite:history.db", vec![]).build())
        .manage(DbManager::new())
        .setup(|app| {
            // 创建右键菜单
            let show_item = MenuItem::with_id(app, "show", "显示窗口", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_item, &quit_item])?;

            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("SQL Prompt Copilot")
                .menu(&menu)
                .on_menu_event(|app, event| {
                    match event.id().as_ref() {
                        "show" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        "quit" => {
                            app.exit(0);
                        }
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            if window.is_visible().unwrap_or(false) {
                                let _ = window.hide();
                            } else {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    }
                })
                .build(app)?;

            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            toggle_window,
            hide_window,
            minimize_window,
            close_window,
            start_feishu_agent,
            db::commands::db_test_connection,
            db::commands::db_connect,
            db::commands::db_disconnect,
            db::commands::save_credential,
            db::commands::get_credential,
            db::commands::delete_credential,
            db::commands::migrate_credential
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
