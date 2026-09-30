// Practice against bots, entirely in this browser: the same engine the server runs, no network.
// Same interface as js/online.js: { view, playerId, send(action), subscribe(fn), stop() }.

const TICK_MS = 200;   // how often bots and the turn timer are checked

export class PracticeGame {
  constructor(engine, { name, bots, rules }) {
    this.kind = 'practice';
    this.code = null;
    this.engine = engine;
    this.state = engine.newGame('PRACTICE', rules, Date.now());
    this.playerId = engine.addPlayer(this.state, { name: name || 'You' }).id;
    for (let i = 0; i < bots; i++) engine.applyAction(this.state, this.playerId, { type: 'addBot' }, Date.now());
    engine.applyAction(this.state, this.playerId, { type: 'start' }, Date.now());
    this.listeners = new Set();
    this.view = engine.viewFor(this.state, this.playerId, Date.now());
    this.timer = setInterval(() => {
      if (engine.advance(this.state, Date.now())) this.emit();
    }, TICK_MS);
  }

  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit() {
    this.view = this.engine.viewFor(this.state, this.playerId, Date.now());
    for (const fn of this.listeners) fn(this.view);
  }

  async send(action) {
    this.engine.applyAction(this.state, this.playerId, action, Date.now());   // throws GameError when refused
    this.emit();
    return this.view;
  }

  stop() { clearInterval(this.timer); }
}
