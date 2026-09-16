export const NIGHTWATCH_SQLITE_SCHEMA = `
CREATE TABLE IF NOT EXISTS ring_events (
  id TEXT PRIMARY KEY,
  timestamp TEXT NOT NULL,
  device_id TEXT NOT NULL,
  device_name TEXT NOT NULL,
  location TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type = 'motion'),
  metadata_json TEXT NOT NULL,
  household_state TEXT NOT NULL CHECK (household_state IN ('sleeping', 'active')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ring_events_timestamp ON ring_events(timestamp DESC);

CREATE TABLE IF NOT EXISTS household_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  household_state TEXT NOT NULL CHECK (household_state IN ('sleeping', 'active')),
  last_scenario TEXT NOT NULL CHECK (last_scenario IN ('ready', 'normal', 'unusual', 'repeated')),
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS alert_history (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'delivered')),
  message TEXT NOT NULL,
  reason TEXT NOT NULL,
  related_event_ids_json TEXT NOT NULL
);
`;
