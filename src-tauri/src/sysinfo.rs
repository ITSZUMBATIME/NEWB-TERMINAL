// Reads basic facts about your computer (like fastfetch does) so AKIN can show
// them when it opens. Everything here is read-only and fails quietly: if a fact
// can't be found, that line is just left out.

use std::{
    fs,
    io::Read,
    process::{Command, Stdio},
    time::{Duration, Instant},
};

use serde::Serialize;

/// What the window receives: ready-to-show lines (with colour codes), as fastfetch prints them.
#[derive(Serialize)]
pub struct SystemInfo {
    lines: Vec<String>,
    source: String,
}

struct InfoLine {
    label: String,
    value: String,
}

fn line(label: &str, value: String) -> Option<InfoLine> {
    let value = value.trim().to_string();
    if value.is_empty() {
        None
    } else {
        Some(InfoLine {
            label: label.to_string(),
            value,
        })
    }
}

fn read(path: &str) -> String {
    fs::read_to_string(path).unwrap_or_default()
}

fn gib(bytes: f64) -> String {
    format!("{:.1} GiB", bytes / 1024.0 / 1024.0 / 1024.0)
}

fn os_name() -> String {
    for l in read("/etc/os-release").lines() {
        if let Some(v) = l.strip_prefix("PRETTY_NAME=") {
            return v.trim_matches('"').to_string();
        }
    }
    String::new()
}

fn uptime() -> String {
    let secs: u64 = read("/proc/uptime")
        .split_whitespace()
        .next()
        .and_then(|s| s.split('.').next())
        .and_then(|s| s.parse().ok())
        .unwrap_or(0);
    let (d, h, m) = (secs / 86400, (secs % 86400) / 3600, (secs % 3600) / 60);
    let mut parts = Vec::new();
    if d > 0 {
        parts.push(format!("{d} day{}", if d == 1 { "" } else { "s" }));
    }
    if h > 0 {
        parts.push(format!("{h} hour{}", if h == 1 { "" } else { "s" }));
    }
    parts.push(format!("{m} min{}", if m == 1 { "" } else { "s" }));
    parts.join(", ")
}

fn cpu() -> String {
    let info = read("/proc/cpuinfo");
    let threads = info.lines().filter(|l| l.starts_with("processor")).count();
    let name = info
        .lines()
        .find(|l| l.starts_with("model name"))
        .and_then(|l| l.split(':').nth(1))
        .map(|s| s.split_whitespace().collect::<Vec<_>>().join(" "))
        .unwrap_or_default();
    if name.is_empty() {
        String::new()
    } else {
        format!("{name} ({threads})")
    }
}

fn gpus() -> Vec<String> {
    let out = match Command::new("lspci").arg("-mm").output() {
        Ok(o) => String::from_utf8_lossy(&o.stdout).into_owned(),
        Err(_) => return Vec::new(),
    };
    out.lines()
        .filter_map(|l| {
            let f: Vec<&str> = l.split('"').collect();
            let class = f.get(1)?;
            if !(class.contains("VGA") || class.contains("3D") || class.contains("Display")) {
                return None;
            }
            let vendor = f.get(3)?;
            let device = f.get(5)?;
            let vendor = if vendor.contains("AMD") {
                "AMD"
            } else if vendor.contains("NVIDIA") {
                "NVIDIA"
            } else if vendor.contains("Intel") {
                "Intel"
            } else {
                vendor
            };
            // Devices are often written "Chip name [Marketing name]": prefer the bracket.
            let device = match (device.rfind('['), device.rfind(']')) {
                (Some(a), Some(b)) if b > a => &device[a + 1..b],
                _ => device,
            };
            Some(format!("{vendor} {device}"))
        })
        .collect()
}

fn memory() -> String {
    let info = read("/proc/meminfo");
    let get = |key: &str| -> f64 {
        info.lines()
            .find(|l| l.starts_with(key))
            .and_then(|l| l.split_whitespace().nth(1))
            .and_then(|v| v.parse::<f64>().ok())
            .unwrap_or(0.0)
            * 1024.0
    };
    let total = get("MemTotal:");
    let avail = get("MemAvailable:");
    if total == 0.0 {
        String::new()
    } else {
        format!("{} / {}", gib(total - avail), gib(total))
    }
}

fn disk() -> String {
    let out = match Command::new("df")
        .args(["-B1", "--output=used,size", "/"])
        .output()
    {
        Ok(o) => String::from_utf8_lossy(&o.stdout).into_owned(),
        Err(_) => return String::new(),
    };
    let nums: Vec<f64> = out
        .lines()
        .nth(1)
        .map(|l| l.split_whitespace().filter_map(|v| v.parse().ok()).collect())
        .unwrap_or_default();
    if nums.len() == 2 {
        format!("{} / {}", gib(nums[0]), gib(nums[1]))
    } else {
        String::new()
    }
}

/// Try the real `fastfetch` first: it knows far more about your system than we do,
/// and it uses your own fastfetch settings. Returns None if it isn't installed.
fn fastfetch_lines() -> Option<Vec<String>> {
    let mut child = Command::new("fastfetch")
        .args(["--logo", "none", "--pipe", "false"])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .ok()?;

    // Never wait forever: if fastfetch hangs, give up and use the built-in info.
    let start = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(_)) => break,
            Ok(None) => {
                if start.elapsed() > Duration::from_secs(4) {
                    let _ = child.kill();
                    return None;
                }
                std::thread::sleep(Duration::from_millis(30));
            }
            Err(_) => return None,
        }
    }

    let mut out = String::new();
    child.stdout.take()?.read_to_string(&mut out).ok()?;

    // Keep colours (ESC [ ... m) but drop every other terminal control code.
    let mut clean = String::with_capacity(out.len());
    let mut chars = out.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '\x1b' && chars.peek() == Some(&'[') {
            let mut seq = String::from("\x1b[");
            chars.next();
            let mut last = ' ';
            for n in chars.by_ref() {
                seq.push(n);
                last = n;
                if n.is_ascii_alphabetic() || n == '~' {
                    break;
                }
            }
            if last == 'm' {
                clean.push_str(&seq);
            }
        } else if c != '\r' {
            clean.push(c);
        }
    }

    let lines: Vec<String> = clean.lines().map(|l| l.to_string()).collect();
    if lines.iter().filter(|l| l.contains(": ")).count() >= 3 {
        Some(lines)
    } else {
        None
    }
}

/// Smaller built-in version, used when fastfetch isn't installed.
fn builtin_lines() -> Vec<String> {
    let user = std::env::var("USER").unwrap_or_else(|_| "user".into());
    let host = read("/proc/sys/kernel/hostname").trim().to_string();
    let shell = std::env::var("SHELL").unwrap_or_default();
    let shell = shell.rsplit('/').next().unwrap_or("").to_string();
    let desktop = match (
        std::env::var("XDG_CURRENT_DESKTOP"),
        std::env::var("XDG_SESSION_TYPE"),
    ) {
        (Ok(d), Ok(s)) => format!("{d} ({s})"),
        (Ok(d), Err(_)) => d,
        _ => String::new(),
    };

    let mut items: Vec<InfoLine> = Vec::new();
    items.extend(line("OS", os_name()));
    items.extend(line("Kernel", read("/proc/sys/kernel/osrelease")));
    items.extend(line("Uptime", uptime()));
    items.extend(line("Shell", shell));
    items.extend(line("Desktop", desktop));
    items.extend(line("Terminal", format!("AKIN {}", env!("CARGO_PKG_VERSION"))));
    items.extend(line("CPU", cpu()));
    for (i, g) in gpus().into_iter().enumerate() {
        items.extend(line(&format!("GPU {}", i + 1), g));
    }
    items.extend(line("Memory", memory()));
    items.extend(line("Disk (/)", disk()));

    let mut lines = vec![
        format!("\x1b[1m{user}\x1b[0m@\x1b[1m{host}\x1b[0m"),
        "-".repeat(user.len() + 1 + host.len()),
    ];
    for i in items {
        lines.push(format!("\x1b[1;34m{}\x1b[0m: {}", i.label, i.value));
    }
    lines
}

fn gather() -> SystemInfo {
    match fastfetch_lines() {
        Some(lines) => SystemInfo {
            lines,
            source: "fastfetch".into(),
        },
        None => SystemInfo {
            lines: builtin_lines(),
            source: "builtin".into(),
        },
    }
}

// `async` keeps the window responsive while we wait for fastfetch.
#[tauri::command]
pub async fn system_info() -> SystemInfo {
    tauri::async_runtime::spawn_blocking(gather)
        .await
        .unwrap_or(SystemInfo {
            lines: Vec::new(),
            source: "none".into(),
        })
}
