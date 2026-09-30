// POST /api/games/<code>/action { type, … }: one move by the X-Player-Token's player (each game's ACTIONS lists its
// moves; lib/room.js adds setPublic).
// Returns the new view. A move the rules refuse comes back as a 409 with the reason.

import { json, fail, readJson } from '../../../../lib/api.js';
import { GameError } from '../../../../lib/errors.js';
import { applyRoomAction, roomView } from '../../../../lib/room.js';
import { updateGame, playerFor } from '../../../../lib/store.js';
import { overLimit, limitMessage } from '../../../../lib/limits.js';

export async function onRequestPost({ env, request, params }) {
  const action = await readJson(request);
  if (!action || typeof action.type !== 'string') return fail('Expected a move as JSON.');
  if (await overLimit(env, request, 'action')) return fail(limitMessage('action'), 429);
  const now = Date.now();
  let playerId = null;
  const done = await updateGame(env, params.code, async state => {
    const player = await playerFor(state, request);
    if (!player) throw new GameError('You’re not seated in this game (you may have been removed or replaced by a bot).');
    playerId = player.id;
    applyRoomAction(state, player.id, action, now);
  });
  if (!done) return fail('No game with that code.', 404);
  return json({ ok: true, view: roomView(done.state, playerId, now) });
}
