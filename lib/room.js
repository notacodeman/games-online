// A room is one game on the site: a game's own state (lib/<game>/game.js) plus what the site needs around it —
// which game it is, and whether it's listed publicly on the start page. The server goes through here, never
// straight to an engine, so every game gets the same lobby listing and visibility setting.

import { gameFor, DEFAULT_GAME } from './games.js';
import { GameError } from './errors.js';

export const engineOf = state => gameFor(state.game || DEFAULT_GAME).engine;

export function createRoom(gameId, code, { rules, isPublic }, now) {
  const game = gameFor(gameId);
  if (!game) throw new GameError('Pick one of the games on the list.');
  const state = game.engine.newGame(code, rules, now);
  state.game = game.id;
  state.public = !!isPublic;
  return state;
}

export function applyRoomAction(state, playerId, action, now) {
  if (action?.type === 'setPublic') {
    if (state.hostId !== playerId) throw new GameError('Only the host can do that.');
    state.public = !!action.public;
    state.version += 1;
    return state;
  }
  return engineOf(state).applyAction(state, playerId, action, now);
}

export const roomView = (state, playerId, now) =>
  ({ ...engineOf(state).viewFor(state, playerId, now), game: state.game || DEFAULT_GAME, public: !!state.public });

// The columns kept next to the state so the public list can be read without parsing every game.
export function roomSummary(state) {
  const host = state.players.find(p => p.id === state.hostId);
  return {
    game: state.game || DEFAULT_GAME,
    public: state.public ? 1 : 0,
    phase: state.phase,
    host_name: host ? host.name : '',
    humans: state.players.filter(p => !p.bot).length,
    players: state.players.length,
  };
}
