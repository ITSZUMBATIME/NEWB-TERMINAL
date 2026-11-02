// Project and file helpers for the Repos tab and the editor.
// Reading is always safe. Writing only happens when you press Save in the editor.

use std::{
    fs,
    path::Path,
    process::Command,
};

use serde::Serialize;

/// Bigger files are not opened in the editor.
const MAX_FILE_BYTES: u64 = 2 * 1024 * 1024;

#[derive(Serialize)]
pub struct TextFile {
    text: String,
    size: u64,
}

fn read_text(path: &str) -> Result<TextFile, String> {
    let meta = fs::metadata(path).map_err(|e| e.to_string())?;
    if meta.is_dir() {
        return Err("That is a folder, not a file.".to_string());
    }
    if meta.len() > MAX_FILE_BYTES {
        return Err(format!(
            "That file is too big to edit here ({:.1} MB).",
            meta.len() as f64 / 1_048_576.0
        ));
    }
    let bytes = fs::read(path).map_err(|e| e.to_string())?;
    if bytes.iter().take(8000).any(|b| *b == 0) {
        return Err("That looks like a program or a picture, not text, so it can't be edited here.".to_string());
    }
    let text = String::from_utf8(bytes)
        .map_err(|_| "That file isn't plain UTF-8 text, so it can't be edited here.".to_string())?;
    Ok(TextFile { text, size: meta.len() })
}

/// Read a text file for the editor.
#[tauri::command]
pub async fn read_text_file(path: String) -> Result<TextFile, String> {
    tauri::async_runtime::spawn_blocking(move || read_text(&path))
        .await
        .map_err(|e| e.to_string())?
}

/// Save a text file (only called when you press Save).
#[tauri::command]
pub async fn write_text_file(path: String, text: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let p = Path::new(&path);
        if p.is_dir() {
            return Err("That is a folder, not a file.".to_string());
        }
        fs::write(p, text).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

/* ---------- Finding projects ---------- */

#[derive(Serialize)]
pub struct RepoInfo {
    path: String,
    name: String,
}

fn scan(dir: &Path, levels_below: u32, out: &mut Vec<RepoInfo>) {
    if out.len() >= 300 {
        return;
    }
    if dir.join(".git").exists() {
        let name = dir
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_else(|| dir.to_string_lossy().into_owned());
        out.push(RepoInfo {
            path: dir.to_string_lossy().into_owned(),
            name,
        });
        return; // a project inside a project is not listed separately
    }
    if levels_below == 0 {
        return;
    }
    let Ok(rd) = fs::read_dir(dir) else { return };
    for item in rd.flatten() {
        let name = item.file_name().to_string_lossy().into_owned();
        if name.starts_with('.') || name == "node_modules" || name == "target" {
            continue;
        }
        if item.file_type().map(|t| t.is_dir()).unwrap_or(false) {
            scan(&item.path(), levels_below - 1, out);
        }
    }
}

/// Find git projects inside the given folders (the folder itself, or up to two levels below).
#[tauri::command]
pub async fn find_repos(roots: Vec<String>) -> Vec<RepoInfo> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut found: Vec<RepoInfo> = Vec::new();
        for root in roots {
            scan(Path::new(&root), 2, &mut found);
        }
        found.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
        found.dedup_by(|a, b| a.path == b.path);
        found
    })
    .await
    .unwrap_or_default()
}

/* ---------- Git status ---------- */

#[derive(Serialize)]
pub struct GitChange {
    /// Relative to the project folder. Ends with "/" for a whole new folder.
    path: String,
    /// M changed, A added, D deleted, R renamed, U new (untracked), ! conflict.
    code: String,
}

#[derive(Serialize)]
pub struct GitSummary {
    branch: String,
    ahead: u32,
    behind: u32,
    changes: Vec<GitChange>,
}

fn git(path: &str, args: &[&str]) -> Result<String, String> {
    let out = Command::new("git")
        .arg("-C")
        .arg(path)
        .args(args)
        .env("GIT_OPTIONAL_LOCKS", "0") // looking must never change anything
        .output()
        .map_err(|e| {
            if e.kind() == std::io::ErrorKind::NotFound {
                "git isn't installed".to_string()
            } else {
                e.to_string()
            }
        })?;
    if !out.status.success() {
        return Err(String::from_utf8_lossy(&out.stderr).trim().to_string());
    }
    Ok(String::from_utf8_lossy(&out.stdout).into_owned())
}

fn summary(path: &str) -> Result<GitSummary, String> {
    let branch = match git(path, &["symbolic-ref", "--short", "-q", "HEAD"]) {
        Ok(b) if !b.trim().is_empty() => b.trim().to_string(),
        _ => match git(path, &["rev-parse", "--short", "HEAD"]) {
            Ok(sha) => format!("detached at {}", sha.trim()),
            Err(e) => return Err(e),
        },
    };

    // "behind<TAB>ahead" compared with the branch it follows, if any.
    let (mut ahead, mut behind) = (0u32, 0u32);
    if let Ok(counts) = git(path, &["rev-list", "--left-right", "--count", "@{upstream}...HEAD"]) {
        let mut it = counts.split_whitespace();
        behind = it.next().and_then(|n| n.parse().ok()).unwrap_or(0);
        ahead = it.next().and_then(|n| n.parse().ok()).unwrap_or(0);
    }

    let mut changes = Vec::new();
    let status = git(path, &["status", "--porcelain=v1", "-z"]).unwrap_or_default();
    let mut parts = status.split('\0');
    while let Some(entry) = parts.next() {
        if entry.len() < 4 {
            continue;
        }
        let xy = &entry[..2];
        let file = entry[3..].to_string();
        let (x, y) = (xy.as_bytes()[0] as char, xy.as_bytes()[1] as char);
        if x == 'R' || x == 'C' || y == 'R' || y == 'C' {
            parts.next(); // the old name follows; we only show the new one
        }
        let code = if xy == "??" {
            "U"
        } else if x == 'U' || y == 'U' || xy == "AA" || xy == "DD" {
            "!"
        } else {
            let c = if y != ' ' { y } else { x };
            match c {
                'M' => "M",
                'A' | 'C' => "A",
                'D' => "D",
                'R' => "R",
                _ => "M",
            }
        };
        changes.push(GitChange {
            path: file,
            code: code.to_string(),
        });
    }

    Ok(GitSummary {
        branch,
        ahead,
        behind,
        changes,
    })
}

/// Branch, how far ahead or behind, and which files changed, for one project.
#[tauri::command]
pub async fn git_summary(path: String) -> Result<GitSummary, String> {
    tauri::async_runtime::spawn_blocking(move || summary(&path))
        .await
        .map_err(|e| e.to_string())?
}

/* ---------- Making, renaming and deleting (from the right-click menu in Files and Repos) ---------- */

fn check_name(name: &str) -> Result<(), String> {
    if name.is_empty() || name == "." || name == ".." {
        return Err("Type a name first.".to_string());
    }
    if name.contains('/') {
        return Err("A name can't contain a slash (/).".to_string());
    }
    Ok(())
}

/// Make a new empty file inside `dir`. Returns its full path. Never replaces an existing file.
#[tauri::command]
pub async fn create_file(dir: String, name: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        check_name(&name)?;
        let path = Path::new(&dir).join(&name);
        if path.exists() {
            return Err(format!("\"{name}\" already exists here."));
        }
        fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&path)
            .map_err(|e| e.to_string())?;
        Ok(path.to_string_lossy().into_owned())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Make a new folder inside `dir`. Returns its full path.
#[tauri::command]
pub async fn create_folder(dir: String, name: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        check_name(&name)?;
        let path = Path::new(&dir).join(&name);
        if path.exists() {
            return Err(format!("\"{name}\" already exists here."));
        }
        fs::create_dir(&path).map_err(|e| e.to_string())?;
        Ok(path.to_string_lossy().into_owned())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Rename a file or folder (it stays in the same folder). Returns the new full path.
#[tauri::command]
pub async fn rename_path(path: String, new_name: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        check_name(&new_name)?;
        let from = Path::new(&path);
        let parent = from.parent().ok_or_else(|| "Can't rename that.".to_string())?;
        let to = parent.join(&new_name);
        if to.exists() {
            return Err(format!("\"{new_name}\" already exists here."));
        }
        fs::rename(from, &to).map_err(|e| e.to_string())?;
        Ok(to.to_string_lossy().into_owned())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Move a file or folder to the trash (it can be put back from there). Nothing is deleted for good.
#[tauri::command]
pub async fn trash_path(path: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        if !Path::new(&path).exists() {
            return Err("That is already gone.".to_string());
        }
        trash::delete(&path).map_err(|e| format!("Couldn't move it to the trash: {e}"))
    })
    .await
    .map_err(|e| e.to_string())?
}
