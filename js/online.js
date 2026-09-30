// An online game: polls the API for the latest view and sends moves. Same interface as js/practice.js:
// { view, playerId, send(action), subscribe(fn), stop() }.

import { api, seats } from './util.js';

const POLL_MS = 1000;          // while the tab is visible
const POLL_HIDDEN_MS = 4000;   // while it's in the background
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

  pollSoon(delay) {
    clearTimeout(this.timer);
    if (!this.stopped) this.timer = setTimeout(() => this.poll(), delay);
  }

  async poll() {
    let next = document.hidden ? POLL_HIDDEN_MS : POLL_MS;
    try {
      const since = this.view ? `?since=${this.view.version}` : '';
      const body = await api(`/api/games/${this.code}${since}`, { token: this.token });
      if (body.removed) {
        seats.set(this.code, null);
        this.token = null;
        this.playerId = null;
      }
      if (body.view) this.setView(body.view);
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
    this.pollSoon(POLL_MS);
    return body.view;
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    document.removeEventListener('visibilitychange', this.onVisible);
  }
}
