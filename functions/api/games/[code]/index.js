// GET /api/games/<code>[?since=<version>]: the game as the X-Player-Token's player sees it (a spectator without one).
// Also makes any automatic move that is due (a bot's turn, a bot catching someone, the turn timer), since Pages
// Functions only run when asked: everyone's polling is what keeps a game moving.
// With ?since and nothing new, returns { unchanged: true } so polling stays cheap.

import { json, fail } from '../../../../lib/api.js';
import { engineOf, roomView } from '../../../../lib/room.js';
import { loadGame, saveGame, playerFor } from '../../../../lib/store.js';
import { overLimit, limitMessage } from '../../../../lib/limits.js';

export async function onRequestGet({ env, request, params }) {
  let state = await loadGame(env, params.code);
  if (!state) {
    // only wrong codes count here, so polling a real game is never limited but guessing codes is
    if (await overLimit(env, request, 'miss')) return fail(limitMessage('miss'), 429);
    return fail('No game with that code. It may have ended over a day ago.', 404);
  }
  const now = Date.now();
  const readVersion = state.version;
  if (engineOf(state).advance(state, now) && !(await saveGame(env, state, readVersion))) {
    state = await loadGame(env, params.code);   // someone else moved first: show theirs
  }
  const player = await playerFor(state, request);
  const since = Number(new URL(request.url).searchParams.get('since'));
  if (since && since === state.version) return json({ ok: true, unchanged: true, version: state.version, serverNow: now });
  return json({ ok: true, view: roomView(state, player?.id || null, now), removed: !player && request.headers.has('X-Player-Token') });
}
