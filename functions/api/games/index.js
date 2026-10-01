// GET /api/games: public games for the start page's list.
// POST /api/games { game, name, rules, public }: a new lobby for that game, with the caller as host.
// Returns { code, token, playerId, view }. The token is only ever sent here; the browser keeps it to act as that player.

import { json, fail, readJson } from '../../../lib/api.js';
import { gameFor, GAMES } from '../../../lib/games.js';
import { createRoom, roomView, engineOf } from '../../../lib/room.js';
import { makeCode, makeToken, sha256, insertGame, listPublicGames, maybeSweep } from '../../../lib/store.js';
import { overLimit, limitMessage } from '../../../lib/limits.js';

// clears out idle games after the response is sent (at most every few minutes; see lib/store.js)
const sweepLater = (env, waitUntil) => waitUntil(maybeSweep(env).catch(err => console.error('sweep failed', err)));

export async function onRequestGet({ env, waitUntil }) {
  sweepLater(env, waitUntil);
  const rows = await listPublicGames(env);
  return json({
    ok: true,
    games: rows.filter(r => GAMES[r.game]).map(r => ({
      code: r.code, game: r.game, gameName: GAMES[r.game].name, host: r.host_name, phase: r.phase,
      players: r.players, maxPlayers: GAMES[r.game].maxPlayers, updatedAt: r.updated_at,
    })),
  });
}

export async function onRequestPost({ request, env, waitUntil }) {
  sweepLater(env, waitUntil);
  const body = await readJson(request);
  if (!body) return fail('Expected the game, your name and the rules as JSON.');
  if (!gameFor(body.game)) return fail('Pick one of the games on the list.');
  if (await overLimit(env, request, 'create')) return fail(limitMessage('create'), 429);
  const token = makeToken();
  const now = Date.now();
  // codes are random; on the rare clash, try another
  for (let attempt = 0; attempt < 5; attempt++) {
    const state = createRoom(body.game, makeCode(), { rules: body.rules, isPublic: body.public }, now);
    const host = engineOf(state).addPlayer(state, { name: body.name, tokenHash: await sha256(token) });
    try {
      await insertGame(env, state);
      return json({ ok: true, code: state.code, token, playerId: host.id, view: roomView(state, host.id, now) });
    } catch (err) {
      if (!/unique|constraint/i.test(String(err.message))) throw err;
    }
  }
  return fail('Couldn’t find a free game code. Try again.', 500);
}
