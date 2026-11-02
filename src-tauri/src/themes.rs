// Your own colour themes, kept as plain folders (the same idea as Omarchy's themes):
//
//   ~/.config/newb/themes/<name>/colors.toml
//
// This file only finds and fetches them. Reading the colours and recolouring the window happens
// in the page. Nothing in a theme is ever run: we read a few known text files and ignore the rest.

use std::{
    collections::{hash_map::DefaultHasher, HashMap},
    fs,
    hash::{Hash, Hasher},
    path::{Path, PathBuf},
    process::{Command, Stdio},
    thread,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

use serde::Serialize;

/// The only files we ever read from a theme folder. Colours can come from any of them.
const FILES: [&str; 5] = ["colors.toml", "light.mode", "alacritty.toml", "kitty.conf", "ghostty.conf"];
/// A colour file bigger than this is not a colour file.
const MAX_FILE_BYTES: u64 = 64 * 1024;
const MAX_THEMES: usize = 300;
/// A download that takes longer than this is given up on.
const CLONE_SECONDS: u64 = 60;

#[derive(Serialize)]
pub struct ThemeFolder {
    /// The folder's name, which is also the theme's id.
    name: String,
    /// Full path of the folder.
    path: String,
    /// The text of each known file that exists (light.mode is just a marker, so its text is empty).
    files: HashMap<String, String>,
}

#[derive(Serialize)]
pub struct ThemeScan {
    /// Where the themes live.
    dir: String,
    /// Changes whenever anything in the folder changes.
    stamp: String,
    /// The themes. Left out when `stamp` matches what the page already has.
    themes: Option<Vec<ThemeFolder>>,
}

/// A folder inside ~/.config/newb (made if it isn't there yet).
pub fn config_subdir(name: &str) -> Result<PathBuf, String> {
    let base = match std::env::var_os("XDG_CONFIG_HOME") {
        Some(v) if !v.is_empty() => PathBuf::from(v),
        _ => {
            let home = std::env::var_os("HOME").ok_or_else(|| "Can't find your home folder.".to_string())?;
            PathBuf::from(home).join(".config")
        }
    };
    let dir = base.join("newb").join(name);
    fs::create_dir_all(&dir).map_err(|e| format!("Can't make the {name} folder: {e}"))?;
    Ok(dir)
}

fn themes_dir() -> Result<PathBuf, String> {
    config_subdir("themes")
}

fn theme_folders(dir: &Path) -> Vec<(String, PathBuf)> {
    let mut out = Vec::new();
    if let Ok(read) = fs::read_dir(dir) {
        for entry in read.flatten() {
            let name = entry.file_name().to_string_lossy().into_owned();
            if name.starts_with('.') {
                continue;
            }
            // follows links, so a theme folder can be a link to somewhere else
            if fs::metadata(entry.path()).map(|m| m.is_dir()).unwrap_or(false) {
                out.push((name, entry.path()));
            }
        }
    }
    out.sort_by(|a, b| a.0.to_lowercase().cmp(&b.0.to_lowercase()));
    out.truncate(MAX_THEMES);
    out
}

fn stamp_of(folders: &[(String, PathBuf)]) -> String {
    let mut h = DefaultHasher::new();
    for (name, path) in folders {
        name.hash(&mut h);
        for file in FILES {
            if let Ok(meta) = fs::metadata(path.join(file)) {
                file.hash(&mut h);
                meta.len().hash(&mut h);
                if let Ok(t) = meta.modified() {
                    t.duration_since(UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0).hash(&mut h);
                }
            }
        }
    }
    format!("{:x}", h.finish())
}

fn read_folder(name: String, path: PathBuf) -> ThemeFolder {
    let mut files = HashMap::new();
    for file in FILES {
        let p = path.join(file);
        let Ok(meta) = fs::metadata(&p) else { continue };
        if !meta.is_file() || meta.len() > MAX_FILE_BYTES {
            continue;
        }
        if file == "light.mode" {
            files.insert(file.to_string(), String::new());
        } else if let Ok(bytes) = fs::read(&p) {
            files.insert(file.to_string(), String::from_utf8_lossy(&bytes).into_owned());
        }
    }
    ThemeFolder { name, path: path.to_string_lossy().into_owned(), files }
}

/// Look in the themes folder. Pass the `stamp` you got last time: if nothing changed, `themes`
/// comes back empty and nothing is read, so asking often is cheap.
#[tauri::command]
pub async fn scan_themes(since: Option<String>) -> Result<ThemeScan, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let dir = themes_dir()?;
        let folders = theme_folders(&dir);
        let stamp = stamp_of(&folders);
        let themes = if since.as_deref() == Some(stamp.as_str()) {
            None
        } else {
            Some(folders.into_iter().map(|(n, p)| read_folder(n, p)).collect())
        };
        Ok(ThemeScan { dir: dir.to_string_lossy().into_owned(), stamp, themes })
    })
    .await
    .map_err(|e| e.to_string())?
}

/* ---------- Adding a theme from a Git address ---------- */

/// "https://github.com/someone/omarchy-tokyo-night-theme.git" becomes "tokyo-night".
fn folder_name_for(url: &str) -> String {
    let trimmed = url.trim_end_matches('/');
    let last = trimmed.rsplit(|c| c == '/' || c == ':').next().unwrap_or("theme");
    let last = last.strip_suffix(".git").unwrap_or(last);
    let last = last.strip_prefix("omarchy-").unwrap_or(last);
    let last = last.strip_suffix("-theme").unwrap_or(last);
    let cleaned: String = last
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.' { c } else { '-' })
        .collect();
    let cleaned = cleaned.trim_matches(|c| c == '-' || c == '.').to_string();
    if cleaned.is_empty() { "theme".to_string() } else { cleaned }
}

fn friendly_git_error(raw: &str) -> String {
    let low = raw.to_lowercase();
    if low.contains("not found") || low.contains("does not exist") || low.contains("could not read from remote") {
        "Couldn't find that repository. Check the address (and that it's public).".to_string()
    } else if low.contains("could not resolve host") || low.contains("unable to access") || low.contains("network") {
        "Couldn't reach the internet to download that.".to_string()
    } else {
        raw.lines().next().unwrap_or("The download failed.").trim().to_string()
    }
}

fn clone_with_timeout(url: &str, target: &Path) -> Result<(), String> {
    let mut child = Command::new("git")
        .args(["clone", "--depth", "1", "--quiet", "--no-tags", "--", url])
        .arg(target)
        .env("GIT_TERMINAL_PROMPT", "0") // never wait for a password nobody can type
        .env("GIT_SSH_COMMAND", "ssh -o BatchMode=yes")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| {
            if e.kind() == std::io::ErrorKind::NotFound {
                "git isn't installed, so NEWB can't download themes. (You can still copy a theme folder in by hand.)".to_string()
            } else {
                e.to_string()
            }
        })?;
    let started = Instant::now();
    loop {
        match child.try_wait().map_err(|e| e.to_string())? {
            Some(status) => {
                if status.success() {
                    return Ok(());
                }
                let mut err = String::new();
                if let Some(mut s) = child.stderr.take() {
                    use std::io::Read;
                    let _ = s.read_to_string(&mut err);
                }
                return Err(friendly_git_error(err.trim()));
            }
            None => {
                if started.elapsed() > Duration::from_secs(CLONE_SECONDS) {
                    let _ = child.kill();
                    let _ = child.wait();
                    return Err("That took too long to download, so NEWB stopped.".to_string());
                }
                thread::sleep(Duration::from_millis(100));
            }
        }
    }
}

fn is_regular_file(p: &Path) -> bool {
    // symlink_metadata does not follow links, so a link pointing at a private file is skipped
    fs::symlink_metadata(p).map(|m| m.is_file()).unwrap_or(false)
}

/// Download a theme from Git into the themes folder. Returns the folder name it was saved as.
/// Adding the same address again replaces the old copy, which is how you update a theme.
#[tauri::command]
pub async fn install_theme(url: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let url = url.trim().to_string();
        let ok_start = url.starts_with("https://") || url.starts_with("git@");
        if url.is_empty() || url.len() > 300 || !ok_start || url.chars().any(|c| c.is_whitespace() || c.is_control()) {
            return Err("Paste a web address that starts with https://, like https://github.com/name/theme".to_string());
        }
        let dir = themes_dir()?;
        let name = folder_name_for(&url);

        let nanos = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0);
        let temp = dir.join(format!(".downloading-{}-{nanos}", std::process::id()));
        let result = (|| {
            clone_with_timeout(&url, &temp)?;
            // Keep only the colour files. Anything else in the repository is thrown away unread.
            let has_colours = ["colors.toml", "alacritty.toml", "kitty.conf", "ghostty.conf"].iter().any(|f| is_regular_file(&temp.join(f)));
            if !has_colours {
                return Err("That doesn't look like a theme: it has no colors.toml in it.".to_string());
            }
            let target = dir.join(&name);
            if target.exists() {
                fs::remove_dir_all(&target).map_err(|e| e.to_string())?;
            }
            fs::create_dir_all(&target).map_err(|e| e.to_string())?;
            for file in FILES {
                let from = temp.join(file);
                if is_regular_file(&from) {
                    fs::copy(&from, target.join(file)).map_err(|e| e.to_string())?;
                }
            }
            // a note of where it came from, so you can find it again
            let _ = fs::write(target.join("source.txt"), format!("{url}\n"));
            Ok(name.clone())
        })();
        let _ = fs::remove_dir_all(&temp);
        result
    })
    .await
    .map_err(|e| e.to_string())?
}
