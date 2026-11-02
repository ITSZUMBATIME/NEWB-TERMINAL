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
    /// There is at least one remote (like GitHub) to push to.
    has_remote: bool,
    /// This branch already follows a branch on the remote.
    has_upstream: bool,
    changes: Vec<GitChange>,
}

fn run_git(path: &str, args: &[&str], network: bool) -> Result<String, String> {
    let mut cmd = Command::new("git");
    cmd.arg("-C")
        .arg(path)
        .args(args)
        .env("GIT_OPTIONAL_LOCKS", "0") // looking must never change anything
        .env("GIT_TERMINAL_PROMPT", "0"); // never sit waiting for a password nobody can type
    if network {
        // no passphrase prompts either (keys held by an agent still work)
        cmd.env("GIT_SSH_COMMAND", "ssh -o BatchMode=yes");
    }
    let out = cmd.output().map_err(|e| {
        if e.kind() == std::io::ErrorKind::NotFound {
            "git isn't installed".to_string()
        } else {
            e.to_string()
        }
    })?;
    if !out.status.success() {
        let err = String::from_utf8_lossy(&out.stderr).trim().to_string();
        // some git messages ("nothing to commit") come out on stdout
        return Err(if err.is_empty() { String::from_utf8_lossy(&out.stdout).trim().to_string() } else { err });
    }
    Ok(String::from_utf8_lossy(&out.stdout).into_owned())
}

fn git(path: &str, args: &[&str]) -> Result<String, String> {
    run_git(path, args, false)
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

    let has_remote = git(path, &["remote"]).map(|r| !r.trim().is_empty()).unwrap_or(false);
    let has_upstream = git(path, &["rev-parse", "--abbrev-ref", "@{upstream}"]).is_ok();

    Ok(GitSummary {
        branch,
        ahead,
        behind,
        has_remote,
        has_upstream,
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

/* ---------- Git actions (the buttons in the Repos tab) ---------- */

/// Commit exactly these files with this message. New and deleted files are included.
#[tauri::command]
pub async fn git_commit(path: String, files: Vec<String>, message: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        if message.trim().is_empty() {
            return Err("Write a short message first.".to_string());
        }
        if files.is_empty() {
            return Err("Tick at least one file.".to_string());
        }
        let mut add: Vec<&str> = vec!["add", "-A", "--"];
        add.extend(files.iter().map(String::as_str));
        git(&path, &add)?;
        let mut commit: Vec<&str> = vec!["commit", "-m", message.trim(), "--"];
        commit.extend(files.iter().map(String::as_str));
        let out = git(&path, &commit)?;
        Ok(out.lines().next().unwrap_or("").to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// fetch, pull (only if it can simply catch up), push, or publish (first push of a new branch).
#[tauri::command]
pub async fn git_sync(path: String, action: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let out = match action.as_str() {
            "fetch" => run_git(&path, &["fetch"], true)?,
            "pull" => run_git(&path, &["pull", "--ff-only"], true)?,
            "push" => run_git(&path, &["push"], true)?,
            "publish" => {
                let remote = git(&path, &["remote"])?
                    .lines()
                    .next()
                    .unwrap_or("origin")
                    .to_string();
                run_git(&path, &["push", "-u", &remote, "HEAD"], true)?
            }
            _ => return Err("Unknown action.".to_string()),
        };
        Ok(out.lines().next().unwrap_or("").to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

/* ---------- Search across a project ---------- */

#[derive(Serialize)]
pub struct SearchHit {
    line: u32,
    /// Column of the first match in the full line (0 is the start).
    col: u32,
    /// The line, without leading spaces, cut to a sensible length.
    text: String,
    /// Where the matches are inside `text`, as [start, end] pairs.
    ranges: Vec<[u32; 2]>,
}

#[derive(Serialize)]
pub struct SearchFile {
    /// Relative to the folder that was searched.
    path: String,
    hits: Vec<SearchHit>,
}

#[derive(Serialize)]
pub struct SearchResult {
    files: Vec<SearchFile>,
    total: u32,
    /// True if we stopped early because there were too many matches.
    truncated: bool,
}

const MAX_HITS: u32 = 500;
const MAX_LINE_CHARS: usize = 240;

fn search(root: &str, query: &str, match_case: bool, whole_word: bool, use_regex: bool) -> Result<SearchResult, String> {
    let mut result = SearchResult { files: Vec::new(), total: 0, truncated: false };
    if query.is_empty() {
        return Ok(result);
    }
    let mut pattern = if use_regex { query.to_string() } else { regex::escape(query) };
    if whole_word {
        pattern = format!(r"\b(?:{pattern})\b");
    }
    let re = regex::RegexBuilder::new(&pattern)
        .case_insensitive(!match_case)
        .build()
        .map_err(|e| format!("That isn't a valid pattern: {}", e.to_string().lines().last().unwrap_or("").trim()))?;

    let walker = ignore::WalkBuilder::new(root)
        .hidden(true) // skip hidden files and folders such as .git
        .git_ignore(true) // and anything the project's .gitignore lists
        .max_filesize(Some(1024 * 1024))
        .filter_entry(|e| e.file_name() != "node_modules" && e.file_name() != "target")
        .build();

    for entry in walker.flatten() {
        if !entry.file_type().map(|t| t.is_file()).unwrap_or(false) {
            continue;
        }
        let Ok(bytes) = fs::read(entry.path()) else { continue };
        if bytes.iter().take(8000).any(|b| *b == 0) {
            continue; // not text
        }
        let Ok(text) = String::from_utf8(bytes) else { continue };

        let mut hits: Vec<SearchHit> = Vec::new();
        for (i, line) in text.lines().enumerate() {
            let found: Vec<(usize, usize)> = re.find_iter(line).map(|m| (m.start(), m.end())).collect();
            if found.is_empty() {
                continue;
            }
            let lead = line.len() - line.trim_start().len();
            let lead_chars = line[..lead].chars().count();
            let shown: String = line[lead..].chars().take(MAX_LINE_CHARS).collect();
            let shown_len = shown.chars().count();
            let ranges: Vec<[u32; 2]> = found
                .iter()
                .filter_map(|&(s, e)| {
                    let s = line[..s].chars().count().saturating_sub(lead_chars);
                    let e = line[..e].chars().count().saturating_sub(lead_chars);
                    if s >= shown_len { None } else { Some([s as u32, e.min(shown_len) as u32]) }
                })
                .collect();
            hits.push(SearchHit {
                line: (i + 1) as u32,
                col: line[..found[0].0].chars().count() as u32,
                text: shown,
                ranges,
            });
            result.total += 1;
            if result.total >= MAX_HITS {
                result.truncated = true;
                break;
            }
        }
        if !hits.is_empty() {
            let rel = entry.path().strip_prefix(root).unwrap_or(entry.path());
            result.files.push(SearchFile { path: rel.to_string_lossy().into_owned(), hits });
        }
        if result.truncated {
            break;
        }
    }
    result.files.sort_by(|a, b| a.path.to_lowercase().cmp(&b.path.to_lowercase()));
    Ok(result)
}

/// Find text in the files of one folder (a project). Skips hidden files, .gitignore'd files and binaries.
#[tauri::command]
pub async fn search_project(root: String, query: String, match_case: bool, whole_word: bool, use_regex: bool) -> Result<SearchResult, String> {
    tauri::async_runtime::spawn_blocking(move || search(&root, &query, match_case, whole_word, use_regex))
        .await
        .map_err(|e| e.to_string())?
}
