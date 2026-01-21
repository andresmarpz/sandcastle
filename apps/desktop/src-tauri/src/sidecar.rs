use std::sync::Arc;
use tauri::AppHandle;
use tauri::Manager;
use tauri_plugin_shell::process::CommandChild;
use tauri_plugin_shell::ShellExt;
use tokio::sync::Mutex;

const HEALTH_CHECK_MAX_ATTEMPTS: u32 = 50;
const HEALTH_CHECK_DELAY_MS: u64 = 100;
const PORT_PARSE_TIMEOUT_MS: u64 = 10000;

pub struct SidecarState {
    child: Arc<Mutex<Option<CommandChild>>>,
    port: Arc<Mutex<Option<u16>>>,
}

impl Default for SidecarState {
    fn default() -> Self {
        Self::new()
    }
}

impl SidecarState {
    pub fn new() -> Self {
        Self {
            child: Arc::new(Mutex::new(None)),
            port: Arc::new(Mutex::new(None)),
        }
    }

    /// Get the port the server is running on (if started)
    pub async fn get_port(&self) -> Option<u16> {
        *self.port.lock().await
    }

    /// Start the Bun sidecar with the bundled server
    pub async fn start(&self, app: &AppHandle) -> Result<u16, String> {
        let mut child_guard = self.child.lock().await;

        if child_guard.is_some() {
            // Already running, return existing port
            return self
                .port
                .lock()
                .await
                .ok_or_else(|| "Server running but port unknown".to_string());
        }

        // Get path to bundled server.js from resources
        let resource_path = app
            .path()
            .resource_dir()
            .map_err(|e| e.to_string())?
            .join("binaries")
            .join("server.js");

        if !resource_path.exists() {
            return Err(format!(
                "Server bundle not found at: {}",
                resource_path.display()
            ));
        }

        // Spawn the sidecar (uses default port 31822 from server.ts)
        let (mut rx, child) = app
            .shell()
            .sidecar("bun")
            .map_err(|e| format!("Failed to create sidecar command: {}", e))?
            .args([
                "run",
                resource_path
                    .to_str()
                    .ok_or("Invalid resource path encoding")?,
            ])
            .spawn()
            .map_err(|e| format!("Failed to spawn sidecar: {}", e))?;

        *child_guard = Some(child);

        // Channel to receive the parsed port
        let (port_tx, port_rx) = tokio::sync::oneshot::channel::<u16>();
        let port_tx = Arc::new(Mutex::new(Some(port_tx)));

        // Spawn task to read sidecar output and parse the port
        let port_tx_clone = port_tx.clone();
        tauri::async_runtime::spawn(async move {
            use tauri_plugin_shell::process::CommandEvent;

            while let Some(event) = rx.recv().await {
                match event {
                    CommandEvent::Stdout(line) => {
                        let line_str = String::from_utf8_lossy(&line);
                        println!("[server] {}", line_str);

                        // Parse port from "SANDCASTLE_SERVER_PORT=XXXXX"
                        if let Some(port_str) = line_str.strip_prefix("SANDCASTLE_SERVER_PORT=") {
                            if let Ok(port) = port_str.trim().parse::<u16>() {
                                if let Some(tx) = port_tx_clone.lock().await.take() {
                                    let _ = tx.send(port);
                                }
                            }
                        }
                    }
                    CommandEvent::Stderr(line) => {
                        eprintln!("[server] {}", String::from_utf8_lossy(&line));
                    }
                    CommandEvent::Error(err) => {
                        eprintln!("[server error] {}", err);
                    }
                    CommandEvent::Terminated(status) => {
                        println!("[server] terminated with status: {:?}", status);
                        break;
                    }
                    _ => {}
                }
            }
        });

        // Wait for port with timeout
        let port = tokio::time::timeout(
            std::time::Duration::from_millis(PORT_PARSE_TIMEOUT_MS),
            port_rx,
        )
        .await
        .map_err(|_| "Timeout waiting for server to report port")?
        .map_err(|_| "Failed to receive port from server")?;

        // Store the port
        *self.port.lock().await = Some(port);

        // Wait for server to be ready (poll health endpoint)
        Self::wait_for_ready(port).await?;

        println!("[sidecar] Server started successfully on port {}", port);
        Ok(port)
    }

    /// Stop the sidecar gracefully
    pub async fn stop(&self) -> Result<(), String> {
        let mut child_guard = self.child.lock().await;

        if let Some(child) = child_guard.take() {
            println!("[sidecar] Stopping server...");
            // Send kill signal - the server handles SIGTERM gracefully via Effect finalizers
            child.kill().map_err(|e| e.to_string())?;
            *self.port.lock().await = None;
            println!("[sidecar] Server stopped");
        }

        Ok(())
    }

    /// Wait for server health endpoint to respond
    async fn wait_for_ready(port: u16) -> Result<(), String> {
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(2))
            .build()
            .map_err(|e| e.to_string())?;

        let health_url = format!("http://localhost:{}/api/health", port);

        for attempt in 1..=HEALTH_CHECK_MAX_ATTEMPTS {
            match client.get(&health_url).send().await {
                Ok(resp) if resp.status().is_success() => {
                    println!("[sidecar] Server ready after {} attempts", attempt);
                    return Ok(());
                }
                _ => {
                    tokio::time::sleep(std::time::Duration::from_millis(HEALTH_CHECK_DELAY_MS))
                        .await;
                }
            }
        }

        Err(format!(
            "Server failed to respond to health check within {}ms",
            HEALTH_CHECK_MAX_ATTEMPTS as u64 * HEALTH_CHECK_DELAY_MS
        ))
    }
}
