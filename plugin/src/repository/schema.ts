export const CURRENT_SCHEMA_VERSION = 1;

export const CURRENT_SCHEMA = `
CREATE TABLE IF NOT EXISTS meetings (
  team_id TEXT NOT NULL,
  meeting_id TEXT PRIMARY KEY,
  version INTEGER NOT NULL CHECK (version >= 0),
  state_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS meeting_events (
  event_seq INTEGER PRIMARY KEY AUTOINCREMENT,
  meeting_id TEXT NOT NULL REFERENCES meetings(meeting_id),
  meeting_version INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  turn_id TEXT,
  attempt_id TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS meeting_events_meeting_seq ON meeting_events(meeting_id, event_seq);
CREATE TABLE IF NOT EXISTS idempotency_receipts (
  request_id TEXT NOT NULL,
  command_kind TEXT NOT NULL,
  caller_binding TEXT NOT NULL,
  result_json TEXT NOT NULL,
  meeting_version INTEGER NOT NULL,
  event_seqs_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY(request_id, command_kind, caller_binding)
);
CREATE TABLE IF NOT EXISTS outbox (
  id TEXT PRIMARY KEY,
  meeting_id TEXT NOT NULL REFERENCES meetings(meeting_id),
  delivery_id TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'leased', 'delivered', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  available_at INTEGER NOT NULL,
  lease_owner TEXT,
  lease_token TEXT,
  lease_deadline INTEGER,
  delivered_at INTEGER,
  failed_at INTEGER,
  last_error TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS outbox_claim_order ON outbox(status, available_at, lease_deadline, created_at);
`;
