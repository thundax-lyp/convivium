export const CURRENT_SCHEMA_VERSION = 6;

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
  request_hash TEXT NOT NULL,
  meeting_version INTEGER NOT NULL,
  event_seqs_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY(request_id, command_kind, caller_binding)
);
CREATE TABLE IF NOT EXISTS outbox (
  id TEXT PRIMARY KEY,
  meeting_id TEXT NOT NULL REFERENCES meeting_bootstrap(meeting_id),
  delivery_id TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 50,
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
CREATE TABLE IF NOT EXISTS meeting_bootstrap (
  meeting_id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('creating', 'ready', 'creation_failed')),
  create_request_id TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  result_json TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  failure_code TEXT
);
CREATE TABLE IF NOT EXISTS session_ownership (
  session_id TEXT PRIMARY KEY,
  meeting_id TEXT NOT NULL REFERENCES meeting_bootstrap(meeting_id),
  parent_session_id TEXT NOT NULL,
  session_label TEXT NOT NULL,
  provider TEXT NOT NULL,
  initial_message_id TEXT,
  role TEXT NOT NULL CHECK (role IN ('manager', 'participant')),
  participant_id TEXT,
  lifecycle_status TEXT NOT NULL CHECK (lifecycle_status IN ('provisioning', 'active', 'closed')),
  capability_status TEXT NOT NULL CHECK (capability_status IN ('active', 'revoked')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(meeting_id, session_label)
);
CREATE INDEX IF NOT EXISTS session_ownership_meeting ON session_ownership(meeting_id, lifecycle_status, capability_status);
CREATE TABLE IF NOT EXISTS meeting_mail (
  mail_id TEXT PRIMARY KEY,
  meeting_id TEXT NOT NULL REFERENCES meeting_bootstrap(meeting_id),
  sender_participant_id TEXT NOT NULL,
  recipient_participant_id TEXT NOT NULL,
  content TEXT NOT NULL,
  context_json TEXT NOT NULL,
  reply_to_mail_id TEXT,
  handling_attempt_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'processed', 'obsolete', 'failed', 'timed_out', 'cancelled')),
  snapshot_through_seq INTEGER NOT NULL,
  processing_through_seq INTEGER,
  delivery_id TEXT UNIQUE,
  deadline_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  CHECK (
    (status = 'pending' AND processing_through_seq IS NULL AND delivery_id IS NULL AND deadline_at IS NULL)
    OR (status IN ('processing', 'processed', 'obsolete', 'failed', 'timed_out') AND processing_through_seq IS NOT NULL AND delivery_id IS NOT NULL AND deadline_at IS NOT NULL)
    OR (status = 'cancelled' AND ((processing_through_seq IS NULL AND delivery_id IS NULL AND deadline_at IS NULL) OR (processing_through_seq IS NOT NULL AND delivery_id IS NOT NULL AND deadline_at IS NOT NULL)))
  )
);
CREATE INDEX IF NOT EXISTS meeting_mail_pending ON meeting_mail(meeting_id, recipient_participant_id, status, deadline_at, created_at);
`;
