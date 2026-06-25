use portable_pty::{CommandBuilder, MasterPty, NativePtySystem, PtySize, PtySystem};
use serde::Serialize;
use std::io::{Read, Write};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::sync::{Mutex, RwLock};

#[derive(Clone, Serialize)]
pub struct TerminalOutput {
    pub data: String,
}

pub struct TerminalSession {
    writer: Arc<Mutex<Box<dyn Write + Send>>>,
    master: Arc<Mutex<Box<dyn MasterPty + Send>>>,
    killer: Arc<Mutex<Box<dyn portable_pty::ChildKiller + Send + Sync>>>,
}

pub struct TerminalManager {
    sessions: RwLock<std::collections::HashMap<String, TerminalSession>>,
    next_id: Mutex<u64>,
}

impl TerminalManager {
    pub fn new() -> Self {
        Self {
            sessions: RwLock::new(std::collections::HashMap::new()),
            next_id: Mutex::new(1),
        }
    }

    pub async fn spawn(&self, app: AppHandle) -> Result<String, String> {
        let pty_system = NativePtySystem::default();

        let cmd = if cfg!(target_os = "windows") {
            "cmd.exe"
        } else {
            "bash"
        };

        let mut builder = CommandBuilder::new(cmd);
        if let Ok(cwd) = std::env::current_dir() {
            builder.cwd(cwd);
        }

        let pair = pty_system
            .openpty(PtySize { rows: 24, cols: 80, pixel_width: 0, pixel_height: 0 })
            .map_err(|e| format!("Falha ao criar PTY: {}", e))?;

        let child = pair
            .slave
            .spawn_command(builder)
            .map_err(|e| format!("Falha ao spawnar shell: {}", e))?;

        let master = Arc::new(Mutex::new(pair.master));
        let reader = master
            .lock()
            .await
            .try_clone_reader()
            .map_err(|e| format!("Falha ao clonar reader: {}", e))?;
        let writer = Arc::new(Mutex::new(
            master
                .lock()
                .await
                .take_writer()
                .map_err(|e| format!("Falha ao obter writer: {}", e))?,
        ));
        let killer = Arc::new(Mutex::new(child.clone_killer()));

        let session_id = {
            let mut id_lock = self.next_id.lock().await;
            let id = format!("term-{}", *id_lock);
            *id_lock += 1;
            id
        };

        self.sessions.write().await.insert(
            session_id.clone(),
            TerminalSession {
                writer: writer.clone(),
                master: master.clone(),
                killer: killer.clone(),
            },
        );

        let app_clone = app.clone();
        let sid = session_id.clone();
        tokio::task::spawn_blocking(move || {
            let mut buf = [0u8; 4096];
            let mut reader = reader;
            loop {
                match reader.read(&mut buf) {
                    Ok(0) | Err(_) => break,
                    Ok(n) => {
                        let data = String::from_utf8_lossy(&buf[..n]).to_string();
                        let _ = app_clone.emit("terminal-output", TerminalOutput { data });
                    }
                }
            }
            let _ = app_clone.emit("terminal-exit", sid);
        });

        Ok(session_id)
    }

    pub async fn write(&self, session_id: &str, data: String) -> Result<(), String> {
        let sessions = self.sessions.read().await;
        let session = sessions
            .get(session_id)
            .ok_or_else(|| "Sessão terminal não encontrada".to_string())?;
        let mut writer = session.writer.lock().await;
        writer
            .write_all(data.as_bytes())
            .map_err(|e| format!("Erro ao escrever: {}", e))?;
        writer
            .flush()
            .map_err(|e| format!("Erro ao flush: {}", e))?;
        Ok(())
    }

    pub async fn resize(&self, session_id: &str, rows: u16, cols: u16) -> Result<(), String> {
        let sessions = self.sessions.read().await;
        let session = sessions
            .get(session_id)
            .ok_or_else(|| "Sessão terminal não encontrada".to_string())?;
        let master = session.master.lock().await;
        master
            .resize(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 })
            .map_err(|e| format!("Erro ao redimensionar: {}", e))?;
        Ok(())
    }

    pub async fn kill(&self, session_id: &str) -> Result<(), String> {
        let mut sessions = self.sessions.write().await;
        if let Some(session) = sessions.remove(session_id) {
            let mut killer = session.killer.lock().await;
            let _ = killer.kill();
        }
        Ok(())
    }
}
