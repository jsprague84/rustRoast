use crate::models::*;
use anyhow::{anyhow, Result};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{Row, SqlitePool};
use uuid::Uuid;

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
            "#,
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

    pub async fn list_sessions(
        &self,
        device_id: Option<&str>,
        limit: Option<i32>,
    ) -> Result<Vec<RoastSession>> {
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
        let session =
            sqlx::query_as::<_, RoastSession>("SELECT * FROM roast_sessions WHERE id = ?")
                .bind(id)
                .fetch_optional(&self.db)
                .await?;

        Ok(session)
    }

    pub async fn get_session_with_telemetry(
        &self,
        id: &str,
    ) -> Result<Option<SessionWithTelemetry>> {
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

        let cupping = self.get_cupping(id).await?;

        Ok(Some(SessionWithTelemetry {
            session,
            telemetry,
            profile,
            cupping,
        }))
    }

    pub async fn update_session(
        &self,
        id: &str,
        req: UpdateSessionRequest,
    ) -> Result<Option<RoastSession>> {
        // Check if there are any fields to update
        if req.name.is_none()
            && req.roasted_weight.is_none()
            && req.notes.is_none()
            && req.first_crack_time.is_none()
            && req.development_time_ratio.is_none()
        {
            return self.get_session(id).await;
        }

        let now = Utc::now();

        // Build the update query with specific conditions for each field
        let mut query = "UPDATE roast_sessions SET updated_at = ?".to_string();

        if req.name.is_some() {
            query.push_str(", name = ?");
        }
        if req.roasted_weight.is_some() {
            query.push_str(", roasted_weight = ?");
        }
        if req.notes.is_some() {
            query.push_str(", notes = ?");
        }
        if req.first_crack_time.is_some() {
            query.push_str(", first_crack_time = ?");
        }
        if req.development_time_ratio.is_some() {
            query.push_str(", development_time_ratio = ?");
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
            "#,
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
            "#,
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
            "#,
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

        // Fetch the session first to get green_weight / roasted_weight
        let existing = match self.get_session(id).await? {
            Some(s) => s,
            None => return Ok(None),
        };

        // Calculate total time, max temperature, and max RoR from telemetry
        let stats = sqlx::query(
            r#"
            SELECT
                MAX(elapsed_seconds) as total_seconds,
                MAX(bean_temp) as max_temp,
                MAX(rate_of_rise) as max_ror
            FROM session_telemetry
            WHERE session_id = ?
            "#,
        )
        .bind(id)
        .fetch_optional(&self.db)
        .await?;

        let (total_time_seconds, max_temp, max_ror) = if let Some(row) = &stats {
            let total_seconds: Option<f32> = row.try_get("total_seconds").ok();
            let max_temp: Option<f32> = row.try_get("max_temp").ok();
            let max_ror: Option<f32> = row.try_get("max_ror").ok();
            (total_seconds.map(|s| s as i32), max_temp, max_ror)
        } else {
            (None, None, None)
        };

        // Fetch roast events for phase boundaries
        let events = self.get_roast_events(id).await?;

        let drying_end_event = events
            .iter()
            .find(|e| e.event_type == RoastEventType::DryingEnd);
        let first_crack_event = events
            .iter()
            .find(|e| e.event_type == RoastEventType::FirstCrackStart);
        let drop_event = events.iter().find(|e| e.event_type == RoastEventType::Drop);

        // Compute development_time_ratio: DTR = (total_time - fc_start) / total_time
        let development_time_ratio = match (total_time_seconds, first_crack_event) {
            (Some(total), Some(fc)) if total > 0 => {
                Some((total as f32 - fc.elapsed_seconds) / total as f32)
            }
            _ => None,
        };

        // Compute first_crack_time from event
        let first_crack_time = first_crack_event.map(|fc| fc.elapsed_seconds as i32);

        // Compute weight_loss_pct
        let weight_loss_pct = match (existing.green_weight, existing.roasted_weight) {
            (Some(green), Some(roasted)) if green > 0.0 => Some((green - roasted) / green * 100.0),
            _ => None,
        };

        // Drying end time and temp from events
        let drying_end_time = drying_end_event.map(|e| e.elapsed_seconds as i32);
        let drying_end_temp = drying_end_event.and_then(|e| e.temperature);

        // Phase boundaries (elapsed_seconds):
        //   Drying:      0 → drying_end
        //   Maillard:    drying_end → first_crack_start
        //   Development: first_crack_start → drop (or total_time)
        let end_seconds = drop_event
            .map(|e| e.elapsed_seconds)
            .or(total_time_seconds.map(|t| t as f32));

        let avg_ror_drying = if let Some(de) = drying_end_event {
            self.avg_ror_in_range(id, 0.0, de.elapsed_seconds).await?
        } else {
            None
        };

        let avg_ror_maillard = match (drying_end_event, first_crack_event) {
            (Some(de), Some(fc)) => {
                self.avg_ror_in_range(id, de.elapsed_seconds, fc.elapsed_seconds)
                    .await?
            }
            _ => None,
        };

        let avg_ror_development = match (first_crack_event, end_seconds) {
            (Some(fc), Some(end)) => self.avg_ror_in_range(id, fc.elapsed_seconds, end).await?,
            _ => None,
        };

        // Compute AUC (Area Under the Curve) using trapezoidal rule
        let auc_value = self.compute_auc(id, &events).await?;

        let session = sqlx::query_as::<_, RoastSession>(
            r#"
            UPDATE roast_sessions
            SET status = ?, end_time = ?, updated_at = ?,
                total_time_seconds = ?, max_temp = ?, max_ror = ?,
                first_crack_time = COALESCE(?, first_crack_time),
                development_time_ratio = COALESCE(?, development_time_ratio),
                weight_loss_pct = ?,
                avg_ror_drying = ?, avg_ror_maillard = ?, avg_ror_development = ?,
                drying_end_time = ?, drying_end_temp = ?,
                auc_value = ?
            WHERE id = ? AND status IN (?, ?)
            RETURNING *
            "#,
        )
        .bind(SessionStatus::Completed.to_string())
        .bind(now)
        .bind(now)
        .bind(total_time_seconds)
        .bind(max_temp)
        .bind(max_ror)
        .bind(first_crack_time)
        .bind(development_time_ratio)
        .bind(weight_loss_pct)
        .bind(avg_ror_drying)
        .bind(avg_ror_maillard)
        .bind(avg_ror_development)
        .bind(drying_end_time)
        .bind(drying_end_temp)
        .bind(auc_value)
        .bind(id)
        .bind(SessionStatus::Active.to_string())
        .bind(SessionStatus::Paused.to_string())
        .fetch_optional(&self.db)
        .await?;

        Ok(session)
    }

    /// Compute average rate_of_rise within a time range from session telemetry.
    async fn avg_ror_in_range(
        &self,
        session_id: &str,
        start: f32,
        end: f32,
    ) -> Result<Option<f32>> {
        let row = sqlx::query(
            r#"
            SELECT AVG(rate_of_rise) as avg_ror
            FROM session_telemetry
            WHERE session_id = ? AND elapsed_seconds >= ? AND elapsed_seconds < ?
              AND rate_of_rise IS NOT NULL
            "#,
        )
        .bind(session_id)
        .bind(start)
        .bind(end)
        .fetch_optional(&self.db)
        .await?;

        Ok(row.and_then(|r| r.try_get("avg_ror").ok()))
    }

    /// Compute AUC (Area Under the Curve) using the trapezoidal rule on bean_temp.
    /// Result is in °C·min units. Base temp and start event are read from settings.
    async fn compute_auc(&self, session_id: &str, events: &[RoastEvent]) -> Result<Option<f32>> {
        // Read settings
        let base_temp: f32 = sqlx::query_scalar::<_, String>(
            "SELECT value FROM settings WHERE key = 'auc_base_temp'",
        )
        .fetch_optional(&self.db)
        .await?
        .and_then(|v| v.parse().ok())
        .unwrap_or(0.0);

        let start_event: String = sqlx::query_scalar::<_, String>(
            "SELECT value FROM settings WHERE key = 'auc_start_event'",
        )
        .fetch_optional(&self.db)
        .await?
        .unwrap_or_else(|| "charge".to_string());

        // Determine start elapsed_seconds based on the configured event
        let start_seconds = match start_event.as_str() {
            "drying_end" => events
                .iter()
                .find(|e| e.event_type == RoastEventType::DryingEnd)
                .map(|e| e.elapsed_seconds)
                .unwrap_or(0.0),
            "first_crack_start" => events
                .iter()
                .find(|e| e.event_type == RoastEventType::FirstCrackStart)
                .map(|e| e.elapsed_seconds)
                .unwrap_or(0.0),
            _ => 0.0, // "charge" or default
        };

        // Fetch telemetry ordered by time, starting from the configured event
        let rows = sqlx::query(
            r#"
            SELECT elapsed_seconds, bean_temp
            FROM session_telemetry
            WHERE session_id = ? AND elapsed_seconds >= ? AND bean_temp IS NOT NULL
            ORDER BY elapsed_seconds
            "#,
        )
        .bind(session_id)
        .bind(start_seconds)
        .fetch_all(&self.db)
        .await?;

        if rows.len() < 2 {
            return Ok(None);
        }

        // Trapezoidal rule: sum of (dt * (BT[i] + BT[i+1]) / 2) with base temp subtracted
        let mut auc_seconds: f64 = 0.0;
        for pair in rows.windows(2) {
            let t0: f32 = pair[0].try_get("elapsed_seconds")?;
            let t1: f32 = pair[1].try_get("elapsed_seconds")?;
            let bt0: f32 = pair[0].try_get("bean_temp")?;
            let bt1: f32 = pair[1].try_get("bean_temp")?;

            let v0 = (bt0 - base_temp).max(0.0) as f64;
            let v1 = (bt1 - base_temp).max(0.0) as f64;
            let dt = (t1 - t0) as f64;

            auc_seconds += dt * (v0 + v1) / 2.0;
        }

        // Convert from °C·s to °C·min
        Ok(Some((auc_seconds / 60.0) as f32))
    }

    pub async fn delete_session(&self, id: &str) -> Result<bool> {
        let result = sqlx::query("DELETE FROM roast_sessions WHERE id = ?")
            .bind(id)
            .execute(&self.db)
            .await?;

        Ok(result.rows_affected() > 0)
    }

    // Telemetry Management
    #[allow(clippy::too_many_arguments)]
    pub async fn add_telemetry_point(
        &self,
        session_id: &str,
        elapsed_seconds: f32,
        bean_temp: Option<f32>,
        env_temp: Option<f32>,
        rate_of_rise: Option<f32>,
        heater_pwm: Option<i32>,
        fan_pwm: Option<i32>,
        setpoint: Option<f32>,
    ) -> Result<()> {
        let id = Uuid::new_v4().to_string();

        sqlx::query(
            r#"
            INSERT INTO session_telemetry (
                id, session_id, timestamp, elapsed_seconds, bean_temp, env_temp,
                rate_of_rise, heater_pwm, fan_pwm, setpoint
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            "#,
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
            "SELECT * FROM session_telemetry WHERE session_id = ? ORDER BY elapsed_seconds",
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
            "#,
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
                    id, profile_id, time_seconds, target_temp, fan_speed, notes, created_at, target_env_temp
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                RETURNING *
                "#,
            )
            .bind(&point_id)
            .bind(&id)
            .bind(point_req.time_seconds)
            .bind(point_req.target_temp)
            .bind(point_req.fan_speed)
            .bind(&point_req.notes)
            .bind(now)
            .bind(point_req.target_env_temp)
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
        let profile =
            sqlx::query_as::<_, RoastProfile>("SELECT * FROM roast_profiles WHERE id = ?")
                .bind(id)
                .fetch_optional(&self.db)
                .await?;

        let Some(profile) = profile else {
            return Ok(None);
        };

        let points = sqlx::query_as::<_, ProfilePoint>(
            "SELECT * FROM profile_points WHERE profile_id = ? ORDER BY time_seconds",
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

    pub async fn update_profile(
        &self,
        id: &str,
        req: CreateProfileRequest,
    ) -> Result<Option<ProfileWithPoints>> {
        let now = Utc::now();
        let mut tx = self.db.begin().await?;

        // Update profile metadata
        let result = sqlx::query(
            r#"
            UPDATE roast_profiles SET
                name = ?, description = ?, updated_at = ?,
                target_total_time = ?, target_first_crack = ?, target_end_temp = ?,
                preheat_temp = ?, charge_temp = ?
            WHERE id = ?
            "#,
        )
        .bind(&req.name)
        .bind(&req.description)
        .bind(now)
        .bind(req.target_total_time)
        .bind(req.target_first_crack)
        .bind(req.target_end_temp)
        .bind(req.preheat_temp)
        .bind(req.charge_temp)
        .bind(id)
        .execute(&mut *tx)
        .await?;

        if result.rows_affected() == 0 {
            return Ok(None);
        }

        // Delete old points and insert new ones atomically
        sqlx::query("DELETE FROM profile_points WHERE profile_id = ?")
            .bind(id)
            .execute(&mut *tx)
            .await?;

        for point_req in &req.points {
            let point_id = Uuid::new_v4().to_string();
            sqlx::query(
                r#"
                INSERT INTO profile_points (
                    id, profile_id, time_seconds, target_temp, fan_speed, notes, created_at, target_env_temp
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                "#,
            )
            .bind(&point_id)
            .bind(id)
            .bind(point_req.time_seconds)
            .bind(point_req.target_temp)
            .bind(point_req.fan_speed)
            .bind(&point_req.notes)
            .bind(now)
            .bind(point_req.target_env_temp)
            .execute(&mut *tx)
            .await?;
        }

        tx.commit().await?;

        // Fetch and return updated profile with points
        self.get_profile_with_points(id).await
    }

    pub async fn import_artisan_profile(
        &self,
        req: ImportArtisanProfileRequest,
    ) -> Result<ProfileWithPoints> {
        let parsed = parse_artisan_alog(&req.alog_content)?;

        // Create profile from parsed data
        let profile_name = req.name.unwrap_or_else(|| {
            if parsed.title.is_empty() {
                "Imported Artisan Profile".to_string()
            } else {
                parsed.title.clone()
            }
        });

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
                target_env_temp: None,
            });
        }

        let create_req = CreateProfileRequest {
            name: profile_name,
            description: Some(format!(
                "Imported from Artisan - Date: {}",
                parsed.roast_date
            )),
            target_total_time: Some(parsed.total_time as i32),
            target_first_crack: parsed
                .events
                .iter()
                .find(|e| e.event_type == "FCs")
                .map(|e| e.time as i32),
            target_end_temp: parsed.points.last().map(|p| p.bean_temp),
            preheat_temp: None,
            charge_temp: parsed
                .events
                .iter()
                .find(|e| e.event_type == "CHARGE")
                .map(|e| e.bean_temp),
            points,
        };

        self.create_profile(create_req).await
    }

    // Utility functions
    #[allow(dead_code)] // Used by MQTT consumer (DEV-007)
    pub async fn get_active_session(&self, device_id: &str) -> Result<Option<RoastSession>> {
        let session = sqlx::query_as::<_, RoastSession>(
            r#"
            SELECT * FROM roast_sessions 
            WHERE device_id = ? AND status IN (?, ?)
            ORDER BY start_time DESC
            LIMIT 1
            "#,
        )
        .bind(device_id)
        .bind(SessionStatus::Active.to_string())
        .bind(SessionStatus::Paused.to_string())
        .fetch_optional(&self.db)
        .await?;

        Ok(session)
    }

    // Roast Events CRUD operations
    pub async fn create_roast_event(
        &self,
        session_id: &str,
        req: CreateRoastEventRequest,
    ) -> Result<RoastEvent> {
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
            "SELECT * FROM roast_events WHERE session_id = ?1 ORDER BY elapsed_seconds ASC",
        )
        .bind(session_id)
        .fetch_all(&self.db)
        .await?;

        Ok(events)
    }

    pub async fn update_roast_event(
        &self,
        event_id: &str,
        req: UpdateRoastEventRequest,
    ) -> Result<RoastEvent> {
        let mut updates = Vec::new();

        if req.elapsed_seconds.is_some() {
            updates.push("elapsed_seconds = ?".to_string());
        }

        if req.temperature.is_some() {
            updates.push("temperature = ?".to_string());
        }

        if req.notes.is_some() {
            updates.push("notes = ?".to_string());
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

    // ---- Cupping Notes CRUD (AP-012) ----

    pub async fn create_cupping(
        &self,
        session_id: &str,
        req: CreateCuppingRequest,
    ) -> Result<CuppingWithAttributes> {
        // Delete any existing cupping for this session (upsert semantics)
        // CASCADE will also delete associated cupping_attributes
        sqlx::query("DELETE FROM cupping_scores WHERE session_id = ?")
            .bind(session_id)
            .execute(&self.db)
            .await?;

        let cupping_id = Uuid::new_v4().to_string();
        let framework = req.scoring_framework.unwrap_or_else(|| "sca".to_string());

        // Compute overall score as average of attribute scores
        let overall: Option<f32> = if req.attributes.is_empty() {
            None
        } else {
            let sum: f32 = req.attributes.iter().map(|a| a.score).sum();
            Some(sum / req.attributes.len() as f32)
        };

        let cupping = sqlx::query_as::<_, CuppingScore>(
            r#"INSERT INTO cupping_scores (id, session_id, scoring_framework, overall_score, notes)
               VALUES (?, ?, ?, ?, ?)
               RETURNING *"#,
        )
        .bind(&cupping_id)
        .bind(session_id)
        .bind(&framework)
        .bind(overall)
        .bind(&req.notes)
        .fetch_one(&self.db)
        .await?;

        let mut attributes = Vec::new();
        for attr in &req.attributes {
            let attr_id = Uuid::new_v4().to_string();
            let row = sqlx::query_as::<_, CuppingAttribute>(
                r#"INSERT INTO cupping_attributes (id, cupping_id, attribute_name, score)
                   VALUES (?, ?, ?, ?)
                   RETURNING *"#,
            )
            .bind(&attr_id)
            .bind(&cupping_id)
            .bind(&attr.name)
            .bind(attr.score)
            .fetch_one(&self.db)
            .await?;
            attributes.push(row);
        }

        Ok(CuppingWithAttributes {
            cupping,
            attributes,
        })
    }

    pub async fn get_cupping(&self, session_id: &str) -> Result<Option<CuppingWithAttributes>> {
        let cupping = sqlx::query_as::<_, CuppingScore>(
            "SELECT * FROM cupping_scores WHERE session_id = ? ORDER BY created_at DESC LIMIT 1",
        )
        .bind(session_id)
        .fetch_optional(&self.db)
        .await?;

        let cupping = match cupping {
            Some(c) => c,
            None => return Ok(None),
        };

        let attributes = sqlx::query_as::<_, CuppingAttribute>(
            "SELECT * FROM cupping_attributes WHERE cupping_id = ? ORDER BY attribute_name",
        )
        .bind(&cupping.id)
        .fetch_all(&self.db)
        .await?;

        Ok(Some(CuppingWithAttributes {
            cupping,
            attributes,
        }))
    }

    pub async fn delete_cupping(&self, session_id: &str) -> Result<()> {
        // CASCADE will delete cupping_attributes
        sqlx::query("DELETE FROM cupping_scores WHERE session_id = ?")
            .bind(session_id)
            .execute(&self.db)
            .await?;
        Ok(())
    }

    // ---- Data Export (AP-014) ----

    pub async fn export_csv(&self, id: &str) -> Result<Option<(String, String)>> {
        let session = match self.get_session(id).await? {
            Some(s) => s,
            None => return Ok(None),
        };
        let telemetry = self.get_session_telemetry(id).await?;
        let profile_name = if let Some(pid) = &session.profile_id {
            self.get_profile_with_points(pid)
                .await?
                .map(|p| p.profile.name)
                .unwrap_or_default()
        } else {
            String::new()
        };

        let mut csv = String::new();
        csv.push_str(&format!("# Session: {}\n", session.name));
        if let Some(ref st) = session.start_time {
            csv.push_str(&format!("# Date: {}\n", st));
        }
        if let Some(ref origin) = session.bean_origin {
            let variety = session.bean_variety.as_deref().unwrap_or("");
            if variety.is_empty() {
                csv.push_str(&format!("# Bean: {}\n", origin));
            } else {
                csv.push_str(&format!("# Bean: {} ({})\n", origin, variety));
            }
        }
        if !profile_name.is_empty() {
            csv.push_str(&format!("# Profile: {}\n", profile_name));
        }
        if let Some(gw) = session.green_weight {
            csv.push_str(&format!("# Green Weight: {}g\n", gw));
        }
        if let Some(rw) = session.roasted_weight {
            csv.push_str(&format!("# Roasted Weight: {}g\n", rw));
        }

        csv.push_str(
            "elapsed_seconds,bean_temp,env_temp,rate_of_rise,heater_pwm,fan_pwm,setpoint\n",
        );
        for t in &telemetry {
            csv.push_str(&format!(
                "{},{},{},{},{},{},{}\n",
                t.elapsed_seconds,
                t.bean_temp.map(|v| v.to_string()).unwrap_or_default(),
                t.env_temp.map(|v| v.to_string()).unwrap_or_default(),
                t.rate_of_rise.map(|v| v.to_string()).unwrap_or_default(),
                t.heater_pwm.map(|v| v.to_string()).unwrap_or_default(),
                t.fan_pwm.map(|v| v.to_string()).unwrap_or_default(),
                t.setpoint.map(|v| v.to_string()).unwrap_or_default(),
            ));
        }

        let date_str = session
            .start_time
            .map(|dt| dt.format("%Y-%m-%d").to_string())
            .unwrap_or_else(|| session.created_at.format("%Y-%m-%d").to_string());
        let filename = format!("{}_{}.csv", session.name.replace(' ', "_"), date_str);

        Ok(Some((csv, filename)))
    }

    pub async fn export_artisan_json(
        &self,
        id: &str,
    ) -> Result<Option<(serde_json::Value, String)>> {
        let session = match self.get_session(id).await? {
            Some(s) => s,
            None => return Ok(None),
        };
        let telemetry = self.get_session_telemetry(id).await?;
        let events = self.get_roast_events(id).await?;

        let timex: Vec<f64> = telemetry.iter().map(|t| t.elapsed_seconds as f64).collect();
        let temp1: Vec<f64> = telemetry
            .iter()
            .map(|t| t.env_temp.unwrap_or(-1.0) as f64)
            .collect();
        let temp2: Vec<f64> = telemetry
            .iter()
            .map(|t| t.bean_temp.unwrap_or(-1.0) as f64)
            .collect();

        // Build timeindex: [CHARGE, DRY, FCs, FCe, SCs, SCe, DROP, COOL]
        // CHARGE is handled separately (always index 0), so event_map starts at DRY
        let event_map = [
            "drying_end",         // DRY
            "first_crack_start",  // FCs
            "first_crack_end",    // FCe
            "second_crack_start", // SCs
            "second_crack_end",   // SCe
            "drop_out",           // DROP
        ];

        // CHARGE is index 0 in telemetry (first reading)
        let charge_idx: i64 = if !timex.is_empty() { 0 } else { -1 };

        let mut timeindex: Vec<i64> = vec![charge_idx];
        for event_type in &event_map {
            let idx = events
                .iter()
                .find(|e| e.event_type.to_string() == *event_type)
                .and_then(|e| {
                    // Find nearest telemetry index
                    timex
                        .iter()
                        .enumerate()
                        .min_by_key(|(_, &t)| {
                            ((t - e.elapsed_seconds as f64) * 1000.0).abs() as i64
                        })
                        .map(|(i, _)| i as i64)
                })
                .unwrap_or(-1);
            timeindex.push(idx);
        }
        // COOL (index 7) — not tracked, use -1
        timeindex.push(-1);

        // Build specialevents
        let specialevents: Vec<serde_json::Value> = events
            .iter()
            .map(|e| {
                serde_json::json!({
                    "type": e.event_type.to_string(),
                    "time": e.elapsed_seconds,
                    "temperature": e.temperature,
                    "notes": e.notes,
                })
            })
            .collect();

        let roastdate = session
            .start_time
            .map(|dt| dt.to_rfc3339())
            .unwrap_or_else(|| session.created_at.to_rfc3339());

        let weight: Vec<serde_json::Value> = vec![
            serde_json::json!(session.green_weight.unwrap_or(0.0)),
            serde_json::json!(session.roasted_weight.unwrap_or(0.0)),
            serde_json::json!("g"),
        ];

        let alog = serde_json::json!({
            "version": "2",
            "title": session.name,
            "roastdate": roastdate,
            "beans": session.bean_origin.unwrap_or_default(),
            "weight": weight,
            "timex": timex,
            "temp1": temp1,
            "temp2": temp2,
            "timeindex": timeindex,
            "specialevents": specialevents,
        });

        let date_str = session
            .start_time
            .map(|dt| dt.format("%Y-%m-%d").to_string())
            .unwrap_or_else(|| session.created_at.format("%Y-%m-%d").to_string());
        let filename = format!("{}_{}.alog", session.name.replace(' ', "_"), date_str);

        Ok(Some((alog, filename)))
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
    let computed = profile_data["computed"]
        .as_object()
        .unwrap_or(&default_computed);

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
        if let Some(time) = computed
            .get(&format!("{}_time", key))
            .and_then(|t| t.as_f64())
        {
            let bean_temp = computed
                .get(&format!("{}_BT", key))
                .and_then(|t| t.as_f64())
                .unwrap_or(0.0) as f32;
            let env_temp = computed
                .get(&format!("{}_ET", key))
                .and_then(|t| t.as_f64())
                .unwrap_or(0.0) as f32;
            let name = match event_type {
                "CHARGE" => "Charge",
                "TP" => "Turning Point",
                "DRY" => "Dry End",
                "FCs" => "First Crack Start",
                "FCe" => "First Crack End",
                "SCs" => "Second Crack Start",
                "DROP" => "Drop",
                _ => event_type,
            }
            .to_string();

            events.push(ArtisanRoastEvent {
                name,
                time,
                bean_temp,
                env_temp,
                event_type: event_type.to_string(),
            });
        }
    }

    let title = profile_data["title"]
        .as_str()
        .unwrap_or("Imported Profile")
        .to_string();
    let roast_date = profile_data["roastdate"].as_str().unwrap_or("").to_string();
    let total_time = computed
        .get("totaltime")
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

// ============================================================================
// Device Service
// ============================================================================

#[derive(Clone)]
pub struct DeviceService {
    db: SqlitePool,
}

impl DeviceService {
    pub fn new(db: SqlitePool) -> Self {
        Self { db }
    }

    // ---- Device CRUD ----

    pub async fn list_devices(&self, status_filter: Option<DeviceStatus>) -> Result<Vec<Device>> {
        if let Some(status) = status_filter {
            let devices = sqlx::query_as::<_, Device>(
                "SELECT * FROM devices WHERE status = ? ORDER BY created_at DESC",
            )
            .bind(status.to_string())
            .fetch_all(&self.db)
            .await?;
            Ok(devices)
        } else {
            let devices =
                sqlx::query_as::<_, Device>("SELECT * FROM devices ORDER BY created_at DESC")
                    .fetch_all(&self.db)
                    .await?;
            Ok(devices)
        }
    }

    pub async fn get_device(&self, id: &str) -> Result<Option<DeviceWithConnections>> {
        let device = sqlx::query_as::<_, Device>("SELECT * FROM devices WHERE id = ?")
            .bind(id)
            .fetch_optional(&self.db)
            .await?;

        let Some(device) = device else {
            return Ok(None);
        };

        let connections = sqlx::query_as::<_, DeviceConnection>(
            "SELECT * FROM device_connections WHERE device_id = ? ORDER BY priority DESC",
        )
        .bind(id)
        .fetch_all(&self.db)
        .await?;

        Ok(Some(DeviceWithConnections {
            device,
            connections,
        }))
    }

    pub async fn get_device_by_device_id(
        &self,
        device_id: &str,
    ) -> Result<Option<DeviceWithConnections>> {
        let device = sqlx::query_as::<_, Device>("SELECT * FROM devices WHERE device_id = ?")
            .bind(device_id)
            .fetch_optional(&self.db)
            .await?;

        let Some(device) = device else {
            return Ok(None);
        };

        let connections = sqlx::query_as::<_, DeviceConnection>(
            "SELECT * FROM device_connections WHERE device_id = ? ORDER BY priority DESC",
        )
        .bind(&device.id)
        .fetch_all(&self.db)
        .await?;

        Ok(Some(DeviceWithConnections {
            device,
            connections,
        }))
    }

    pub async fn create_device(&self, req: CreateDeviceRequest) -> Result<Device> {
        let id = Uuid::new_v4().to_string();
        let now = Utc::now();

        let device = sqlx::query_as::<_, Device>(
            r#"
            INSERT INTO devices (id, name, device_id, profile_id, status, description, location, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            RETURNING *
            "#
        )
        .bind(&id)
        .bind(&req.name)
        .bind(&req.device_id)
        .bind(&req.profile_id)
        .bind(DeviceStatus::Pending.to_string())
        .bind(&req.description)
        .bind(&req.location)
        .bind(now)
        .bind(now)
        .fetch_one(&self.db)
        .await?;

        Ok(device)
    }

    pub async fn update_device(
        &self,
        id: &str,
        req: UpdateDeviceRequest,
    ) -> Result<Option<Device>> {
        if req.name.is_none()
            && req.profile_id.is_none()
            && req.status.is_none()
            && req.description.is_none()
            && req.location.is_none()
        {
            // Nothing to update, just return the existing device
            let device = sqlx::query_as::<_, Device>("SELECT * FROM devices WHERE id = ?")
                .bind(id)
                .fetch_optional(&self.db)
                .await?;
            return Ok(device);
        }

        let now = Utc::now();
        let mut query = "UPDATE devices SET updated_at = ?".to_string();

        if req.name.is_some() {
            query.push_str(", name = ?");
        }
        if req.profile_id.is_some() {
            query.push_str(", profile_id = ?");
        }
        if req.status.is_some() {
            query.push_str(", status = ?");
        }
        if req.description.is_some() {
            query.push_str(", description = ?");
        }
        if req.location.is_some() {
            query.push_str(", location = ?");
        }

        query.push_str(" WHERE id = ? RETURNING *");

        let mut query_builder = sqlx::query_as::<_, Device>(&query).bind(now);

        if let Some(ref name) = req.name {
            query_builder = query_builder.bind(name);
        }
        if let Some(ref profile_id) = req.profile_id {
            query_builder = query_builder.bind(profile_id);
        }
        if let Some(ref status) = req.status {
            query_builder = query_builder.bind(status.to_string());
        }
        if let Some(ref description) = req.description {
            query_builder = query_builder.bind(description);
        }
        if let Some(ref location) = req.location {
            query_builder = query_builder.bind(location);
        }

        query_builder = query_builder.bind(id);

        let device = query_builder.fetch_optional(&self.db).await?;
        Ok(device)
    }

    pub async fn delete_device(&self, id: &str) -> Result<bool> {
        let result = sqlx::query("DELETE FROM devices WHERE id = ?")
            .bind(id)
            .execute(&self.db)
            .await?;

        Ok(result.rows_affected() > 0)
    }

    #[allow(dead_code)] // Will be used by device status transitions
    pub async fn update_device_status(
        &self,
        id: &str,
        status: DeviceStatus,
    ) -> Result<Option<Device>> {
        let device = sqlx::query_as::<_, Device>(
            "UPDATE devices SET status = ?, updated_at = ? WHERE id = ? RETURNING *",
        )
        .bind(status.to_string())
        .bind(Utc::now())
        .bind(id)
        .fetch_optional(&self.db)
        .await?;

        Ok(device)
    }

    pub async fn update_last_seen(&self, device_id: &str) -> Result<()> {
        sqlx::query("UPDATE devices SET last_seen_at = ? WHERE device_id = ?")
            .bind(Utc::now())
            .bind(device_id)
            .execute(&self.db)
            .await?;

        Ok(())
    }

    // ---- Device Profile CRUD ----

    pub async fn list_profiles(&self) -> Result<Vec<DeviceProfile>> {
        let profiles = sqlx::query_as::<_, DeviceProfile>(
            "SELECT * FROM device_profiles ORDER BY created_at DESC",
        )
        .fetch_all(&self.db)
        .await?;

        Ok(profiles)
    }

    pub async fn get_profile(&self, id: &str) -> Result<Option<DeviceProfile>> {
        let profile =
            sqlx::query_as::<_, DeviceProfile>("SELECT * FROM device_profiles WHERE id = ?")
                .bind(id)
                .fetch_optional(&self.db)
                .await?;

        Ok(profile)
    }

    pub async fn create_profile(&self, req: CreateDeviceProfileRequest) -> Result<DeviceProfile> {
        let id = Uuid::new_v4().to_string();
        let now = Utc::now();

        let profile = sqlx::query_as::<_, DeviceProfile>(
            r#"
            INSERT INTO device_profiles (
                id, name, description, default_control_mode, default_setpoint, default_fan_pwm,
                default_kp, default_ki, default_kd, max_temp, min_fan_pwm, telemetry_interval_ms,
                created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            RETURNING *
            "#,
        )
        .bind(&id)
        .bind(&req.name)
        .bind(&req.description)
        .bind(&req.default_control_mode)
        .bind(req.default_setpoint)
        .bind(req.default_fan_pwm)
        .bind(req.default_kp)
        .bind(req.default_ki)
        .bind(req.default_kd)
        .bind(req.max_temp)
        .bind(req.min_fan_pwm)
        .bind(req.telemetry_interval_ms)
        .bind(now)
        .bind(now)
        .fetch_one(&self.db)
        .await?;

        Ok(profile)
    }

    pub async fn update_profile(
        &self,
        id: &str,
        req: UpdateDeviceProfileRequest,
    ) -> Result<Option<DeviceProfile>> {
        let now = Utc::now();
        let profile = sqlx::query_as::<_, DeviceProfile>(
            r#"
            UPDATE device_profiles SET
                name = COALESCE(?, name),
                description = COALESCE(?, description),
                default_control_mode = COALESCE(?, default_control_mode),
                default_setpoint = COALESCE(?, default_setpoint),
                default_fan_pwm = COALESCE(?, default_fan_pwm),
                default_kp = COALESCE(?, default_kp),
                default_ki = COALESCE(?, default_ki),
                default_kd = COALESCE(?, default_kd),
                max_temp = COALESCE(?, max_temp),
                min_fan_pwm = COALESCE(?, min_fan_pwm),
                telemetry_interval_ms = COALESCE(?, telemetry_interval_ms),
                updated_at = ?
            WHERE id = ?
            RETURNING *
            "#,
        )
        .bind(&req.name)
        .bind(&req.description)
        .bind(&req.default_control_mode)
        .bind(req.default_setpoint)
        .bind(req.default_fan_pwm)
        .bind(req.default_kp)
        .bind(req.default_ki)
        .bind(req.default_kd)
        .bind(req.max_temp)
        .bind(req.min_fan_pwm)
        .bind(req.telemetry_interval_ms)
        .bind(now)
        .bind(id)
        .fetch_optional(&self.db)
        .await?;

        Ok(profile)
    }

    pub async fn delete_profile(&self, id: &str) -> Result<bool> {
        let result = sqlx::query("DELETE FROM device_profiles WHERE id = ?")
            .bind(id)
            .execute(&self.db)
            .await?;

        Ok(result.rows_affected() > 0)
    }

    // ---- Device Connection CRUD ----

    pub async fn add_connection(
        &self,
        device_id: &str,
        req: CreateConnectionRequest,
    ) -> Result<DeviceConnection> {
        let id = Uuid::new_v4().to_string();
        let now = Utc::now();

        let connection = sqlx::query_as::<_, DeviceConnection>(
            r#"
            INSERT INTO device_connections (id, device_id, protocol, enabled, priority, config, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            RETURNING *
            "#
        )
        .bind(&id)
        .bind(device_id)
        .bind(req.protocol.to_string())
        .bind(req.enabled.unwrap_or(true))
        .bind(req.priority.unwrap_or(0))
        .bind(serde_json::to_string(&req.config)?)
        .bind(now)
        .bind(now)
        .fetch_one(&self.db)
        .await?;

        Ok(connection)
    }

    pub async fn update_connection(
        &self,
        connection_id: &str,
        req: UpdateConnectionRequest,
    ) -> Result<Option<DeviceConnection>> {
        if req.enabled.is_none() && req.priority.is_none() && req.config.is_none() {
            let conn = sqlx::query_as::<_, DeviceConnection>(
                "SELECT * FROM device_connections WHERE id = ?",
            )
            .bind(connection_id)
            .fetch_optional(&self.db)
            .await?;
            return Ok(conn);
        }

        let now = Utc::now();
        let mut query = "UPDATE device_connections SET updated_at = ?".to_string();

        if req.enabled.is_some() {
            query.push_str(", enabled = ?");
        }
        if req.priority.is_some() {
            query.push_str(", priority = ?");
        }
        if req.config.is_some() {
            query.push_str(", config = ?");
        }

        query.push_str(" WHERE id = ? RETURNING *");

        let mut query_builder = sqlx::query_as::<_, DeviceConnection>(&query).bind(now);

        if let Some(enabled) = req.enabled {
            query_builder = query_builder.bind(enabled);
        }
        if let Some(priority) = req.priority {
            query_builder = query_builder.bind(priority);
        }
        if let Some(ref config) = req.config {
            query_builder = query_builder.bind(serde_json::to_string(config)?);
        }

        query_builder = query_builder.bind(connection_id);

        let connection = query_builder.fetch_optional(&self.db).await?;
        Ok(connection)
    }

    pub async fn remove_connection(&self, connection_id: &str) -> Result<bool> {
        let result = sqlx::query("DELETE FROM device_connections WHERE id = ?")
            .bind(connection_id)
            .execute(&self.db)
            .await?;

        Ok(result.rows_affected() > 0)
    }

    // ---- Register Map CRUD ----

    pub async fn get_register_map(&self, device_id: &str) -> Result<Vec<ModbusRegisterMap>> {
        let registers = sqlx::query_as::<_, ModbusRegisterMap>(
            "SELECT * FROM modbus_register_maps WHERE device_id = ? ORDER BY register_type, address"
        )
        .bind(device_id)
        .fetch_all(&self.db)
        .await?;

        Ok(registers)
    }

    pub async fn set_register_map(
        &self,
        device_id: &str,
        registers: Vec<CreateRegisterMapEntry>,
    ) -> Result<Vec<ModbusRegisterMap>> {
        // Delete existing register map and insert new entries in a transaction
        let mut tx = self.db.begin().await?;

        sqlx::query("DELETE FROM modbus_register_maps WHERE device_id = ?")
            .bind(device_id)
            .execute(&mut *tx)
            .await?;

        let mut result = Vec::new();
        for entry in registers {
            let id = Uuid::new_v4().to_string();
            let register = sqlx::query_as::<_, ModbusRegisterMap>(
                r#"
                INSERT INTO modbus_register_maps (
                    id, device_id, register_type, address, name, data_type,
                    byte_order, scale_factor, offset, unit, description, writable
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                RETURNING *
                "#,
            )
            .bind(&id)
            .bind(device_id)
            .bind(entry.register_type.to_string())
            .bind(entry.address)
            .bind(&entry.name)
            .bind(entry.data_type.to_string())
            .bind(&entry.byte_order)
            .bind(entry.scale_factor)
            .bind(entry.offset)
            .bind(&entry.unit)
            .bind(&entry.description)
            .bind(entry.writable.unwrap_or(false))
            .fetch_one(&mut *tx)
            .await?;

            result.push(register);
        }

        tx.commit().await?;
        Ok(result)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::SqlitePool;

    async fn setup_test_db() -> SqlitePool {
        let pool = sqlx::sqlite::SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .expect("Failed to create test db");

        // Enable foreign keys for tests
        sqlx::query("PRAGMA foreign_keys = ON;")
            .execute(&pool)
            .await
            .expect("Failed to enable foreign keys");

        // Run migrations
        let migrations: &[&str] = &[
            include_str!("../migrations/001_roast_sessions.sql"),
            include_str!("../migrations/002_roast_events.sql"),
            include_str!("../migrations/003_device_configuration.sql"),
            include_str!("../migrations/004_session_statistics.sql"),
            include_str!("../migrations/005_auc_value.sql"),
            include_str!("../migrations/006_cupping_scores.sql"),
            include_str!("../migrations/007_profile_env_temp.sql"),
        ];
        for migration_sql in migrations {
            for statement in migration_sql.split(';') {
                let statement = statement.trim();
                if !statement.is_empty() {
                    let _ = sqlx::query(statement).execute(&pool).await;
                }
            }
        }

        // Create settings table and seed defaults (mirrors init_db)
        sqlx::query(
            "CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            );",
        )
        .execute(&pool)
        .await
        .expect("Failed to create settings table");
        for (key, value) in [
            ("profile_lookahead_seconds", "20"),
            ("auc_base_temp", "0"),
            ("auc_start_event", "charge"),
            ("ror_window_seconds", "30"),
            ("ror_smoothing_algorithm", "moving_average"),
            ("auto_dry_temp", "150"),
            ("auto_event_detection", "true"),
            ("alarm_sound_enabled", "true"),
            (
                "roast_alarms",
                r#"[{"name":"High Temp Warning","condition_type":"temp_above","threshold":230,"enabled":true},{"name":"FC Approaching","condition_type":"temp_above","threshold":195,"enabled":true},{"name":"Low RoR Warning","condition_type":"ror_below","threshold":5.0,"reference_event":"first_crack_start","enabled":true}]"#,
            ),
        ] {
            let _ = sqlx::query("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)")
                .bind(key)
                .bind(value)
                .execute(&pool)
                .await;
        }

        pool
    }

    // ---- Device CRUD Tests ----

    #[tokio::test]
    async fn test_create_and_get_device() {
        let pool = setup_test_db().await;
        let service = DeviceService::new(pool);

        let req = CreateDeviceRequest {
            name: "Test Roaster".to_string(),
            device_id: "esp32-001".to_string(),
            profile_id: None,
            description: Some("A test device".to_string()),
            location: Some("Kitchen".to_string()),
        };

        let device = service
            .create_device(req)
            .await
            .expect("create_device failed");
        assert_eq!(device.name, "Test Roaster");
        assert_eq!(device.device_id, "esp32-001");
        assert_eq!(device.status, DeviceStatus::Pending);
        assert_eq!(device.description, Some("A test device".to_string()));
        assert_eq!(device.location, Some("Kitchen".to_string()));

        // Get by id
        let fetched = service
            .get_device(&device.id)
            .await
            .expect("get_device failed");
        assert!(fetched.is_some());
        let fetched = fetched.unwrap();
        assert_eq!(fetched.device.name, "Test Roaster");
        assert!(fetched.connections.is_empty());

        // Get by device_id
        let fetched = service
            .get_device_by_device_id("esp32-001")
            .await
            .expect("get_device_by_device_id failed");
        assert!(fetched.is_some());
        assert_eq!(fetched.unwrap().device.id, device.id);
    }

    #[tokio::test]
    async fn test_list_devices_with_status_filter() {
        let pool = setup_test_db().await;
        let service = DeviceService::new(pool);

        // Create two devices
        service
            .create_device(CreateDeviceRequest {
                name: "Device 1".to_string(),
                device_id: "d1".to_string(),
                profile_id: None,
                description: None,
                location: None,
            })
            .await
            .unwrap();

        let device2 = service
            .create_device(CreateDeviceRequest {
                name: "Device 2".to_string(),
                device_id: "d2".to_string(),
                profile_id: None,
                description: None,
                location: None,
            })
            .await
            .unwrap();

        // Activate device 2
        service
            .update_device_status(&device2.id, DeviceStatus::Active)
            .await
            .unwrap();

        // List all
        let all = service.list_devices(None).await.unwrap();
        assert_eq!(all.len(), 2);

        // List only pending
        let pending = service
            .list_devices(Some(DeviceStatus::Pending))
            .await
            .unwrap();
        assert_eq!(pending.len(), 1);
        assert_eq!(pending[0].device_id, "d1");

        // List only active
        let active = service
            .list_devices(Some(DeviceStatus::Active))
            .await
            .unwrap();
        assert_eq!(active.len(), 1);
        assert_eq!(active[0].device_id, "d2");
    }

    #[tokio::test]
    async fn test_update_device() {
        let pool = setup_test_db().await;
        let service = DeviceService::new(pool);

        let device = service
            .create_device(CreateDeviceRequest {
                name: "Original".to_string(),
                device_id: "dev1".to_string(),
                profile_id: None,
                description: None,
                location: None,
            })
            .await
            .unwrap();

        let updated = service
            .update_device(
                &device.id,
                UpdateDeviceRequest {
                    name: Some("Updated Name".to_string()),
                    profile_id: None,
                    status: Some(DeviceStatus::Active),
                    description: Some("Now with description".to_string()),
                    location: None,
                },
            )
            .await
            .unwrap();

        assert!(updated.is_some());
        let updated = updated.unwrap();
        assert_eq!(updated.name, "Updated Name");
        assert_eq!(updated.status, DeviceStatus::Active);
        assert_eq!(
            updated.description,
            Some("Now with description".to_string())
        );
    }

    #[tokio::test]
    async fn test_delete_device() {
        let pool = setup_test_db().await;
        let service = DeviceService::new(pool);

        let device = service
            .create_device(CreateDeviceRequest {
                name: "To Delete".to_string(),
                device_id: "del1".to_string(),
                profile_id: None,
                description: None,
                location: None,
            })
            .await
            .unwrap();

        assert!(service.delete_device(&device.id).await.unwrap());
        assert!(!service.delete_device(&device.id).await.unwrap()); // Already deleted

        let fetched = service.get_device(&device.id).await.unwrap();
        assert!(fetched.is_none());
    }

    #[tokio::test]
    async fn test_update_last_seen() {
        let pool = setup_test_db().await;
        let service = DeviceService::new(pool);

        let device = service
            .create_device(CreateDeviceRequest {
                name: "Seen Device".to_string(),
                device_id: "seen1".to_string(),
                profile_id: None,
                description: None,
                location: None,
            })
            .await
            .unwrap();

        assert!(device.last_seen_at.is_none());

        service.update_last_seen("seen1").await.unwrap();

        let fetched = service.get_device(&device.id).await.unwrap().unwrap();
        assert!(fetched.device.last_seen_at.is_some());
    }

    // ---- Device Profile Tests ----

    #[tokio::test]
    async fn test_create_and_list_profiles() {
        let pool = setup_test_db().await;
        let service = DeviceService::new(pool);

        let profile = service
            .create_profile(CreateDeviceProfileRequest {
                name: "Default Profile".to_string(),
                description: Some("Standard roasting config".to_string()),
                default_control_mode: Some("auto".to_string()),
                default_setpoint: Some(200.0),
                default_fan_pwm: Some(180),
                default_kp: Some(15.0),
                default_ki: Some(1.0),
                default_kd: Some(25.0),
                max_temp: Some(240.0),
                min_fan_pwm: Some(100),
                telemetry_interval_ms: Some(1000),
            })
            .await
            .unwrap();

        assert_eq!(profile.name, "Default Profile");
        assert_eq!(profile.default_setpoint, Some(200.0));

        let profiles = service.list_profiles().await.unwrap();
        assert_eq!(profiles.len(), 1);

        let fetched = service.get_profile(&profile.id).await.unwrap();
        assert!(fetched.is_some());
        assert_eq!(fetched.unwrap().name, "Default Profile");
    }

    #[tokio::test]
    async fn test_delete_profile() {
        let pool = setup_test_db().await;
        let service = DeviceService::new(pool);

        let profile = service
            .create_profile(CreateDeviceProfileRequest {
                name: "Temp Profile".to_string(),
                description: None,
                default_control_mode: None,
                default_setpoint: None,
                default_fan_pwm: None,
                default_kp: None,
                default_ki: None,
                default_kd: None,
                max_temp: None,
                min_fan_pwm: None,
                telemetry_interval_ms: None,
            })
            .await
            .unwrap();

        assert!(service.delete_profile(&profile.id).await.unwrap());
        assert!(!service.delete_profile(&profile.id).await.unwrap());
    }

    #[tokio::test]
    async fn test_device_with_profile() {
        let pool = setup_test_db().await;
        let service = DeviceService::new(pool);

        let profile = service
            .create_profile(CreateDeviceProfileRequest {
                name: "Roast Profile".to_string(),
                description: None,
                default_control_mode: None,
                default_setpoint: Some(200.0),
                default_fan_pwm: None,
                default_kp: None,
                default_ki: None,
                default_kd: None,
                max_temp: None,
                min_fan_pwm: None,
                telemetry_interval_ms: None,
            })
            .await
            .unwrap();

        let device = service
            .create_device(CreateDeviceRequest {
                name: "Profiled Device".to_string(),
                device_id: "prof1".to_string(),
                profile_id: Some(profile.id.clone()),
                description: None,
                location: None,
            })
            .await
            .unwrap();

        assert_eq!(device.profile_id, Some(profile.id));
    }

    // ---- Connection Tests ----

    #[tokio::test]
    async fn test_add_and_remove_connection() {
        let pool = setup_test_db().await;
        let service = DeviceService::new(pool);

        let device = service
            .create_device(CreateDeviceRequest {
                name: "Connected Device".to_string(),
                device_id: "conn1".to_string(),
                profile_id: None,
                description: None,
                location: None,
            })
            .await
            .unwrap();

        let mqtt_config = serde_json::json!({
            "topic_prefix": "roaster/conn1",
            "qos": 1
        });

        let conn = service
            .add_connection(
                &device.id,
                CreateConnectionRequest {
                    protocol: Protocol::Mqtt,
                    enabled: Some(true),
                    priority: Some(10),
                    config: mqtt_config.clone(),
                },
            )
            .await
            .unwrap();

        assert_eq!(conn.protocol, Protocol::Mqtt);
        assert!(conn.enabled);
        assert_eq!(conn.priority, 10);
        assert_eq!(conn.config, mqtt_config);

        // Verify connection shows up in device fetch
        let fetched = service.get_device(&device.id).await.unwrap().unwrap();
        assert_eq!(fetched.connections.len(), 1);

        // Remove connection
        assert!(service.remove_connection(&conn.id).await.unwrap());
        assert!(!service.remove_connection(&conn.id).await.unwrap());

        let fetched = service.get_device(&device.id).await.unwrap().unwrap();
        assert!(fetched.connections.is_empty());
    }

    #[tokio::test]
    async fn test_update_connection() {
        let pool = setup_test_db().await;
        let service = DeviceService::new(pool);

        let device = service
            .create_device(CreateDeviceRequest {
                name: "Update Conn Device".to_string(),
                device_id: "uconn1".to_string(),
                profile_id: None,
                description: None,
                location: None,
            })
            .await
            .unwrap();

        let conn = service.add_connection(&device.id, CreateConnectionRequest {
            protocol: Protocol::WebSocket,
            enabled: Some(true),
            priority: Some(0),
            config: serde_json::json!({"url": "ws://10.0.0.1:8080/ws", "reconnect_interval_ms": 5000}),
        }).await.unwrap();

        let updated = service
            .update_connection(
                &conn.id,
                UpdateConnectionRequest {
                    enabled: Some(false),
                    priority: Some(5),
                    config: None,
                },
            )
            .await
            .unwrap();

        assert!(updated.is_some());
        let updated = updated.unwrap();
        assert!(!updated.enabled);
        assert_eq!(updated.priority, 5);
    }

    #[tokio::test]
    async fn test_cascade_delete_connections() {
        let pool = setup_test_db().await;
        let service = DeviceService::new(pool);

        let device = service
            .create_device(CreateDeviceRequest {
                name: "Cascade Device".to_string(),
                device_id: "casc1".to_string(),
                profile_id: None,
                description: None,
                location: None,
            })
            .await
            .unwrap();

        service
            .add_connection(
                &device.id,
                CreateConnectionRequest {
                    protocol: Protocol::Mqtt,
                    enabled: None,
                    priority: None,
                    config: serde_json::json!({"topic_prefix": "roaster/casc1", "qos": 0}),
                },
            )
            .await
            .unwrap();

        service.add_connection(&device.id, CreateConnectionRequest {
            protocol: Protocol::ModbusTcp,
            enabled: None,
            priority: None,
            config: serde_json::json!({"host": "10.0.0.1", "port": 502, "unit_id": 1, "poll_interval_ms": 1000}),
        }).await.unwrap();

        // Delete device should cascade delete connections
        assert!(service.delete_device(&device.id).await.unwrap());

        // Connections should be gone (we can verify by trying to get the device)
        let fetched = service.get_device(&device.id).await.unwrap();
        assert!(fetched.is_none());
    }

    // ---- Register Map Tests ----

    #[tokio::test]
    async fn test_set_and_get_register_map() {
        let pool = setup_test_db().await;
        let service = DeviceService::new(pool);

        let device = service
            .create_device(CreateDeviceRequest {
                name: "Modbus Device".to_string(),
                device_id: "modbus1".to_string(),
                profile_id: None,
                description: None,
                location: None,
            })
            .await
            .unwrap();

        let registers = vec![
            CreateRegisterMapEntry {
                register_type: ModbusRegisterType::Input,
                address: 0,
                name: "bean_temp_hi".to_string(),
                data_type: ModbusDataType::Float32,
                byte_order: Some("ABCD".to_string()),
                scale_factor: Some(1.0),
                offset: Some(0.0),
                unit: Some("C".to_string()),
                description: Some("Bean temperature (high word)".to_string()),
                writable: Some(false),
            },
            CreateRegisterMapEntry {
                register_type: ModbusRegisterType::Holding,
                address: 0,
                name: "setpoint".to_string(),
                data_type: ModbusDataType::Float32,
                byte_order: Some("ABCD".to_string()),
                scale_factor: Some(1.0),
                offset: Some(0.0),
                unit: Some("C".to_string()),
                description: Some("Target setpoint".to_string()),
                writable: Some(true),
            },
        ];

        let result = service
            .set_register_map(&device.id, registers)
            .await
            .unwrap();
        assert_eq!(result.len(), 2);

        let fetched = service.get_register_map(&device.id).await.unwrap();
        assert_eq!(fetched.len(), 2);
        // Ordered by register_type, address
        assert_eq!(fetched[0].name, "setpoint"); // holding comes before input alphabetically
        assert_eq!(fetched[1].name, "bean_temp_hi");
    }

    #[tokio::test]
    async fn test_set_register_map_replaces_existing() {
        let pool = setup_test_db().await;
        let service = DeviceService::new(pool);

        let device = service
            .create_device(CreateDeviceRequest {
                name: "Replace Map Device".to_string(),
                device_id: "rmap1".to_string(),
                profile_id: None,
                description: None,
                location: None,
            })
            .await
            .unwrap();

        // Set initial map
        service
            .set_register_map(
                &device.id,
                vec![CreateRegisterMapEntry {
                    register_type: ModbusRegisterType::Input,
                    address: 0,
                    name: "old_register".to_string(),
                    data_type: ModbusDataType::Uint16,
                    byte_order: None,
                    scale_factor: None,
                    offset: None,
                    unit: None,
                    description: None,
                    writable: None,
                }],
            )
            .await
            .unwrap();

        // Replace with new map
        service
            .set_register_map(
                &device.id,
                vec![
                    CreateRegisterMapEntry {
                        register_type: ModbusRegisterType::Holding,
                        address: 0,
                        name: "new_register_1".to_string(),
                        data_type: ModbusDataType::Float32,
                        byte_order: None,
                        scale_factor: None,
                        offset: None,
                        unit: None,
                        description: None,
                        writable: None,
                    },
                    CreateRegisterMapEntry {
                        register_type: ModbusRegisterType::Holding,
                        address: 2,
                        name: "new_register_2".to_string(),
                        data_type: ModbusDataType::Uint16,
                        byte_order: None,
                        scale_factor: None,
                        offset: None,
                        unit: None,
                        description: None,
                        writable: None,
                    },
                ],
            )
            .await
            .unwrap();

        let fetched = service.get_register_map(&device.id).await.unwrap();
        assert_eq!(fetched.len(), 2);
        // Old register should be gone
        assert!(fetched.iter().all(|r| r.name != "old_register"));
        assert!(fetched.iter().any(|r| r.name == "new_register_1"));
        assert!(fetched.iter().any(|r| r.name == "new_register_2"));
    }

    #[tokio::test]
    async fn test_cascade_delete_register_maps() {
        let pool = setup_test_db().await;
        let service = DeviceService::new(pool);

        let device = service
            .create_device(CreateDeviceRequest {
                name: "Cascade Reg Device".to_string(),
                device_id: "creg1".to_string(),
                profile_id: None,
                description: None,
                location: None,
            })
            .await
            .unwrap();

        service
            .set_register_map(
                &device.id,
                vec![CreateRegisterMapEntry {
                    register_type: ModbusRegisterType::Input,
                    address: 0,
                    name: "temp".to_string(),
                    data_type: ModbusDataType::Float32,
                    byte_order: None,
                    scale_factor: None,
                    offset: None,
                    unit: None,
                    description: None,
                    writable: None,
                }],
            )
            .await
            .unwrap();

        // Delete device should cascade delete register maps
        service.delete_device(&device.id).await.unwrap();

        // Verify register maps are gone
        let registers = service.get_register_map(&device.id).await.unwrap();
        assert!(registers.is_empty());
    }

    // ---- Roast Profile CRUD Tests ----

    #[tokio::test]
    async fn test_profile_update_round_trip() {
        let pool = setup_test_db().await;
        let service = RoastSessionService::new(pool);

        // Create a profile with initial points
        let created = service
            .create_profile(CreateProfileRequest {
                name: "Original Profile".to_string(),
                description: Some("Initial description".to_string()),
                target_total_time: Some(600),
                target_first_crack: None,
                target_end_temp: Some(210.0),
                preheat_temp: None,
                charge_temp: Some(180.0),
                points: vec![
                    CreateProfilePointRequest {
                        time_seconds: 0,
                        target_temp: 180.0,
                        fan_speed: Some(80),
                        notes: None,
                        target_env_temp: None,
                    },
                    CreateProfilePointRequest {
                        time_seconds: 300,
                        target_temp: 200.0,
                        fan_speed: None,
                        notes: None,
                        target_env_temp: None,
                    },
                ],
            })
            .await
            .unwrap();

        assert_eq!(created.profile.name, "Original Profile");
        assert_eq!(created.points.len(), 2);

        // Update the profile with new metadata and different points
        let updated = service
            .update_profile(
                &created.profile.id,
                CreateProfileRequest {
                    name: "Updated Profile".to_string(),
                    description: Some("Updated description".to_string()),
                    target_total_time: Some(720),
                    target_first_crack: Some(360),
                    target_end_temp: Some(220.0),
                    preheat_temp: None,
                    charge_temp: Some(185.0),
                    points: vec![
                        CreateProfilePointRequest {
                            time_seconds: 0,
                            target_temp: 185.0,
                            fan_speed: Some(90),
                            notes: None,
                            target_env_temp: None,
                        },
                        CreateProfilePointRequest {
                            time_seconds: 200,
                            target_temp: 195.0,
                            fan_speed: None,
                            notes: None,
                            target_env_temp: None,
                        },
                        CreateProfilePointRequest {
                            time_seconds: 500,
                            target_temp: 220.0,
                            fan_speed: Some(60),
                            notes: Some("Finish".to_string()),
                            target_env_temp: None,
                        },
                    ],
                },
            )
            .await
            .unwrap();

        let updated = updated.expect("Profile should exist");
        assert_eq!(updated.profile.name, "Updated Profile");
        assert_eq!(
            updated.profile.description,
            Some("Updated description".to_string())
        );
        assert_eq!(updated.profile.target_total_time, Some(720));
        assert_eq!(updated.profile.target_first_crack, Some(360));
        assert_eq!(updated.profile.charge_temp, Some(185.0));
        assert_eq!(updated.points.len(), 3);
        assert_eq!(updated.points[0].target_temp, 185.0);
        assert_eq!(updated.points[2].notes, Some("Finish".to_string()));

        // Verify old points were replaced (not accumulated)
        let fetched = service
            .get_profile_with_points(&created.profile.id)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(fetched.points.len(), 3);

        // Update non-existent profile returns None
        let missing = service
            .update_profile(
                "nonexistent-id",
                CreateProfileRequest {
                    name: "Ghost".to_string(),
                    description: None,
                    target_total_time: None,
                    target_first_crack: None,
                    target_end_temp: None,
                    preheat_temp: None,
                    charge_temp: None,
                    points: vec![],
                },
            )
            .await
            .unwrap();

        assert!(missing.is_none());
    }

    // ---- Session Completion Statistics Tests ----

    #[tokio::test]
    async fn test_complete_session_computes_dtr_and_weight_loss() {
        let pool = setup_test_db().await;
        let service = RoastSessionService::new(pool);

        // Create a session with green and roasted weights
        let session = service
            .create_session(CreateSessionRequest {
                name: "Stats Test Roast".to_string(),
                device_id: "esp32-001".to_string(),
                profile_id: None,
                bean_origin: Some("Ethiopia".to_string()),
                bean_variety: Some("Yirgacheffe".to_string()),
                green_weight: Some(200.0),
                target_roast_level: Some("medium".to_string()),
                notes: None,
                ambient_temp: None,
                humidity: None,
            })
            .await
            .unwrap();

        // Start the session
        let session = service.start_session(&session.id).await.unwrap().unwrap();
        assert_eq!(session.status, SessionStatus::Active);

        // Set roasted weight via update
        service
            .update_session(
                &session.id,
                UpdateSessionRequest {
                    name: None,
                    roasted_weight: Some(170.0),
                    notes: None,
                    first_crack_time: None,
                    development_time_ratio: None,
                },
            )
            .await
            .unwrap();

        // Add telemetry points spanning 600 seconds with varying RoR
        for i in 0..=600 {
            if i % 10 == 0 {
                let elapsed = i as f32;
                let bean_temp = 100.0 + (elapsed / 600.0) * 120.0; // 100→220°C
                let ror = if elapsed < 200.0 {
                    15.0 // drying phase
                } else if elapsed < 400.0 {
                    12.0 // maillard phase
                } else {
                    8.0 // development phase
                };
                service
                    .add_telemetry_point(
                        &session.id,
                        elapsed,
                        Some(bean_temp),
                        Some(bean_temp + 20.0),
                        Some(ror),
                        Some(80),
                        Some(200),
                        Some(bean_temp),
                    )
                    .await
                    .unwrap();
            }
        }

        // Add roast events for phase boundaries
        service
            .create_roast_event(
                &session.id,
                CreateRoastEventRequest {
                    event_type: RoastEventType::DryingEnd,
                    elapsed_seconds: 200.0,
                    temperature: Some(140.0),
                    notes: None,
                },
            )
            .await
            .unwrap();

        service
            .create_roast_event(
                &session.id,
                CreateRoastEventRequest {
                    event_type: RoastEventType::FirstCrackStart,
                    elapsed_seconds: 400.0,
                    temperature: Some(200.0),
                    notes: None,
                },
            )
            .await
            .unwrap();

        // Complete the session
        let completed = service
            .complete_session(&session.id)
            .await
            .unwrap()
            .expect("session should be returned");

        assert_eq!(completed.status, SessionStatus::Completed);

        // DTR: (600 - 400) / 600 = 200/600 ≈ 0.333
        let dtr = completed.development_time_ratio.unwrap();
        assert!(
            (dtr - 0.333).abs() < 0.01,
            "DTR should be ~0.333, got {dtr}"
        );

        // Weight loss: (200 - 170) / 200 * 100 = 15%
        let wl = completed.weight_loss_pct.unwrap();
        assert!(
            (wl - 15.0).abs() < 0.1,
            "Weight loss should be 15%, got {wl}"
        );

        // Max RoR should be 15.0
        let max_ror = completed.max_ror.unwrap();
        assert!(
            (max_ror - 15.0).abs() < 0.1,
            "Max RoR should be 15.0, got {max_ror}"
        );

        // First crack time should be 400 seconds
        assert_eq!(completed.first_crack_time, Some(400));

        // Drying end fields
        assert_eq!(completed.drying_end_time, Some(200));
        assert_eq!(completed.drying_end_temp, Some(140.0));

        // Phase avg RoR values
        let avg_dry = completed.avg_ror_drying.unwrap();
        assert!(
            (avg_dry - 15.0).abs() < 0.1,
            "Avg RoR drying should be ~15.0, got {avg_dry}"
        );

        let avg_mail = completed.avg_ror_maillard.unwrap();
        assert!(
            (avg_mail - 12.0).abs() < 0.1,
            "Avg RoR maillard should be ~12.0, got {avg_mail}"
        );

        let avg_dev = completed.avg_ror_development.unwrap();
        assert!(
            (avg_dev - 8.0).abs() < 0.1,
            "Avg RoR development should be ~8.0, got {avg_dev}"
        );
    }

    #[tokio::test]
    async fn test_complete_session_computes_auc() {
        let pool = setup_test_db().await;
        let service = RoastSessionService::new(pool);

        // Create and start a session
        let session = service
            .create_session(CreateSessionRequest {
                name: "AUC Test Roast".to_string(),
                device_id: "esp32-001".to_string(),
                profile_id: None,
                bean_origin: None,
                bean_variety: None,
                green_weight: None,
                target_roast_level: None,
                notes: None,
                ambient_temp: None,
                humidity: None,
            })
            .await
            .unwrap();
        service.start_session(&session.id).await.unwrap();

        // 3-point linear curve: (0s, 100°C), (60s, 100°C), (120s, 200°C)
        // With base_temp=0 (default):
        //   Segment 1: dt=60, avg_temp=(100+100)/2=100 → area = 60*100 = 6000 °C·s
        //   Segment 2: dt=60, avg_temp=(100+200)/2=150 → area = 60*150 = 9000 °C·s
        //   Total = 15000 °C·s = 250 °C·min
        service
            .add_telemetry_point(&session.id, 0.0, Some(100.0), None, None, None, None, None)
            .await
            .unwrap();
        service
            .add_telemetry_point(&session.id, 60.0, Some(100.0), None, None, None, None, None)
            .await
            .unwrap();
        service
            .add_telemetry_point(
                &session.id,
                120.0,
                Some(200.0),
                None,
                None,
                None,
                None,
                None,
            )
            .await
            .unwrap();

        let completed = service
            .complete_session(&session.id)
            .await
            .unwrap()
            .expect("session should be returned");

        let auc = completed.auc_value.unwrap();
        assert!(
            (auc - 250.0).abs() < 0.1,
            "AUC should be 250.0 °C·min, got {auc}"
        );
    }

    #[tokio::test]
    async fn test_cupping_crud() {
        let pool = setup_test_db().await;
        let service = RoastSessionService::new(pool);

        // Create a session
        let session = service
            .create_session(CreateSessionRequest {
                name: "Cupping Test".to_string(),
                device_id: "esp32-001".to_string(),
                profile_id: None,
                bean_origin: Some("Ethiopia".to_string()),
                bean_variety: None,
                green_weight: None,
                target_roast_level: None,
                notes: None,
                ambient_temp: None,
                humidity: None,
            })
            .await
            .unwrap();

        // No cupping initially
        let cupping = service.get_cupping(&session.id).await.unwrap();
        assert!(cupping.is_none());

        // Create cupping with attributes
        let result = service
            .create_cupping(
                &session.id,
                CreateCuppingRequest {
                    scoring_framework: Some("sca".to_string()),
                    notes: Some("Floral, bright".to_string()),
                    attributes: vec![
                        CreateCuppingAttributeRequest {
                            name: "aroma".to_string(),
                            score: 8.0,
                        },
                        CreateCuppingAttributeRequest {
                            name: "acidity".to_string(),
                            score: 7.5,
                        },
                        CreateCuppingAttributeRequest {
                            name: "body".to_string(),
                            score: 7.0,
                        },
                    ],
                },
            )
            .await
            .unwrap();

        assert_eq!(result.cupping.session_id, session.id);
        assert_eq!(result.cupping.scoring_framework, "sca");
        assert_eq!(result.cupping.notes, Some("Floral, bright".to_string()));
        // overall_score = (8.0 + 7.5 + 7.0) / 3 = 7.5
        let overall = result.cupping.overall_score.unwrap();
        assert!((overall - 7.5).abs() < 0.01);
        assert_eq!(result.attributes.len(), 3);

        // Fetch cupping
        let fetched = service.get_cupping(&session.id).await.unwrap().unwrap();
        assert_eq!(fetched.cupping.id, result.cupping.id);
        assert_eq!(fetched.attributes.len(), 3);

        // Cupping included in session with telemetry
        let swt = service
            .get_session_with_telemetry(&session.id)
            .await
            .unwrap()
            .unwrap();
        assert!(swt.cupping.is_some());
        assert_eq!(swt.cupping.unwrap().attributes.len(), 3);

        // Delete cupping
        service.delete_cupping(&session.id).await.unwrap();
        let gone = service.get_cupping(&session.id).await.unwrap();
        assert!(gone.is_none());
    }

    #[tokio::test]
    async fn test_export_csv_and_artisan() {
        let pool = setup_test_db().await;
        let service = RoastSessionService::new(pool);

        // Create a session with metadata
        let session = service
            .create_session(CreateSessionRequest {
                name: "Export Test".to_string(),
                device_id: "esp32-001".to_string(),
                profile_id: None,
                bean_origin: Some("Colombia".to_string()),
                bean_variety: Some("Caturra".to_string()),
                green_weight: Some(200.0),
                target_roast_level: None,
                notes: None,
                ambient_temp: None,
                humidity: None,
            })
            .await
            .unwrap();

        // Start session
        service.start_session(&session.id).await.unwrap();

        // Add telemetry
        for i in 0..5 {
            let elapsed = i as f32 * 60.0;
            let bt = 100.0 + i as f32 * 20.0;
            let et = bt + 30.0;
            service
                .add_telemetry_point(
                    &session.id,
                    elapsed,
                    Some(bt),
                    Some(et),
                    None,
                    None,
                    None,
                    None,
                )
                .await
                .unwrap();
        }

        // Add an event
        service
            .create_roast_event(
                &session.id,
                CreateRoastEventRequest {
                    event_type: RoastEventType::FirstCrackStart,
                    elapsed_seconds: 180.0,
                    temperature: Some(180.0),
                    notes: None,
                },
            )
            .await
            .unwrap();

        // Test CSV export
        let (csv, csv_filename) = service.export_csv(&session.id).await.unwrap().unwrap();
        assert!(csv_filename.starts_with("Export_Test_"));
        assert!(csv_filename.ends_with(".csv"));
        assert!(csv.contains("# Session: Export Test"));
        assert!(csv.contains("# Bean: Colombia (Caturra)"));
        assert!(csv.contains("elapsed_seconds,bean_temp,env_temp"));
        // Check we have data rows (header + 5 telemetry points)
        let data_lines: Vec<&str> = csv.lines().filter(|l| !l.starts_with('#')).collect();
        assert_eq!(data_lines.len(), 6); // 1 header + 5 data rows

        // Test Artisan JSON export
        let (alog, alog_filename) = service
            .export_artisan_json(&session.id)
            .await
            .unwrap()
            .unwrap();
        assert!(alog_filename.starts_with("Export_Test_"));
        assert!(alog_filename.ends_with(".alog"));
        assert_eq!(alog["title"], "Export Test");
        assert_eq!(alog["beans"], "Colombia");
        let timex = alog["timex"].as_array().unwrap();
        assert_eq!(timex.len(), 5);
        let temp2 = alog["temp2"].as_array().unwrap();
        assert_eq!(temp2.len(), 5);
        // First BT should be 100.0
        assert!((temp2[0].as_f64().unwrap() - 100.0).abs() < 0.1);
        // timeindex should have FCs mapped
        let timeindex = alog["timeindex"].as_array().unwrap();
        assert_eq!(timeindex.len(), 8);
        // CHARGE at index 0
        assert_eq!(timeindex[0], 0);
        // FCs should be at index 3 in telemetry (180s is closest to 180.0)
        assert_eq!(timeindex[2], 3);
    }
}
