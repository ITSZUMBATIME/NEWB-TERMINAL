// Reads basic facts about your computer (like fastfetch does) so AKIN can show
// them when it opens. Everything here is read-only and fails quietly: if a fact
// can't be found, that line is just left out.

use std::{fs, process::Command};

use serde::Serialize;

#[derive(Serialize)]
pub struct InfoLine {
    label: String,
    value: String,
}

#[derive(Serialize)]
pub struct SystemInfo {
    user: String,
    host: String,
    lines: Vec<InfoLine>,
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

#[tauri::command]
pub fn system_info() -> SystemInfo {
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

    let mut lines: Vec<InfoLine> = Vec::new();
    lines.extend(line("OS", os_name()));
    lines.extend(line("Kernel", read("/proc/sys/kernel/osrelease")));
    lines.extend(line("Uptime", uptime()));
    lines.extend(line("Shell", shell));
    lines.extend(line("Desktop", desktop));
    lines.extend(line("Terminal", format!("AKIN {}", env!("CARGO_PKG_VERSION"))));
    lines.extend(line("CPU", cpu()));
    for (i, g) in gpus().into_iter().enumerate() {
        lines.extend(line(&format!("GPU {}", i + 1), g));
    }
    lines.extend(line("Memory", memory()));
    lines.extend(line("Disk (/)", disk()));

    SystemInfo { user, host, lines }
}
