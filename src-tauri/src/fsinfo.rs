// Folder browsing for the file explorer panel. Read-only: NEWB only looks, it never changes files here.

use std::{cmp::Ordering, fs, path::Path};

use serde::Serialize;

#[derive(Serialize)]
pub struct DirEntry {
    name: String,
    is_dir: bool,
    is_link: bool,
    hidden: bool,
}

#[derive(Serialize)]
pub struct DirListing {
    entries: Vec<DirEntry>,
    /// True if the folder had more items than we show (very large folders).
    truncated: bool,
}

const MAX_ENTRIES: usize = 2000;

fn list(path: &str, show_hidden: bool) -> Result<DirListing, String> {
    let rd = fs::read_dir(Path::new(path)).map_err(|e| e.to_string())?;
    let mut entries: Vec<DirEntry> = Vec::new();
    let mut truncated = false;

    for item in rd.flatten() {
        let name = item.file_name().to_string_lossy().into_owned();
        let hidden = name.starts_with('.');
        if hidden && !show_hidden {
            continue;
        }
        if entries.len() >= MAX_ENTRIES {
            truncated = true;
            break;
        }
        let ft = match item.file_type() {
            Ok(t) => t,
            Err(_) => continue,
        };
        let is_link = ft.is_symlink();
        // A link to a folder should behave like a folder.
        let is_dir = if is_link {
            fs::metadata(item.path()).map(|m| m.is_dir()).unwrap_or(false)
        } else {
            ft.is_dir()
        };
        entries.push(DirEntry {
            name,
            is_dir,
            is_link,
            hidden,
        });
    }

    // Folders first, then files, each A to Z ignoring capitals.
    entries.sort_by(|a, b| match (a.is_dir, b.is_dir) {
        (true, false) => Ordering::Less,
        (false, true) => Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    });

    Ok(DirListing { entries, truncated })
}

/// List what's inside a folder.
#[tauri::command]
pub async fn list_dir(path: String, show_hidden: bool) -> Result<DirListing, String> {
    tauri::async_runtime::spawn_blocking(move || list(&path, show_hidden))
        .await
        .map_err(|e| e.to_string())?
}

/// The user's home folder.
#[tauri::command]
pub fn home_dir() -> String {
    std::env::var("HOME").unwrap_or_else(|_| "/".to_string())
}
