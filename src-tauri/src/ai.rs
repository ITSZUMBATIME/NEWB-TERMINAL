// The AI helpers (all optional, off unless you turn them on in Settings).
//
// NEWB doesn't talk to any AI service itself and keeps no keys. It runs the AI tools you already
// have installed (Claude Code's `claude`, OpenAI's `codex`), which sign in on their own.
//   - ai_detect: which of them are installed
//   - ai_ask:    ask one question and get one answer back (read-only), used by the Ask bar
//   - ai_cancel: stop a question that is taking too long
// The longer chat is a normal terminal tab started through pty_spawn (see lib.rs).

use std::{
    collections::HashMap,
    io::Read,
    path::PathBuf,
    process::{Child, Command, Stdio},
    sync::{Arc, Mutex},
    thread,
    time::{Duration, Instant},
};

use serde::Serialize;

/// The only programs NEWB will ever start for the AI features: (id, name).
pub const TOOLS: [(&str, &str); 2] = [("claude", "Claude Code"), ("codex", "Codex")];
/// A question that takes longer than this is given up on.
const ASK_SECONDS: u64 = 150;

#[derive(Serialize)]
pub struct AiTool {
    id: String,
    name: String,
    path: String,
    version: String,
}

/// Where these tools tend to be installed, on top of the folders in PATH.
fn search_dirs() -> Vec<PathBuf> {
    let mut dirs: Vec<PathBuf> = std::env::var_os("PATH")
        .map(|p| std::env::split_paths(&p).collect())
        .unwrap_or_default();
    if let Some(home) = std::env::var_os("HOME").map(PathBuf::from) {
        for extra in [
            ".local/bin",
            ".claude/local",
            ".npm-global/bin",
            ".bun/bin",
            ".volta/bin",
            ".cargo/bin",
            ".local/share/pnpm",
        ] {
            dirs.push(home.join(extra));
        }
    }
    for extra in ["/usr/local/bin", "/usr/bin", "/opt/homebrew/bin", "/home/linuxbrew/.linuxbrew/bin"] {
        dirs.push(PathBuf::from(extra));
    }
    dirs
}

/// The full path of an installed tool, or None. Only the known tool names are accepted.
pub fn find_tool(id: &str) -> Option<PathBuf> {
    if !TOOLS.iter().any(|(t, _)| *t == id) {
        return None;
    }
    search_dirs().into_iter().map(|d| d.join(id)).find(|p| p.is_file())
}

/// Run `program args...` and give back what it printed, or None if it took too long.
fn run_quick(program: &PathBuf, args: &[&str], seconds: u64) -> Option<String> {
    let mut child = Command::new(program)
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .ok()?;
    let started = Instant::now();
    loop {
        match child.try_wait().ok()? {
            Some(_) => {
                let mut out = String::new();
                child.stdout.take()?.read_to_string(&mut out).ok()?;
                return Some(out);
            }
            None => {
                if started.elapsed() > Duration::from_secs(seconds) {
                    let _ = child.kill();
                    let _ = child.wait();
                    return None;
                }
                thread::sleep(Duration::from_millis(40));
            }
        }
    }
}

/// Which of the supported AI tools are installed here.
#[tauri::command]
pub async fn ai_detect() -> Vec<AiTool> {
    tauri::async_runtime::spawn_blocking(|| {
        let mut found = Vec::new();
        for (id, name) in TOOLS {
            if let Some(path) = find_tool(id) {
                let version = run_quick(&path, &["--version"], 6)
                    .and_then(|v| v.lines().next().map(|l| l.trim().to_string()))
                    .unwrap_or_default();
                found.push(AiTool {
                    id: id.to_string(),
                    name: name.to_string(),
                    path: path.to_string_lossy().into_owned(),
                    version,
                });
            }
        }
        found
    })
    .await
    .unwrap_or_default()
}

/// Questions in flight, so one can be stopped.
#[derive(Default)]
pub struct AskState {
    running: Mutex<HashMap<u32, Arc<Mutex<Child>>>>,
    cancelled: Mutex<Vec<u32>>,
}

fn friendly(raw: &str) -> String {
    let low = raw.to_lowercase();
    if low.contains("log in") || low.contains("login") || low.contains("not logged") || low.contains("authenticat") || low.contains("api key") {
        "It isn't signed in yet. Open the AI chat (or run the tool once in a terminal) and sign in there, then ask again.".to_string()
    } else if low.contains("could not resolve") || low.contains("network") || low.contains("connection") {
        "Couldn't reach the internet, which the AI needs.".to_string()
    } else {
        let line = raw.lines().find(|l| !l.trim().is_empty()).unwrap_or("The AI tool stopped without an answer.");
        line.trim().chars().take(240).collect()
    }
}

/// Ask a read-only question. The answer comes back as plain text.
#[tauri::command]
pub async fn ai_ask(
    state: tauri::State<'_, AskState>,
    request: u32,
    tool: String,
    prompt: String,
    cwd: Option<String>,
) -> Result<String, String> {
    let prompt = prompt.trim().to_string();
    if prompt.is_empty() || prompt.len() > 12_000 {
        return Err("Type a question first.".to_string());
    }
    let path = find_tool(&tool).ok_or_else(|| "That AI tool isn't installed.".to_string())?;
    // Fixed, read-only settings. The question is only ever one argument, never a shell command.
    let args: Vec<String> = match tool.as_str() {
        "claude" => vec![
            "-p".into(),
            prompt,
            "--disallowedTools".into(),
            "Edit,Write,NotebookEdit,Bash(sudo:*)".into(),
        ],
        _ => vec!["exec".into(), "--sandbox".into(), "read-only".into(), "--skip-git-repo-check".into(), prompt],
    };
    let mut cmd = Command::new(path);
    cmd.args(&args).stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped());
    if let Some(dir) = cwd.filter(|d| std::path::Path::new(d).is_dir()) {
        cmd.current_dir(dir);
    }
    let mut child = cmd.spawn().map_err(|e| e.to_string())?;
    let mut stdout = child.stdout.take().unwrap();
    let mut stderr = child.stderr.take().unwrap();
    let out_thread = thread::spawn(move || {
        let mut s = String::new();
        let _ = stdout.read_to_string(&mut s);
        s
    });
    let err_thread = thread::spawn(move || {
        let mut s = String::new();
        let _ = stderr.read_to_string(&mut s);
        s
    });

    let shared = Arc::new(Mutex::new(child));
    state.running.lock().unwrap().insert(request, shared.clone());
    let started = Instant::now();
    let outcome = loop {
        let done = shared.lock().unwrap().try_wait().map_err(|e| e.to_string())?;
        if let Some(status) = done {
            break Ok(status.success());
        }
        if started.elapsed() > Duration::from_secs(ASK_SECONDS) {
            let mut c = shared.lock().unwrap();
            let _ = c.kill();
            let _ = c.wait();
            break Err("That took too long, so NEWB stopped waiting.".to_string());
        }
        tauri::async_runtime::spawn_blocking(|| thread::sleep(Duration::from_millis(60))).await.ok();
    };
    state.running.lock().unwrap().remove(&request);
    let out = out_thread.join().unwrap_or_default();
    let err = err_thread.join().unwrap_or_default();
    let was_cancelled = {
        let mut c = state.cancelled.lock().unwrap();
        let had = c.contains(&request);
        c.retain(|r| *r != request);
        had
    };
    if was_cancelled {
        return Err("Stopped.".to_string());
    }
    match outcome {
        Err(e) => Err(e),
        Ok(true) if !out.trim().is_empty() => Ok(out.trim().to_string()),
        Ok(_) => Err(friendly(if err.trim().is_empty() { &out } else { &err })),
    }
}

/// Stop a question that is still running.
#[tauri::command]
pub fn ai_cancel(state: tauri::State<'_, AskState>, request: u32) {
    if let Some(child) = state.running.lock().unwrap().get(&request).cloned() {
        state.cancelled.lock().unwrap().push(request);
        let _ = child.lock().unwrap().kill();
    }
}
