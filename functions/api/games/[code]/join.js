// POST /api/games/<code>/join { name }: takes a seat in a game that hasn't started. Returns { token, playerId, view }.

import { json, fail, readJson } from '../../../../lib/api.js';
import { GameError } from '../../../../lib/errors.js';
import { engineOf, roomView } from '../../../../lib/room.js';
import { updateGame, makeToken, sha256 } from '../../../../lib/store.js';
import { overLimit, limitMessage } from '../../../../lib/limits.js';

export async function onRequestPost({ env, request, params }) {
  const body = await readJson(request);
  if (!body) return fail('Expected your name as JSON.');
  if (await overLimit(env, request, 'join')) return fail(limitMessage('join'), 429);
  const token = makeToken();
  const tokenHash = await sha256(token);
  const now = Date.now();
  const done = await updateGame(env, params.code, state => {
    if (state.phase !== 'lobby') throw new GameError('This game has already started. You can watch it, or ask the host to start a new one.');
    const player = engineOf(state).addPlayer(state, { name: body.name, tokenHash });
    state.log.push({ at: now, text: `${player.name} joined.` });
    state.version += 1;
    return player;
  });
  if (!done) return fail('No game with that code.', 404);
  return json({ ok: true, token, playerId: done.result.id, view: roomView(done.state, done.result.id, now) });
}
