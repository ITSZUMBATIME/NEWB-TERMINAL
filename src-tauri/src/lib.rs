// NEWB: the Rust side.
// Its job: start a real shell (bash, zsh...) for each tab, pass the keys you type
// into it, and pass everything the shell prints back to the window.

mod fonts;
mod fsinfo;
mod repo;
mod sysinfo;
mod themes;

use std::{
    collections::HashMap,
    io::{Read, Write},
    sync::{
        atomic::{AtomicU64, Ordering},
        Mutex,
    },
};

use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};

/// One running shell (one per tab).
struct Session {
    /// Which launch of a shell this is. Lets a shell tell "I ended" apart from "I was replaced".
    generation: u64,
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    child: Box<dyn Child + Send + Sync>,
    pid: Option<u32>,
}

/// All running shells, looked up by tab id.
#[derive(Default)]
struct AppState {
    sessions: Mutex<HashMap<u32, Session>>,
}

/// Counts up with every shell started, so each one gets its own number.
static NEXT_GENERATION: AtomicU64 = AtomicU64::new(1);

#[derive(Clone, Serialize)]
struct OutputPayload {
    id: u32,
    data: String,
}

#[derive(Clone, Serialize)]
struct ExitPayload {
    id: u32,
}

/// Start a new shell for tab `id`.
#[tauri::command]
fn pty_spawn(
    app: AppHandle,
    state: State<AppState>,
    id: u32,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let pair = native_pty_system()
        .openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())?;

    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string());
    let mut cmd = CommandBuilder::new(shell);
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");
    if let Ok(home) = std::env::var("HOME") {
        cmd.cwd(home);
    }

    let child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
    let pid = child.process_id();
    drop(pair.slave);

    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;

    // Register the shell first, so the reader below can tell whether it is still the current one.
    // If this tab number was used before (for example after the window reloaded), the old
    // shell is stopped quietly: it must not announce that "its" tab has ended.
    let generation = NEXT_GENERATION.fetch_add(1, Ordering::Relaxed);
    let old = state.sessions.lock().unwrap().insert(
        id,
        Session {
            generation,
            master: pair.master,
            writer,
            child,
            pid,
        },
    );
    if let Some(mut old) = old {
        let _ = old.child.kill();
    }

    // Background thread: read what the shell prints and send it to the window.
    std::thread::spawn(move || {
        let mut buf = [0u8; 8192];
        let mut pending: Vec<u8> = Vec::new(); // holds half-finished characters
        loop {
            match reader.read(&mut buf) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    pending.extend_from_slice(&buf[..n]);
                    let (text, rest) = match std::str::from_utf8(&pending) {
                        Ok(s) => (s.to_string(), Vec::new()),
                        // A character was cut in half: send the good part, keep the rest.
                        Err(e) if e.error_len().is_none() => {
                            let v = e.valid_up_to();
                            (
                                String::from_utf8_lossy(&pending[..v]).into_owned(),
                                pending[v..].to_vec(),
                            )
                        }
                        Err(_) => (String::from_utf8_lossy(&pending).into_owned(), Vec::new()),
                    };
                    pending = rest;
                    if !text.is_empty() {
                        let _ = app.emit("pty-output", OutputPayload { id, data: text });
                    }
                }
            }
        }
        // Only announce the end if this shell is still the registered one for the tab.
        // (A closed tab, or a shell that was replaced, has already been dealt with.)
        let ended_by_itself = {
            let state = app.state::<AppState>();
            let mut sessions = state.sessions.lock().unwrap();
            let current = sessions.get(&id).map(|s| s.generation) == Some(generation);
            if current {
                sessions.remove(&id);
            }
            current
        };
        if ended_by_itself {
            let _ = app.emit("pty-exit", ExitPayload { id });
        }
    });

    Ok(())
}

/// Send typed keys to the shell.
#[tauri::command]
fn pty_write(state: State<AppState>, id: u32, data: String) -> Result<(), String> {
    let mut sessions = state.sessions.lock().unwrap();
    if let Some(s) = sessions.get_mut(&id) {
        s.writer
            .write_all(data.as_bytes())
            .map_err(|e| e.to_string())?;
        s.writer.flush().map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Tell the shell the window changed size.
#[tauri::command]
fn pty_resize(state: State<AppState>, id: u32, cols: u16, rows: u16) -> Result<(), String> {
    let sessions = state.sessions.lock().unwrap();
    if let Some(s) = sessions.get(&id) {
        s.master
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Close a tab's shell.
#[tauri::command]
fn pty_kill(state: State<AppState>, id: u32) -> Result<(), String> {
    if let Some(mut s) = state.sessions.lock().unwrap().remove(&id) {
        let _ = s.child.kill();
    }
    Ok(())
}

/// The folder this tab's shell is currently in (so the file explorer can follow along).
#[tauri::command]
fn pty_cwd(state: State<AppState>, id: u32) -> Result<String, String> {
    let sessions = state.sessions.lock().unwrap();
    let pid = sessions
        .get(&id)
        .and_then(|s| s.pid)
        .ok_or_else(|| "no such tab".to_string())?;
    std::fs::read_link(format!("/proc/{pid}/cwd"))
        .map(|p| p.to_string_lossy().into_owned())
        .map_err(|e| e.to_string())
}

/// Is something other than the shell itself holding the keyboard right now? (A command is running,
/// or the shell is off looking something up, like Fedora's "command not found" search.) NEWB uses
/// this to wait before it types a command for you, so its typing doesn't land in the middle of that.
#[tauri::command]
fn pty_busy(state: State<AppState>, id: u32) -> bool {
    let sessions = state.sessions.lock().unwrap();
    let Some(session) = sessions.get(&id) else { return false };
    match (session.master.process_group_leader(), session.pid) {
        // The shell leads its own group. While it is waiting at the prompt it owns the terminal.
        (Some(front), Some(shell)) => front as u32 != shell,
        _ => false,
    }
}

/// Quit the whole app (used when the last tab closes).
#[tauri::command]
fn quit_app(app: AppHandle) {
    app.exit(0);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            pty_spawn,
            pty_write,
            pty_resize,
            pty_kill,
            quit_app,
            pty_cwd,
            pty_busy,
            fsinfo::list_dir,
            fsinfo::home_dir,
            repo::read_text_file,
            repo::write_text_file,
            repo::find_repos,
            repo::git_summary,
            repo::create_file,
            repo::create_folder,
            repo::rename_path,
            repo::trash_path,
            repo::git_commit,
            repo::git_sync,
            repo::search_project,
            fonts::scan_fonts,
            themes::scan_themes,
            themes::install_theme,
            sysinfo::system_info
        ])
        .run(tauri::generate_context!())
        .expect("error while running NEWB");
}
