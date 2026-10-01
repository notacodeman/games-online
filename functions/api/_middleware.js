// Runs before every /api/* route: refuses big bodies, explains a missing database setup instead of a bare 500,
// and turns refused moves into readable errors. (The clear-out of idle games starts in functions/api/games/index.js.)

import { fail } from '../../lib/api.js';
import { GameError } from '../../lib/errors.js';

const MAX_BODY_BYTES = 16 * 1024;

export async function onRequest({ env, next, request }) {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
    if (Number(request.headers.get('Content-Length') || 0) > MAX_BODY_BYTES) return fail('That request is too big.', 413);
  }
  if (!env.DB) {
    return fail('The site has no D1 database bound as DB. In the Pages project: Settings → Bindings → add a D1 '
      + 'database binding named DB, then redeploy.', 500);
  }
  try {
    return await next();
  } catch (err) {
    if (err instanceof GameError) return fail(err.message, 409);
    const message = String(err?.message || err);
    console.error(new URL(request.url).pathname, message);
    if (/no such table/i.test(message)) {
      return fail(`The database is missing tables. Paste functions/schema.sql into the D1 database's Console and run it. (${message})`, 500);
    }
    return fail('Something went wrong on the server. Try again in a moment.', 500);
  }
}
