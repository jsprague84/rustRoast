-- Cupping scores table
CREATE TABLE IF NOT EXISTS cupping_scores (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES roast_sessions(id) ON DELETE CASCADE,
    scoring_framework TEXT NOT NULL DEFAULT 'sca',
    overall_score REAL,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Cupping attributes table
CREATE TABLE IF NOT EXISTS cupping_attributes (
    id TEXT PRIMARY KEY,
    cupping_id TEXT NOT NULL REFERENCES cupping_scores(id) ON DELETE CASCADE,
    attribute_name TEXT NOT NULL,
    score REAL NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
