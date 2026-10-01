// Games in D1. Each game is one row: its whole state as JSON plus a version number. Every write checks the version
// it read, so two moves arriving at once can't overwrite each other; the loser just reads again and retries.

import { GameError } from './errors.js';
import { roomSummary } from './room.js';

// no 0/O or 1/I/L, so a code read out loud is easy to type
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 5;
// Games are deleted after this long without a change (polling doesn't count, moves and joins do):
export const EMPTY_IDLE_MINUTES = 2;        // no people left in it, only bots
export const OPEN_IDLE_MINUTES = 15;        // a lobby, or a game being played (a turn timer keeps a real game moving)
export const FINISHED_IDLE_MINUTES = 60;    // a finished game, so people can look at the result
export const LIST_FRESH_MINUTES = 15;       // public games show on the start page if something happened this recently
export const LIST_LIMIT = 40;
const SWEEP_EVERY_MS = 5 * 60 * 1000;
const WRITE_ATTEMPTS = 5;

export const makeCode = () =>
  [...crypto.getRandomValues(new Uint8Array(CODE_LENGTH))].map(b => ALPHABET[b % ALPHABET.length]).join('');
export const cleanCode = code => String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
export const makeToken = () => crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');

export async function sha256(text) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function loadGame(env, code) {
  const row = await env.DB.prepare('SELECT state FROM games WHERE code = ?').bind(cleanCode(code)).first();
  return row ? JSON.parse(row.state) : null;
}

// Saves the state if nobody else saved since `readVersion`. Returns false when someone did.
export async function saveGame(env, state, readVersion) {
  const s = roomSummary(state);
  const result = await env.DB.prepare(`UPDATE games SET state = ?, version = ?, game = ?, public = ?, phase = ?,
      host_name = ?, humans = ?, players = ?, updated_at = ? WHERE code = ? AND version = ?`)
    .bind(JSON.stringify(state), state.version, s.game, s.public, s.phase, s.host_name, s.humans, s.players,
      new Date().toISOString(), state.code, readVersion).run();
  return result.meta.changes === 1;
}

export async function insertGame(env, state) {
  const now = new Date().toISOString();
  const s = roomSummary(state);
  await env.DB.prepare(`INSERT INTO games (code, state, version, game, public, phase, host_name, humans, players,
      created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(state.code, JSON.stringify(state), state.version, s.game, s.public, s.phase, s.host_name, s.humans, s.players,
      now, now).run();
}

// Public games with someone in them and recent activity: open lobbies first, then games being played (to watch).
export async function listPublicGames(env) {
  const since = new Date(Date.now() - LIST_FRESH_MINUTES * 60000).toISOString();
  const { results } = await env.DB.prepare(`SELECT code, game, phase, host_name, humans, players, updated_at FROM games
      WHERE public = 1 AND humans > 0 AND phase != 'gameOver' AND updated_at > ?
      ORDER BY phase = 'lobby' DESC, updated_at DESC LIMIT ?`).bind(since, LIST_LIMIT).all();
  return results;
}

// Loads the game, runs change(state) on it and saves, retrying when another request saved first.
// change may throw a GameError (a refused move), which is passed on untouched.
export async function updateGame(env, code, change) {
  for (let attempt = 0; attempt < WRITE_ATTEMPTS; attempt++) {
    const state = await loadGame(env, code);
    if (!state) return null;
    const readVersion = state.version;
    const result = await change(state);
    if (state.version === readVersion) return { state, result };   // nothing changed, nothing to save
    if (await saveGame(env, state, readVersion)) return { state, result };
  }
  throw new GameError('The table is busy. Try that again.');
}

// The player the X-Player-Token header belongs to, or null (a spectator).
export async function playerFor(state, request) {
  const token = request.headers.get('X-Player-Token');
  if (!token) return null;
  const hash = await sha256(token);
  return state.players.find(p => p.tokenHash === hash) || null;
}

// Deletes idle games and old rate-limit counters, at most every 5 minutes. Pages Functions can't run on a schedule,
// so the start page's list and creating a game start it (functions/api/games/index.js), after the response is sent.
// Not game polls: checking on every poll was half of all database calls.
const minutesAgo = (now, minutes) => new Date(now - minutes * 60000).toISOString();
export async function maybeSweep(env) {
  const now = Date.now();
  const claimed = await env.DB.prepare(`INSERT INTO meta (key, value) VALUES ('last_sweep', ?1)
      ON CONFLICT (key) DO UPDATE SET value = ?1 WHERE CAST(meta.value AS INTEGER) < ?2 RETURNING value`)
    .bind(String(now), now - SWEEP_EVERY_MS).first();
  if (!claimed) return;
  await env.DB.prepare(`DELETE FROM games WHERE updated_at < ?1
      OR (humans = 0 AND updated_at < ?2) OR (phase != 'gameOver' AND updated_at < ?3)`)
    .bind(minutesAgo(now, FINISHED_IDLE_MINUTES), minutesAgo(now, EMPTY_IDLE_MINUTES), minutesAgo(now, OPEN_IDLE_MINUTES)).run();
  await env.DB.prepare('DELETE FROM rate_limits WHERE window < ?').bind(Math.floor(now / 1000) - 86400).run();
}
