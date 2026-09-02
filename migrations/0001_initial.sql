PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'member')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_seen_at TEXT
);

CREATE TABLE games (
  id TEXT PRIMARY KEY,
  game_type TEXT NOT NULL,
  state_schema_version INTEGER NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('lobby', 'active', 'finished', 'cancelled')),
  host_user_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 0,
  turn_number INTEGER NOT NULL DEFAULT 0,
  current_player_id TEXT,
  winner_team_index INTEGER,
  state_json TEXT NOT NULL,
  last_command_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  finished_at TEXT,
  FOREIGN KEY (host_user_id) REFERENCES users (id),
  FOREIGN KEY (current_player_id) REFERENCES users (id)
);

CREATE TABLE game_members (
  game_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  seat_index INTEGER,
  team_index INTEGER,
  membership_status TEXT NOT NULL CHECK (
    membership_status IN ('invited', 'accepted', 'declined', 'left')
  ),
  joined_at TEXT,
  PRIMARY KEY (game_id, user_id),
  UNIQUE (game_id, seat_index),
  FOREIGN KEY (game_id) REFERENCES games (id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users (id)
);

CREATE TABLE game_invites (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL,
  email TEXT NOT NULL COLLATE NOCASE,
  invited_by_user_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled')),
  created_at TEXT NOT NULL,
  responded_at TEXT,
  UNIQUE (game_id, email),
  FOREIGN KEY (game_id) REFERENCES games (id) ON DELETE CASCADE,
  FOREIGN KEY (invited_by_user_id) REFERENCES users (id)
);

CREATE TABLE game_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  turn_number INTEGER NOT NULL,
  actor_user_id TEXT,
  command_id TEXT NOT NULL,
  command_hash TEXT NOT NULL,
  event_type TEXT NOT NULL,
  public_payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (game_id, command_id),
  UNIQUE (game_id, version),
  FOREIGN KEY (game_id) REFERENCES games (id) ON DELETE CASCADE,
  FOREIGN KEY (actor_user_id) REFERENCES users (id)
);

CREATE INDEX idx_game_members_user ON game_members (user_id, game_id);
CREATE INDEX idx_games_status_updated ON games (status, updated_at DESC);
CREATE INDEX idx_games_current_player
  ON games (current_player_id, status, updated_at DESC);
CREATE INDEX idx_game_invites_email_status
  ON game_invites (email, status, created_at DESC);
CREATE INDEX idx_game_events_game_version ON game_events (game_id, version);
