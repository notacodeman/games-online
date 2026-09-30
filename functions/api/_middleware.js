// Runs before every /api/* route: refuses big bodies, explains a missing database setup instead of a bare 500,
// turns refused moves into readable errors, and starts the hourly clear-out of idle games after responding.

import { fail } from '../../lib/api.js';
import { GameError } from '../../lib/errors.js';
import { maybeSweep } from '../../lib/store.js';

const MAX_BODY_BYTES = 16 * 1024;

export async function onRequest({ env, next, request, waitUntil }) {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
    if (Number(request.headers.get('Content-Length') || 0) > MAX_BODY_BYTES) return fail('That request is too big.', 413);
  }
  if (!env.DB) {
    return fail('The site has no D1 database bound as DB. In the Pages project: Settings → Bindings → add a D1 '
      + 'database binding named DB, then redeploy.', 500);
  }
  try {
    const response = await next();
    waitUntil(maybeSweep(env).catch(err => console.error('sweep failed', err)));
    return response;
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
