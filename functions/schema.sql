-- D1 schema for games.codeman.club. Paste into the D1 database's Console and run it once.

-- One row per game. state is the whole game (lib/<game>/game.js) as JSON, hands and draw pile included;
-- the API only ever sends each player their own view of it. version goes up with every change.
-- game, public, phase, host_name, humans and players are copied out of state on every save (lib/room.js
-- roomSummary) so the start page's list of public games doesn't have to read every state.
CREATE TABLE IF NOT EXISTS games (
  code TEXT PRIMARY KEY,
  state TEXT NOT NULL,
  version INTEGER NOT NULL,
  game TEXT NOT NULL,                 -- id from lib/games.js, e.g. 'last-card'
  public INTEGER NOT NULL DEFAULT 0,  -- 1: listed on the start page
  phase TEXT NOT NULL,                -- lobby, playing, roundOver, gameOver
  host_name TEXT NOT NULL DEFAULT '',
  humans INTEGER NOT NULL DEFAULT 0,  -- seats held by people (not bots)
  players INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS games_by_updated ON games (updated_at);
CREATE INDEX IF NOT EXISTS games_public ON games (public, updated_at);

-- Rate limits (lib/limits.js): a counter per hashed connection per time window.
CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT NOT NULL,
  window INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (key, window)
);

-- Small settings the site keeps for itself, e.g. when idle games were last cleared out.
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
