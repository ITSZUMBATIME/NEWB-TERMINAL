// Fonts you add yourself, for the logo. Drop a font file (.ttf, .otf, .woff or .woff2) into
//
//   ~/.config/newb/fonts
//
// and NEWB can draw the logo with it. Some fonts (like FT Vortex) are free for personal use only,
// so NEWB can't ship them. Keeping your own copy here is how you use them.

use std::{
    collections::hash_map::DefaultHasher,
    fs,
    hash::{Hash, Hasher},
    path::PathBuf,
    time::UNIX_EPOCH,
};

use serde::Serialize;

const EXTENSIONS: [&str; 4] = ["ttf", "otf", "woff", "woff2"];
/// A font bigger than this is not what we want here.
const MAX_FONT_BYTES: u64 = 8 * 1024 * 1024;
const MAX_FONTS: usize = 40;

#[derive(Serialize)]
pub struct FontFile {
    /// The file name without its ending, like "ft-vortex-font".
    name: String,
    /// The font itself, as base64 text (the page turns it back into a font).
    data: String,
}

#[derive(Serialize)]
pub struct FontScan {
    /// Where the fonts live.
    dir: String,
    /// Changes whenever the folder changes.
    stamp: String,
    /// The fonts. Left out when `stamp` matches what the page already has.
    fonts: Option<Vec<FontFile>>,
}

const B64: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

fn base64(bytes: &[u8]) -> String {
    let mut out = String::with_capacity(bytes.len() / 3 * 4 + 4);
    for chunk in bytes.chunks(3) {
        let n = (u32::from(chunk[0]) << 16)
            | (u32::from(*chunk.get(1).unwrap_or(&0)) << 8)
            | u32::from(*chunk.get(2).unwrap_or(&0));
        out.push(B64[(n >> 18) as usize & 63] as char);
        out.push(B64[(n >> 12) as usize & 63] as char);
        out.push(if chunk.len() > 1 { B64[(n >> 6) as usize & 63] as char } else { '=' });
        out.push(if chunk.len() > 2 { B64[n as usize & 63] as char } else { '=' });
    }
    out
}

fn font_files(dir: &PathBuf) -> Vec<(String, PathBuf, u64, u128)> {
    let mut out = Vec::new();
    if let Ok(read) = fs::read_dir(dir) {
        for entry in read.flatten() {
            let path = entry.path();
            let Some(ext) = path.extension().and_then(|e| e.to_str()).map(|e| e.to_lowercase()) else { continue };
            if !EXTENSIONS.contains(&ext.as_str()) {
                continue;
            }
            let Ok(meta) = fs::metadata(&path) else { continue };
            if !meta.is_file() || meta.len() > MAX_FONT_BYTES {
                continue;
            }
            let Some(stem) = path.file_stem().and_then(|s| s.to_str()).map(str::to_string) else { continue };
            if stem.starts_with('.') {
                continue;
            }
            let modified = meta
                .modified()
                .ok()
                .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                .map(|d| d.as_nanos())
                .unwrap_or(0);
            out.push((stem, path, meta.len(), modified));
        }
    }
    out.sort_by(|a, b| a.0.to_lowercase().cmp(&b.0.to_lowercase()));
    out.truncate(MAX_FONTS);
    out
}

/// Look in the fonts folder. Pass the `stamp` you got last time: if nothing changed, `fonts`
/// comes back empty and nothing is read.
#[tauri::command]
pub async fn scan_fonts(since: Option<String>) -> Result<FontScan, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let dir = crate::themes::config_subdir("fonts")?;
        let files = font_files(&dir);
        let mut h = DefaultHasher::new();
        for (stem, _, len, modified) in &files {
            stem.hash(&mut h);
            len.hash(&mut h);
            modified.hash(&mut h);
        }
        let stamp = format!("{:x}", h.finish());
        let fonts = if since.as_deref() == Some(stamp.as_str()) {
            None
        } else {
            let mut list = Vec::new();
            for (stem, path, _, _) in files {
                if let Ok(bytes) = fs::read(&path) {
                    list.push(FontFile { name: stem, data: base64(&bytes) });
                }
            }
            Some(list)
        };
        Ok(FontScan { dir: dir.to_string_lossy().into_owned(), stamp, fonts })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::base64;

    #[test]
    fn base64_matches_the_standard_examples() {
        assert_eq!(base64(b""), "");
        assert_eq!(base64(b"f"), "Zg==");
        assert_eq!(base64(b"fo"), "Zm8=");
        assert_eq!(base64(b"foo"), "Zm9v");
        assert_eq!(base64(b"foob"), "Zm9vYg==");
        assert_eq!(base64(b"fooba"), "Zm9vYmE=");
        assert_eq!(base64(b"foobar"), "Zm9vYmFy");
    }
}
