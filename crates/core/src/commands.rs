use serde::{Deserialize, Serialize};

// Initial set of commands. We can evolve this schema.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "value")]
pub enum Command {
    Start,
    Stop,
    SetHeaterPower(u8), // 0..=100
    SetFanSpeed(u8),    // 0..=100
    SetDrumSpeed(u8),   // 0..=100
    SetProfileId(String),
}

