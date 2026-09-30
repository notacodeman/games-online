// Rate limits kept in D1: a counter per hashed connection per time window. No IP addresses are stored.

import { sha256 } from './store.js';

// [max requests, window in seconds] per connection
export const LIMITS = {
  create: [20, 3600],     // new games
  join: [40, 600],        // joining a game
  action: [300, 60],      // moves (a fast game is still far under this)
  miss: [30, 600],        // looking up a code that doesn't exist (stops guessing codes)
};

export async function overLimit(env, request, bucket) {
  const [max, windowSec] = LIMITS[bucket];
  const now = Math.floor(Date.now() / 1000);
  const key = `${bucket}:${(await sha256(`${bucket}|${request.headers.get('CF-Connecting-IP') || ''}`)).slice(0, 32)}`;
  const row = await env.DB.prepare(`INSERT INTO rate_limits (key, window, count) VALUES (?, ?, 1)
      ON CONFLICT (key, window) DO UPDATE SET count = count + 1 RETURNING count`)
    .bind(key, now - (now % windowSec)).first();
  return row.count > max;
}

export const limitMessage = bucket => {
  const minutes = Math.ceil(LIMITS[bucket][1] / 60);
  return `Too many requests from your connection. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`;
};
