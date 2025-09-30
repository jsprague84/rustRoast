// Topic layout helpers and constants matching ESP32 firmware

pub const ROOT: &str = "roaster";

// Device-scoped topics
pub fn telemetry_topic(device_id: &str) -> String {
    format!("{}/{}/telemetry", ROOT, device_id)
}

pub fn status_topic(device_id: &str) -> String {
    format!("{}/{}/status", ROOT, device_id)
}

pub fn control_root(device_id: &str) -> String {
    format!("{}/{}/control", ROOT, device_id)
}

pub fn control_setpoint(device_id: &str) -> String { format!("{}/setpoint", control_root(device_id)) }
pub fn control_fan_pwm(device_id: &str) -> String { format!("{}/fan_pwm", control_root(device_id)) }
pub fn control_heater_pwm(device_id: &str) -> String { format!("{}/heater_pwm", control_root(device_id)) }
pub fn control_mode(device_id: &str) -> String { format!("{}/mode", control_root(device_id)) }
pub fn control_heater_enable(device_id: &str) -> String { format!("{}/heater_enable", control_root(device_id)) }
pub fn control_pid(device_id: &str) -> String { format!("{}/pid", control_root(device_id)) }
pub fn control_emergency_stop(device_id: &str) -> String { format!("{}/emergency_stop", control_root(device_id)) }

// Auto-tune topics
pub fn autotune_status(device_id: &str) -> String { format!("{}/{}/autotune/status", ROOT, device_id) }
pub fn autotune_start(device_id: &str) -> String { format!("{}/{}/autotune/start", ROOT, device_id) }
pub fn autotune_stop(device_id: &str) -> String { format!("{}/{}/autotune/stop", ROOT, device_id) }
pub fn autotune_apply(device_id: &str) -> String { format!("{}/{}/autotune/apply", ROOT, device_id) }
pub fn autotune_results(device_id: &str) -> String { format!("{}/{}/autotune/results", ROOT, device_id) }

// Wildcards
pub fn telemetry_wildcard_all() -> &'static str { "roaster/+/telemetry" }
pub fn status_wildcard_all() -> &'static str { "roaster/+/status" }
pub fn control_wildcard(device_id: &str) -> String { format!("{}/#", control_root(device_id)) }
pub fn autotune_wildcard_all() -> &'static str { "roaster/+/autotune/#" }
