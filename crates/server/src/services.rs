use crate::models::*;
use sqlx::{SqlitePool, Row};
use uuid::Uuid;
use chrono::{DateTime, Utc};
use anyhow::{Result, anyhow};
use serde::{Deserialize, Serialize};

#[derive(Clone)]
pub struct RoastSessionService {
    db: SqlitePool,
}

impl RoastSessionService {
    pub fn new(db: SqlitePool) -> Self {
        Self { db }
    }

    // Session Management
    pub async fn create_session(&self, req: CreateSessionRequest) -> Result<RoastSession> {
        let id = Uuid::new_v4().to_string();
        let now = Utc::now();
        
        let session = sqlx::query_as::<_, RoastSession>(
            r#"
            INSERT INTO roast_sessions (
                id, name, device_id, profile_id, status, start_time, created_at, updated_at,
                bean_origin, bean_variety, green_weight, target_roast_level, 
                notes, ambient_temp, humidity
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            RETURNING *
            "#
        )
        .bind(&id)
        .bind(&req.name)
        .bind(&req.device_id)
        .bind(&req.profile_id)
        .bind(SessionStatus::Planning.to_string())
        .bind(None::<DateTime<Utc>>) // NULL for planning sessions
        .bind(now)
        .bind(now)
        .bind(&req.bean_origin)
        .bind(&req.bean_variety)
        .bind(req.green_weight)
        .bind(&req.target_roast_level)
        .bind(&req.notes)
        .bind(req.ambient_temp)
        .bind(req.humidity)
        .fetch_one(&self.db)
        .await?;

        Ok(session)
    }

    pub async fn list_sessions(&self, device_id: Option<&str>, limit: Option<i32>) -> Result<Vec<RoastSession>> {
        let mut query = "SELECT * FROM roast_sessions".to_string();
        let mut conditions = Vec::new();
        
        if device_id.is_some() {
            conditions.push("device_id = ?");
        }
        
        if !conditions.is_empty() {
            query.push_str(" WHERE ");
            query.push_str(&conditions.join(" AND "));
        }
        
        query.push_str(" ORDER BY created_at DESC");
        
        if let Some(limit) = limit {
            query.push_str(&format!(" LIMIT {}", limit));
        }

        let mut query_builder = sqlx::query_as::<_, RoastSession>(&query);
        
        if let Some(device_id) = device_id {
            query_builder = query_builder.bind(device_id);
        }
        
        let sessions = query_builder.fetch_all(&self.db).await?;
        Ok(sessions)
    }

    pub async fn get_session(&self, id: &str) -> Result<Option<RoastSession>> {
        let session = sqlx::query_as::<_, RoastSession>(
            "SELECT * FROM roast_sessions WHERE id = ?"
        )
        .bind(id)
        .fetch_optional(&self.db)
        .await?;

        Ok(session)
    }

    pub async fn get_session_with_telemetry(&self, id: &str) -> Result<Option<SessionWithTelemetry>> {
        let session = match self.get_session(id).await? {
            Some(s) => s,
            None => return Ok(None),
        };

        let telemetry = self.get_session_telemetry(id).await?;
        let profile = if let Some(profile_id) = &session.profile_id {
            self.get_profile_with_points(profile_id).await?
        } else {
            None
        };

        Ok(Some(SessionWithTelemetry {
            session,
            telemetry,
            profile,
        }))
    }

    pub async fn update_session(&self, id: &str, req: UpdateSessionRequest) -> Result<Option<RoastSession>> {
        // Check if there are any fields to update
        if req.name.is_none() && req.roasted_weight.is_none() && req.notes.is_none() 
           && req.first_crack_time.is_none() && req.development_time_ratio.is_none() {
            return self.get_session(id).await;
        }

        let now = Utc::now();
        
        // Build the update query with specific conditions for each field
        let mut query = "UPDATE roast_sessions SET updated_at = ?".to_string();
        let mut bind_count = 1; // Start with 1 for updated_at
        
        if req.name.is_some() {
            query.push_str(", name = ?");
            bind_count += 1;
        }
        if req.roasted_weight.is_some() {
            query.push_str(", roasted_weight = ?");
            bind_count += 1;
        }
        if req.notes.is_some() {
            query.push_str(", notes = ?");
            bind_count += 1;
        }
        if req.first_crack_time.is_some() {
            query.push_str(", first_crack_time = ?");
            bind_count += 1;
        }
        if req.development_time_ratio.is_some() {
            query.push_str(", development_time_ratio = ?");
            bind_count += 1;
        }
        
        query.push_str(" WHERE id = ? RETURNING *");
        
        // Build the query with conditional binding
        let mut query_builder = sqlx::query_as::<_, RoastSession>(&query).bind(now);
        
        if let Some(ref name) = req.name {
            query_builder = query_builder.bind(name);
        }
        if let Some(roasted_weight) = req.roasted_weight {
            query_builder = query_builder.bind(roasted_weight);
        }
        if let Some(ref notes) = req.notes {
            query_builder = query_builder.bind(notes);
        }
        if let Some(first_crack_time) = req.first_crack_time {
            query_builder = query_builder.bind(first_crack_time);
        }
        if let Some(development_time_ratio) = req.development_time_ratio {
            query_builder = query_builder.bind(development_time_ratio);
        }
        
        query_builder = query_builder.bind(id);
        
        let session = query_builder.fetch_optional(&self.db).await?;
        Ok(session)
    }

    pub async fn start_session(&self, id: &str) -> Result<Option<RoastSession>> {
        let session = sqlx::query_as::<_, RoastSession>(
            r#"
            UPDATE roast_sessions 
            SET status = ?, start_time = ?, updated_at = ?
            WHERE id = ? AND status = ?
            RETURNING *
            "#
        )
        .bind(SessionStatus::Active.to_string())
        .bind(Utc::now())
        .bind(Utc::now())
        .bind(id)
        .bind(SessionStatus::Planning.to_string())
        .fetch_optional(&self.db)
        .await?;

        Ok(session)
    }

    pub async fn pause_session(&self, id: &str) -> Result<Option<RoastSession>> {
        let session = sqlx::query_as::<_, RoastSession>(
            r#"
            UPDATE roast_sessions 
            SET status = ?, updated_at = ?
            WHERE id = ? AND status = ?
            RETURNING *
            "#
        )
        .bind(SessionStatus::Paused.to_string())
        .bind(Utc::now())
        .bind(id)
        .bind(SessionStatus::Active.to_string())
        .fetch_optional(&self.db)
        .await?;

        Ok(session)
    }

    pub async fn resume_session(&self, id: &str) -> Result<Option<RoastSession>> {
        let session = sqlx::query_as::<_, RoastSession>(
            r#"
            UPDATE roast_sessions 
            SET status = ?, updated_at = ?
            WHERE id = ? AND status = ?
            RETURNING *
            "#
        )
        .bind(SessionStatus::Active.to_string())
        .bind(Utc::now())
        .bind(id)
        .bind(SessionStatus::Paused.to_string())
        .fetch_optional(&self.db)
        .await?;

        Ok(session)
    }

    pub async fn complete_session(&self, id: &str) -> Result<Option<RoastSession>> {
        let now = Utc::now();
        
        // Calculate total time and max temperature from telemetry
        let stats = sqlx::query(
            r#"
            SELECT 
                MAX(elapsed_seconds) as total_seconds,
                MAX(bean_temp) as max_temp
            FROM session_telemetry 
            WHERE session_id = ?
            "#
        )
        .bind(id)
        .fetch_optional(&self.db)
        .await?;

        let (total_time_seconds, max_temp) = if let Some(row) = stats {
            let total_seconds: Option<f32> = row.try_get("total_seconds").ok();
            let max_temp: Option<f32> = row.try_get("max_temp").ok();
            (total_seconds.map(|s| s as i32), max_temp)
        } else {
            (None, None)
        };

        let session = sqlx::query_as::<_, RoastSession>(
            r#"
            UPDATE roast_sessions 
            SET status = ?, end_time = ?, updated_at = ?, total_time_seconds = ?, max_temp = ?
            WHERE id = ? AND status IN (?, ?)
            RETURNING *
            "#
        )
        .bind(SessionStatus::Completed.to_string())
        .bind(now)
        .bind(now)
        .bind(total_time_seconds)
        .bind(max_temp)
        .bind(id)
        .bind(SessionStatus::Active.to_string())
        .bind(SessionStatus::Paused.to_string())
        .fetch_optional(&self.db)
        .await?;

        Ok(session)
    }

    pub async fn delete_session(&self, id: &str) -> Result<bool> {
        let result = sqlx::query("DELETE FROM roast_sessions WHERE id = ?")
            .bind(id)
            .execute(&self.db)
            .await?;

        Ok(result.rows_affected() > 0)
    }

    // Telemetry Management
    pub async fn add_telemetry_point(&self, session_id: &str, elapsed_seconds: f32, 
                                    bean_temp: Option<f32>, env_temp: Option<f32>, 
                                    rate_of_rise: Option<f32>, heater_pwm: Option<i32>, 
                                    fan_pwm: Option<i32>, setpoint: Option<f32>) -> Result<()> {
        let id = Uuid::new_v4().to_string();
        
        sqlx::query(
            r#"
            INSERT INTO session_telemetry (
                id, session_id, timestamp, elapsed_seconds, bean_temp, env_temp,
                rate_of_rise, heater_pwm, fan_pwm, setpoint
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            "#
        )
        .bind(id)
        .bind(session_id)
        .bind(Utc::now())
        .bind(elapsed_seconds)
        .bind(bean_temp)
        .bind(env_temp)
        .bind(rate_of_rise)
        .bind(heater_pwm)
        .bind(fan_pwm)
        .bind(setpoint)
        .execute(&self.db)
        .await?;

        Ok(())
    }

    pub async fn get_session_telemetry(&self, session_id: &str) -> Result<Vec<SessionTelemetry>> {
        let telemetry = sqlx::query_as::<_, SessionTelemetry>(
            "SELECT * FROM session_telemetry WHERE session_id = ? ORDER BY elapsed_seconds"
        )
        .bind(session_id)
        .fetch_all(&self.db)
        .await?;

        Ok(telemetry)
    }

    // Profile Management
    pub async fn create_profile(&self, req: CreateProfileRequest) -> Result<ProfileWithPoints> {
        let id = Uuid::new_v4().to_string();
        let now = Utc::now();

        // Insert profile
        let profile = sqlx::query_as::<_, RoastProfile>(
            r#"
            INSERT INTO roast_profiles (
                id, name, description, created_at, updated_at, is_public,
                target_total_time, target_first_crack, target_end_temp,
                preheat_temp, charge_temp
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            RETURNING *
            "#
        )
        .bind(&id)
        .bind(&req.name)
        .bind(&req.description)
        .bind(now)
        .bind(now)
        .bind(false) // Default to private
        .bind(req.target_total_time)
        .bind(req.target_first_crack)
        .bind(req.target_end_temp)
        .bind(req.preheat_temp)
        .bind(req.charge_temp)
        .fetch_one(&self.db)
        .await?;

        // Insert profile points
        let mut points = Vec::new();
        for point_req in req.points {
            let point_id = Uuid::new_v4().to_string();
            let point = sqlx::query_as::<_, ProfilePoint>(
                r#"
                INSERT INTO profile_points (
                    id, profile_id, time_seconds, target_temp, fan_speed, notes, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                RETURNING *
                "#
            )
            .bind(&point_id)
            .bind(&id)
            .bind(point_req.time_seconds)
            .bind(point_req.target_temp)
            .bind(point_req.fan_speed)
            .bind(&point_req.notes)
            .bind(now)
            .fetch_one(&self.db)
            .await?;
            
            points.push(point);
        }

        Ok(ProfileWithPoints { profile, points })
    }

    pub async fn list_profiles(&self, include_private: bool) -> Result<Vec<RoastProfile>> {
        let query = if include_private {
            "SELECT * FROM roast_profiles ORDER BY created_at DESC"
        } else {
            "SELECT * FROM roast_profiles WHERE is_public = 1 ORDER BY created_at DESC"
        };

        let profiles = sqlx::query_as::<_, RoastProfile>(query)
            .fetch_all(&self.db)
            .await?;

        Ok(profiles)
    }

    pub async fn get_profile_with_points(&self, id: &str) -> Result<Option<ProfileWithPoints>> {
        let profile = sqlx::query_as::<_, RoastProfile>(
            "SELECT * FROM roast_profiles WHERE id = ?"
        )
        .bind(id)
        .fetch_optional(&self.db)
        .await?;

        let Some(profile) = profile else {
            return Ok(None);
        };

        let points = sqlx::query_as::<_, ProfilePoint>(
            "SELECT * FROM profile_points WHERE profile_id = ? ORDER BY time_seconds"
        )
        .bind(id)
        .fetch_all(&self.db)
        .await?;

        Ok(Some(ProfileWithPoints { profile, points }))
    }

    pub async fn delete_profile(&self, id: &str) -> Result<bool> {
        let result = sqlx::query("DELETE FROM roast_profiles WHERE id = ?")
            .bind(id)
            .execute(&self.db)
            .await?;

        Ok(result.rows_affected() > 0)
    }

    pub async fn import_artisan_profile(&self, req: ImportArtisanProfileRequest) -> Result<ProfileWithPoints> {
        let parsed = parse_artisan_alog(&req.alog_content)?;
        
        // Create profile from parsed data
        let profile_name = req.name.unwrap_or_else(|| 
            if parsed.title.is_empty() { "Imported Artisan Profile".to_string() } else { parsed.title.clone() }
        );

        // Convert parsed data to profile points
        let mut points = Vec::new();
        for (i, point) in parsed.points.iter().enumerate() {
            points.push(CreateProfilePointRequest {
                time_seconds: point.time as i32,
                target_temp: point.bean_temp,
                fan_speed: None, // Artisan doesn't provide fan speed in the curve
                notes: if i < parsed.events.len() {
                    Some(parsed.events[i].name.clone())
                } else {
                    None
                },
            });
        }

        let create_req = CreateProfileRequest {
            name: profile_name,
            description: Some(format!("Imported from Artisan - Date: {}", parsed.roast_date)),
            target_total_time: Some(parsed.total_time as i32),
            target_first_crack: parsed.events.iter()
                .find(|e| e.event_type == "FCs")
                .map(|e| e.time as i32),
            target_end_temp: parsed.points.last().map(|p| p.bean_temp),
            preheat_temp: None,
            charge_temp: parsed.events.iter()
                .find(|e| e.event_type == "CHARGE")
                .map(|e| e.bean_temp),
            points,
        };

        self.create_profile(create_req).await
    }

    // Utility functions
    pub async fn get_active_session(&self, device_id: &str) -> Result<Option<RoastSession>> {
        let session = sqlx::query_as::<_, RoastSession>(
            r#"
            SELECT * FROM roast_sessions 
            WHERE device_id = ? AND status IN (?, ?)
            ORDER BY start_time DESC
            LIMIT 1
            "#
        )
        .bind(device_id)
        .bind(SessionStatus::Active.to_string())
        .bind(SessionStatus::Paused.to_string())
        .fetch_optional(&self.db)
        .await?;

        Ok(session)
    }

    // Roast Events CRUD operations
    pub async fn create_roast_event(&self, session_id: &str, req: CreateRoastEventRequest) -> Result<RoastEvent> {
        let event_id = Uuid::new_v4().to_string();
        let now = Utc::now();

        let event = sqlx::query_as::<_, RoastEvent>(
            r#"
            INSERT INTO roast_events (id, session_id, event_type, elapsed_seconds, temperature, notes, created_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
            RETURNING *
            "#
        )
        .bind(&event_id)
        .bind(session_id)
        .bind(req.event_type.to_string())
        .bind(req.elapsed_seconds)
        .bind(req.temperature)
        .bind(&req.notes)
        .bind(now)
        .fetch_one(&self.db)
        .await?;

        Ok(event)
    }

    pub async fn get_roast_events(&self, session_id: &str) -> Result<Vec<RoastEvent>> {
        let events = sqlx::query_as::<_, RoastEvent>(
            "SELECT * FROM roast_events WHERE session_id = ?1 ORDER BY elapsed_seconds ASC"
        )
        .bind(session_id)
        .fetch_all(&self.db)
        .await?;

        Ok(events)
    }

    pub async fn update_roast_event(&self, event_id: &str, req: UpdateRoastEventRequest) -> Result<RoastEvent> {
        let mut updates = Vec::new();
        let mut bind_count = 1; // Start with 1 for updated_at

        if req.elapsed_seconds.is_some() {
            updates.push("elapsed_seconds = ?".to_string());
            bind_count += 1;
        }

        if req.temperature.is_some() {
            updates.push("temperature = ?".to_string());
            bind_count += 1;
        }

        if req.notes.is_some() {
            updates.push("notes = ?".to_string());
            bind_count += 1;
        }

        if updates.is_empty() {
            return Err(anyhow::anyhow!("No fields to update"));
        }

        updates.push("updated_at = CURRENT_TIMESTAMP".to_string());

        let query = format!(
            "UPDATE roast_events SET {} WHERE id = ? RETURNING *",
            updates.join(", ")
        );

        let mut query_builder = sqlx::query_as::<_, RoastEvent>(&query);

        // Bind parameters in the same order as they appear in the updates
        if let Some(elapsed_seconds) = req.elapsed_seconds {
            query_builder = query_builder.bind(elapsed_seconds);
        }
        if let Some(temperature) = req.temperature {
            query_builder = query_builder.bind(temperature);
        }
        if let Some(notes) = req.notes {
            query_builder = query_builder.bind(notes);
        }

        // Bind the event_id for the WHERE clause
        query_builder = query_builder.bind(event_id);

        let event = query_builder.fetch_one(&self.db).await?;

        Ok(event)
    }

    pub async fn delete_roast_event(&self, event_id: &str) -> Result<()> {
        let rows_affected = sqlx::query("DELETE FROM roast_events WHERE id = ?1")
            .bind(event_id)
            .execute(&self.db)
            .await?
            .rows_affected();

        if rows_affected == 0 {
            return Err(anyhow::anyhow!("Roast event not found"));
        }

        Ok(())
    }
}

// Artisan Profile Parser
#[derive(Debug, Deserialize, Serialize)]
struct ArtisanProfilePoint {
    time: f64,
    bean_temp: f32,
    env_temp: f32,
}

#[derive(Debug, Deserialize, Serialize)]
struct ArtisanRoastEvent {
    name: String,
    time: f64,
    bean_temp: f32,
    env_temp: f32,
    event_type: String,
}

#[derive(Debug, Deserialize, Serialize)]
struct ParsedArtisanProfile {
    title: String,
    roast_date: String,
    total_time: f64,
    points: Vec<ArtisanProfilePoint>,
    events: Vec<ArtisanRoastEvent>,
}

fn parse_artisan_alog(content: &str) -> Result<ParsedArtisanProfile> {
    // First try to parse as JSON
    let profile_data: serde_json::Value = if let Ok(json) = serde_json::from_str(content) {
        json
    } else {
        // Try to convert Python literals to JSON with more comprehensive replacements
        let json_content = content
            // Basic Python to JSON conversions
            .replace("True", "true")
            .replace("False", "false")
            .replace("None", "null")
            // Handle Python tuples - convert to arrays
            .replace("(", "[")
            .replace(")", "]")
            // Handle Python single quotes
            .replace("'", "\"")
            // Remove Python comments that might interfere
            .lines()
            .filter(|line| !line.trim_start().starts_with('#'))
            .collect::<Vec<_>>()
            .join("\n");
        
        serde_json::from_str(&json_content)
            .map_err(|e| anyhow!("Unable to parse Artisan profile file format: {}", e))?
    };

    // Extract time and temperature arrays
    let timex = profile_data["timex"].as_array().unwrap_or(&vec![]).clone();
    let temp1 = profile_data["temp1"].as_array().unwrap_or(&vec![]).clone(); // Environment temp
    let temp2 = profile_data["temp2"].as_array().unwrap_or(&vec![]).clone(); // Bean temp
    let default_computed = serde_json::Map::new();
    let computed = profile_data["computed"].as_object().unwrap_or(&default_computed);

    // Convert to profile points
    let mut points = Vec::new();
    for (i, time_val) in timex.iter().enumerate() {
        if let Some(time) = time_val.as_f64() {
            let bean_temp = temp2.get(i).and_then(|t| t.as_f64()).unwrap_or(0.0) as f32;
            let env_temp = temp1.get(i).and_then(|t| t.as_f64()).unwrap_or(0.0) as f32;
            points.push(ArtisanProfilePoint {
                time,
                bean_temp,
                env_temp,
            });
        }
    }

    // Extract roast events
    let mut events = Vec::new();
    
    let event_types = vec![
        ("CHARGE", "CHARGE"),
        ("TP", "TP"),
        ("DRY", "DRY"), 
        ("FCs", "FCs"),
        ("FCe", "FCe"),
        ("SCs", "SCs"),
        ("DROP", "DROP"),
    ];

    for (key, event_type) in event_types {
        if let Some(time) = computed.get(&format!("{}_time", key)).and_then(|t| t.as_f64()) {
            let bean_temp = computed.get(&format!("{}_BT", key)).and_then(|t| t.as_f64()).unwrap_or(0.0) as f32;
            let env_temp = computed.get(&format!("{}_ET", key)).and_then(|t| t.as_f64()).unwrap_or(0.0) as f32;
            let name = match event_type {
                "CHARGE" => "Charge",
                "TP" => "Turning Point",
                "DRY" => "Dry End",
                "FCs" => "First Crack Start",
                "FCe" => "First Crack End", 
                "SCs" => "Second Crack Start",
                "DROP" => "Drop",
                _ => event_type,
            }.to_string();
            
            events.push(ArtisanRoastEvent {
                name,
                time,
                bean_temp,
                env_temp,
                event_type: event_type.to_string(),
            });
        }
    }

    let title = profile_data["title"].as_str().unwrap_or("Imported Profile").to_string();
    let roast_date = profile_data["roastdate"].as_str().unwrap_or("").to_string();
    let total_time = computed.get("totaltime")
        .and_then(|t| t.as_f64())
        .unwrap_or_else(|| timex.last().and_then(|t| t.as_f64()).unwrap_or(0.0));

    Ok(ParsedArtisanProfile {
        title,
        roast_date,
        total_time,
        points,
        events,
    })
}