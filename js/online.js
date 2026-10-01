// An online game: polls the API for the latest view and sends moves. Same interface as js/practice.js:
// { view, playerId, send(action), subscribe(fn), stop() }.

import { api, seats } from './util.js';
import { gameFor } from '../lib/games.js';

// How often to ask for news, by how soon something may happen (each engine's pollPace), in milliseconds.
// Every poll is a paid Function request, so waiting is slow and only "your turn is next" is fast.
const POLL_MS = { fast: 1000, normal: 2000, slow: 3000 };
const POLL_HIDDEN_MS = { fast: 2000, normal: 6000, slow: 6000 };   // a background tab
const RETRY_MS = 4000;         // after a failed poll

export class OnlineGame {
  constructor(code, seat, view) {
    this.kind = 'online';
    this.code = code;
    this.token = seat?.token || null;
    this.playerId = seat?.playerId || null;
    this.view = view || null;
    this.listeners = new Set();
    this.stopped = false;
    this.timer = null;
    this.onVisible = () => { if (!document.hidden) this.pollSoon(0); };
    document.addEventListener('visibilitychange', this.onVisible);
    this.pollSoon(0);
  }

  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  setView(view) {
    if (this.view && view.version < this.view.version) return;   // an older answer arriving late
    this.view = view;
    for (const fn of this.listeners) fn(view);
  }
  emitError(error) { for (const fn of this.listeners) fn(null, error); }

  // the wait before the next poll, from the latest view
  pollDelay() {
    const pace = (this.view && gameFor(this.view.game)?.engine.pollPace?.(this.view)) || 'fast';
    return (document.hidden ? POLL_HIDDEN_MS : POLL_MS)[pace] || POLL_MS.fast;
  }

  pollSoon(delay) {
    clearTimeout(this.timer);
    if (!this.stopped) this.timer = setTimeout(() => this.poll(), delay);
  }

  async poll() {
    let next = null;
    try {
      const since = this.view ? `?since=${this.view.version}` : '';
      const body = await api(`/api/games/${this.code}${since}`, { token: this.token });
      if (body.removed) {
        seats.set(this.code, null);
        this.token = null;
        this.playerId = null;
      }
      if (body.view) this.setView(body.view);
      next = this.pollDelay();
    } catch (error) {
      next = RETRY_MS;
      this.emitError(error);
      if (error.status === 404) next = null;
    }
    if (next !== null) this.pollSoon(next);
  }

  async send(action) {
    const body = await api(`/api/games/${this.code}/action`, { json: action, token: this.token });
    this.setView(body.view);
    this.pollSoon(this.pollDelay());
    return body.view;
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    document.removeEventListener('visibilitychange', this.onVisible);
  }
}
