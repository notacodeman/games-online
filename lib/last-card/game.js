// Last Card's engine: deck, turns, card effects and scoring, as plain functions over one state object.
// Shared by the server (functions/api/games/…) and practice mode in the browser (js/practice.js): no DOM, no network.
// Every game in lib/games.js exports the same functions: newGame, addPlayer, applyAction, advance, viewFor.
// The state holds everything, including every hand and the draw pile; viewFor() cuts it down to what one player may see.

import { cleanRules } from './rules.js';
import { GameError } from '../errors.js';
import { botAction, botCatch, cleanLevel, DEFAULT_LEVEL } from './bot.js';

export const COLORS = ['red', 'yellow', 'green', 'blue'];
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 10;
export const NAME_LENGTH = 16;
export const BOT_DELAY_MS = 1200;      // how long a bot "thinks" before its move, so people can follow along
export const CATCH_DELAY_MS = 2500;    // how long before a bot catches someone who didn't call Last card (per level in bot.js)
const LOG_LENGTH = 60;
const BOT_NAMES = ['Ada', 'Bix', 'Cleo', 'Dot', 'Echo', 'Fizz', 'Gus', 'Hex', 'Ivy', 'Jinx', 'Kip', 'Lux'];

export { GameError };
const refuse = message => { throw new GameError(message); };

// ---- Cards ----

// 108 cards: per color one 0, two each of 1–9, Skip, Reverse and Draw Two; then four Wild and four Wild Draw Four.
export function makeDeck() {
  const cards = [];
  let id = 0;
  for (const color of COLORS) {
    cards.push({ id: id++, color, value: '0' });
    for (const value of ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'skip', 'reverse', 'draw2']) {
      cards.push({ id: id++, color, value }, { id: id++, color, value });
    }
  }
  for (let i = 0; i < 4; i++) cards.push({ id: id++, color: null, value: 'wild' }, { id: id++, color: null, value: 'wild4' });
  return cards;
}

export const isWild = card => card.value === 'wild' || card.value === 'wild4';
export const cardPoints = card => (isWild(card) ? 50 : /^\d$/.test(card.value) ? Number(card.value) : 20);

const VALUE_NAMES = { skip: 'Skip', reverse: 'Reverse', draw2: 'Draw Two', wild: 'Wild', wild4: 'Wild Draw Four' };
const capital = text => text[0].toUpperCase() + text.slice(1);
export const cardName = card =>
  isWild(card) ? VALUE_NAMES[card.value] : `${capital(card.color)} ${VALUE_NAMES[card.value] || card.value}`;

export function randomInt(n) {
  return crypto.getRandomValues(new Uint32Array(1))[0] % n;
}
function shuffle(cards) {
  for (let i = cards.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

// ---- Setting up ----

export function newGame(code, rules, now) {
  return {
    code, phase: 'lobby', rules: cleanRules(rules), players: [], hostId: null, nextId: 1,
    round: 0, dealer: -1, deck: [], discard: [], color: null, direction: 1, turn: 0,
    pending: null,   // draw cards waiting for the current player: { amount, kind, by, challengeable, hadMatch, prevColor }
    drawn: null,     // id of the card the current player just drew and may still play
    exposed: null,   // { playerId, at, botWillCatch }: down to one card without calling Last card
    lacks: {},       // playerId → the color they last drew on (public info Hard bots use); cleared when they play it
    turnStartedAt: now, turnCount: 0, result: null, log: [], version: 1,
  };
}

export function addPlayer(state, { name, bot = false, tokenHash = null, level }) {
  if (state.players.length >= MAX_PLAYERS) refuse(`The table is full (${MAX_PLAYERS} players).`);
  let clean = String(name || '').replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, NAME_LENGTH);
  if (!clean) clean = bot ? pickBotName(state) : 'Player';
  // names must differ, so the log and the seats are readable
  const taken = new Set(state.players.map(p => p.name.toLowerCase()));
  let unique = clean;
  for (let n = 2; taken.has(unique.toLowerCase()); n++) unique = `${clean.slice(0, NAME_LENGTH - 2)} ${n}`;
  const player = { id: `p${state.nextId++}`, name: unique, bot, tokenHash, hand: [], score: 0, safe: false };
  if (bot) player.level = cleanLevel(level);
  state.players.push(player);
  if (!state.hostId && !bot) state.hostId = player.id;
  return player;
}

function pickBotName(state) {
  const used = new Set(state.players.map(p => p.name));
  return BOT_NAMES.find(n => !used.has(n)) || 'Bot';
}

// ---- Small helpers ----

export const topCard = state => state.discard[state.discard.length - 1] || null;
export const indexOf = (state, playerId) => state.players.findIndex(p => p.id === playerId);
const nextIndex = (state, from, steps = 1) => {
  const n = state.players.length;
  return (((from + state.direction * steps) % n) + n) % n;
};

function log(state, text, now) {
  state.log.push({ at: now, text });
  if (state.log.length > LOG_LENGTH) state.log.splice(0, state.log.length - LOG_LENGTH);
}

// Draws up to n cards, reshuffling the discard pile (all but its top card) when the draw pile runs out.
function drawCards(state, player, n) {
  const drawn = [];
  for (let i = 0; i < n; i++) {
    if (!state.deck.length) {
      if (state.discard.length < 2) break;
      const top = state.discard.pop();
      state.deck = shuffle(state.discard);
      state.discard = [top];
    }
    drawn.push(state.deck.pop());
  }
  player.hand.push(...drawn);
  if (drawn.length) player.safe = false;
  return drawn;
}

// turnCount goes up every time a turn ends, even when the same player goes again (a Skip with two players),
// so the page can play a sound for each finished turn.
function startTurn(state, index, now) {
  state.turn = index;
  state.turnCount = (state.turnCount || 0) + 1;
  state.turnStartedAt = now;
  state.drawn = null;
}
const passTurn = (state, now, steps = 1) => startTurn(state, nextIndex(state, state.turn, steps), now);

// ---- What may be played ----

export function canPlay(state, card) {
  if (state.pending) {
    if (!state.rules.stacking) return false;
    return card.value === 'wild4' || (card.value === 'draw2' && state.pending.kind === 'draw2');
  }
  if (isWild(card)) return true;
  return card.color === state.color || card.value === topCard(state).value;
}

// Ids of the cards this player may play on their turn right now.
export function legalPlays(state, index) {
  if (state.phase !== 'playing' || index !== state.turn || state.color === null) return [];
  const hand = state.players[index].hand;
  if (state.drawn !== null) {
    const card = hand.find(c => c.id === state.drawn);
    return card && canPlay(state, card) ? [card.id] : [];
  }
  return hand.filter(card => canPlay(state, card)).map(card => card.id);
}

// Ids of the cards this player may jump in with out of turn (house rule).
export function jumpInPlays(state, index) {
  if (!state.rules.jumpIn || state.phase !== 'playing' || index === state.turn || index < 0) return [];
  if (state.pending || state.color === null) return [];
  const top = topCard(state);
  if (!top || isWild(top)) return [];
  return state.players[index].hand.filter(c => c.color === top.color && c.value === top.value).map(c => c.id);
}

// ---- Rounds ----

function dealRound(state, now) {
  const n = state.players.length;
  state.round += 1;
  state.dealer = state.round === 1 ? randomInt(n) : (state.dealer + 1) % n;
  state.deck = shuffle(makeDeck());
  state.discard = [];
  state.direction = 1;
  state.pending = null;
  state.exposed = null;
  state.lacks = {};
  state.result = null;
  for (const player of state.players) {
    player.hand = state.deck.splice(0, state.rules.startingHand);
    player.safe = false;
  }
  // a Wild Draw Four can't start the pile: put it back and flip again
  let top = state.deck.pop();
  while (top.value === 'wild4') {
    state.deck.unshift(top);
    shuffle(state.deck);
    top = state.deck.pop();
  }
  state.discard.push(top);
  state.color = top.color;   // null for a Wild: the first player picks the color
  state.phase = 'playing';
  const dealer = state.players[state.dealer];
  log(state, `Round ${state.round}. ${dealer.name} deals; the first card is ${cardName(top)}.`, now);

  let first = nextIndex(state, state.dealer);
  if (top.value === 'skip') {
    log(state, `${state.players[first].name} is skipped.`, now);
    first = nextIndex(state, state.dealer, 2);
  } else if (top.value === 'reverse') {
    state.direction = -1;
    first = state.dealer;
    log(state, `Play goes the other way, starting with ${dealer.name}.`, now);
  } else if (top.value === 'draw2') {
    drawCards(state, state.players[first], 2);
    log(state, `${state.players[first].name} draws 2 and is skipped.`, now);
    first = nextIndex(state, first);
  }
  startTurn(state, first, now);
}

function endRound(state, winnerIndex, now) {
  const winner = state.players[winnerIndex];
  const hands = state.players.filter(p => p !== winner)
    .map(p => ({ id: p.id, cards: p.hand, points: p.hand.reduce((sum, c) => sum + cardPoints(c), 0) }));
  const points = hands.reduce((sum, h) => sum + h.points, 0);
  winner.score += points;
  state.result = { winnerId: winner.id, points, hands };
  state.pending = null;
  state.exposed = null;
  state.drawn = null;
  const target = state.rules.targetScore;
  state.phase = !target || winner.score >= target ? 'gameOver' : 'roundOver';
  log(state, `${winner.name} is out and scores ${points}.`, now);
  if (state.phase === 'gameOver') log(state, `${winner.name} wins the game!`, now);
}

// ---- Moves ----

// Applies one move by one player. Checks everything before changing anything, so a refused move leaves no trace.
export function applyAction(state, playerId, action, now) {
  const index = indexOf(state, playerId);
  if (index < 0) refuse('You’re not in this game.');
  const handler = ACTIONS[action?.type];
  if (!handler) refuse('Unknown move.');
  handler(state, index, action, now);
  state.version += 1;
  return state;
}

const isHost = (state, index) => state.players[index].id === state.hostId;
function requireHost(state, index) {
  if (!isHost(state, index)) refuse('Only the host can do that.');
}
function requirePlaying(state) {
  if (state.phase !== 'playing') refuse('The round isn’t being played right now.');
}
function requireTurn(state, index) {
  requirePlaying(state);
  if (index !== state.turn) refuse('It’s not your turn.');
  if (state.color === null) refuse('Pick the starting color first.');
}
// Anyone else moving ends the window for catching a player who didn't call Last card.
function closeCatchWindow(state, index) {
  if (state.exposed && state.exposed.playerId !== state.players[index].id) state.exposed = null;
}

const ACTIONS = {
  // ---- lobby and host ----
  addBot(state, index, { level }, now) {
    requireHost(state, index);
    if (state.phase !== 'lobby') refuse('Bots can only be added before the game starts.');
    const bot = addPlayer(state, { bot: true, level });
    log(state, `${bot.name} (bot) sat down.`, now);
  },
  // how well a bot plays: easy, medium, hard or impossible (bot.js)
  setBotLevel(state, index, { playerId, level }) {
    requireHost(state, index);
    if (state.phase !== 'lobby') refuse('Bot levels can only be changed before the game starts.');
    const target = state.players[indexOf(state, playerId)];
    if (!target?.bot) refuse('Pick a bot.');
    target.level = cleanLevel(level);
  },
  removePlayer(state, index, { playerId }, now) {
    requireHost(state, index);
    if (state.phase !== 'lobby') refuse('Players can only be removed before the game starts.');
    const target = indexOf(state, playerId);
    if (target < 0 || target === index) refuse('Pick someone else to remove.');
    log(state, `${state.players[target].name} was removed.`, now);
    state.players.splice(target, 1);
  },
  setRules(state, index, { rules }) {
    requireHost(state, index);
    if (state.phase !== 'lobby') refuse('Rules can only be changed before the game starts.');
    state.rules = cleanRules(rules);
  },
  start(state, index, _action, now) {
    requireHost(state, index);
    if (state.phase !== 'lobby') refuse('The game has already started.');
    if (state.players.length < MIN_PLAYERS) refuse('Add at least one more player or a bot first.');
    dealRound(state, now);
  },
  nextRound(state, index, _action, now) {
    requireHost(state, index);
    if (state.phase !== 'roundOver') refuse('The round isn’t over yet.');
    dealRound(state, now);
  },
  // back to the lobby with the same people and scores reset
  playAgain(state, index, _action, now) {
    requireHost(state, index);
    if (state.phase !== 'gameOver') refuse('The game isn’t over yet.');
    Object.assign(state, { phase: 'lobby', round: 0, dealer: -1, deck: [], discard: [], result: null, color: null });
    for (const player of state.players) Object.assign(player, { hand: [], score: 0, safe: false });
    log(state, 'Back to the lobby for a new game.', now);
  },
  // a bot takes over someone's seat (they left, or are away) and keeps their hand and score
  replaceWithBot(state, index, { playerId }, now) {
    requireHost(state, index);
    const target = indexOf(state, playerId);
    if (target < 0 || target === index) refuse('Pick someone else.');
    const player = state.players[target];
    if (player.bot) refuse(`${player.name} is already a bot.`);
    Object.assign(player, { bot: true, tokenHash: null, level: DEFAULT_LEVEL });
    if (target === state.turn) state.turnStartedAt = now;
    log(state, `A bot took over ${player.name}’s seat.`, now);
  },
  leave(state, index, _action, now) {
    const player = state.players[index];
    if (state.phase === 'lobby') {
      state.players.splice(index, 1);
      log(state, `${player.name} left.`, now);
    } else {
      Object.assign(player, { bot: true, tokenHash: null, level: DEFAULT_LEVEL });
      if (index === state.turn) state.turnStartedAt = now;
      log(state, `${player.name} left; a bot took their seat.`, now);
    }
    if (state.hostId === player.id) {
      const human = state.players.find(p => !p.bot);
      state.hostId = human ? human.id : null;
      if (human) log(state, `${human.name} is now the host.`, now);
    }
  },

  // ---- playing ----
  color(state, index, { color }, now) {
    requirePlaying(state);
    if (index !== state.turn || state.color !== null) refuse('It’s not your turn to pick the color.');
    if (!COLORS.includes(color)) refuse('Pick red, yellow, green or blue.');
    state.color = color;
    log(state, `${state.players[index].name} picks ${color}.`, now);
  },

  play(state, index, action, now) {
    requireTurn(state, index);
    playCard(state, index, action, now, false);
  },

  jumpIn(state, index, action, now) {
    requirePlaying(state);
    if (!jumpInPlays(state, index).includes(action.cardId)) refuse('Too late: that card doesn’t match the top card any more.');
    playCard(state, index, action, now, true);
  },

  draw(state, index, _action, now) {
    requireTurn(state, index);
    if (state.drawn !== null) refuse('You already drew. Play that card or pass.');
    closeCatchWindow(state, index);
    const player = state.players[index];
    if (state.pending) {
      const { amount } = state.pending;
      const got = drawCards(state, player, amount).length;
      log(state, `${player.name} draws ${got}.`, now);
      state.pending = null;
      passTurn(state, now);
      return;
    }
    const drawn = [];
    do {
      const [card] = drawCards(state, player, 1);
      if (!card) break;
      drawn.push(card);
    } while (state.rules.drawUntilPlayable && !canPlay(state, drawn[drawn.length - 1]));
    if (!drawn.length) {
      log(state, `${player.name} can’t draw: no cards left. Turn passes.`, now);
      passTurn(state, now);
      return;
    }
    log(state, `${player.name} draws ${drawn.length === 1 ? 'a card' : `${drawn.length} cards`}.`, now);
    if (state.color) (state.lacks ||= {})[player.id] = state.color;
    const last = drawn[drawn.length - 1];
    const mayPlay = (state.rules.playAfterDraw || state.rules.drawUntilPlayable) && canPlay(state, last);
    if (mayPlay) state.drawn = last.id;
    else passTurn(state, now);
  },

  pass(state, index, _action, now) {
    requireTurn(state, index);
    if (state.drawn === null) refuse('Draw a card before passing.');
    log(state, `${state.players[index].name} keeps the card.`, now);
    passTurn(state, now);
  },

  challenge(state, index, _action, now) {
    requireTurn(state, index);
    const pending = state.pending;
    if (!pending || pending.kind !== 'wild4' || !pending.challengeable) refuse('There’s nothing to challenge.');
    const me = state.players[index];
    const offender = state.players[indexOf(state, pending.by)];
    state.pending = null;
    if (pending.hadMatch) {
      drawCards(state, offender, 4);
      log(state, `${me.name} challenges and wins: ${offender.name} had a ${pending.prevColor} card and draws 4.`, now);
      state.turnStartedAt = now;   // the challenger now takes a normal turn
    } else {
      const got = drawCards(state, me, pending.amount + 2).length;
      log(state, `${me.name} challenges and loses: ${offender.name} played it fairly. ${me.name} draws ${got}.`, now);
      passTurn(state, now);
    }
  },

  // Calling it late: with one card left and not caught yet.
  callLast(state, index, _action, now) {
    requirePlaying(state);
    const player = state.players[index];
    if (player.hand.length !== 1 || player.safe) refuse('You call Last card when you’re down to one card.');
    player.safe = true;
    if (state.exposed?.playerId === player.id) state.exposed = null;
    log(state, `${player.name}: “Last card!”`, now);
  },

  catch(state, index, { playerId }, now) {
    requirePlaying(state);
    const exposed = state.exposed;
    if (!exposed || exposed.playerId !== playerId || playerId === state.players[index].id) {
      refuse('Too late: they can’t be caught now.');
    }
    const target = state.players[indexOf(state, playerId)];
    const got = drawCards(state, target, state.rules.lastCardPenalty).length;
    state.exposed = null;
    log(state, `${state.players[index].name} catches ${target.name} without a Last card call: ${target.name} draws ${got}.`, now);
  },
};

function playCard(state, index, { cardId, color, target, callLast }, now, jumpIn) {
  const player = state.players[index];
  const position = player.hand.findIndex(c => c.id === cardId);
  if (position < 0) refuse('That card isn’t in your hand.');
  const card = player.hand[position];
  if (!jumpIn && !legalPlays(state, index).includes(cardId)) {
    refuse(state.drawn !== null ? 'You can only play the card you just drew.' : 'That card doesn’t match.');
  }
  if (isWild(card) && !COLORS.includes(color)) refuse('Pick a color for the wild card.');
  const swapping = state.rules.sevenZero && card.value === '7' && player.hand.length > 1;
  let swapWith = -1;
  if (swapping) {
    swapWith = indexOf(state, target);
    if (swapWith < 0 || swapWith === index) refuse('Pick who to swap hands with.');
  }

  // allowed: now change the state
  closeCatchWindow(state, index);
  const hadMatch = card.value === 'wild4' && player.hand.some(c => c.id !== card.id && c.color === state.color);
  const prevColor = state.color;
  const stackedOn = state.pending;
  if (state.lacks?.[player.id] === card.color) delete state.lacks[player.id];
  player.hand.splice(position, 1);
  state.discard.push(card);
  state.color = isWild(card) ? color : card.color;
  state.drawn = null;
  if (jumpIn) {
    state.turn = index;
    log(state, `${player.name} jumps in with ${cardName(card)}!`, now);
  } else {
    log(state, `${player.name} plays ${cardName(card)}${isWild(card) ? ` and picks ${color}` : ''}.`, now);
  }

  // Last card
  if (player.hand.length === 1) {
    if (callLast) {
      player.safe = true;
      log(state, `${player.name}: “Last card!”`, now);
    } else if (state.rules.lastCardPenalty > 0) {
      player.safe = false;
      state.exposed = { playerId: player.id, at: now, ...botCatch(state, player.id) };
    }
  } else {
    player.safe = false;
  }

  // out of cards: a draw card still hits the next player (their cards count toward the score)
  if (player.hand.length === 0) {
    if (card.value === 'draw2' || card.value === 'wild4') {
      const victim = state.players[nextIndex(state, index)];
      const amount = (stackedOn?.amount || 0) + (card.value === 'draw2' ? 2 : 4);
      drawCards(state, victim, amount);
      log(state, `${victim.name} draws ${amount}.`, now);
    }
    endRound(state, index, now);
    return;
  }

  const count = state.players.length;
  switch (card.value) {
    case 'skip':
      log(state, `${state.players[nextIndex(state, index)].name} is skipped.`, now);
      passTurn(state, now, 2);
      break;
    case 'reverse':
      if (count === 2) {
        passTurn(state, now, 2);   // with two players a Reverse works like a Skip
      } else {
        state.direction *= -1;
        passTurn(state, now);
      }
      break;
    case 'draw2':
    case 'wild4': {
      const amount = (stackedOn?.amount || 0) + (card.value === 'draw2' ? 2 : 4);
      const challengeable = card.value === 'wild4' && state.rules.wild4 === 'challenge' && !stackedOn;
      if (state.rules.stacking || challengeable) {
        // the next player gets a choice: stack, challenge or take the cards
        state.pending = { amount, kind: card.value, by: player.id, challengeable, hadMatch, prevColor };
        passTurn(state, now);
      } else {
        const victim = state.players[nextIndex(state, index)];
        state.pending = null;
        drawCards(state, victim, amount);
        log(state, `${victim.name} draws ${amount} and is skipped.`, now);
        passTurn(state, now, 2);
      }
      break;
    }
    case '7':
      if (swapping) {
        const other = state.players[swapWith];
        [player.hand, other.hand] = [other.hand, player.hand];
        log(state, `${player.name} swaps hands with ${other.name}.`, now);
        afterSwap(state);
      }
      passTurn(state, now);
      break;
    case '0':
      if (state.rules.sevenZero) {
        const hands = state.players.map(p => p.hand);
        state.players.forEach((p, i) => { hands[nextIndex(state, i)] = p.hand; });
        state.players.forEach((p, i) => { p.hand = hands[i]; });
        log(state, 'Every hand passes to the next player.', now);
        afterSwap(state);
      }
      passTurn(state, now);
      break;
    default:
      passTurn(state, now);
  }
}

// After hands move around, nobody can be caught for a call they had no chance to make.
function afterSwap(state) {
  state.exposed = null;
  state.lacks = {};
  for (const p of state.players) p.safe = p.hand.length === 1;
}

// ---- Things that happen by themselves: bots, catching, the turn timer ----

// Makes at most one automatic move if one is due. Returns true when the state changed.
export function advance(state, now) {
  if (state.phase !== 'playing') return false;
  const current = state.players[state.turn];
  const botDue = current.bot && now - state.turnStartedAt >= BOT_DELAY_MS;

  // a bot catches someone who didn't call Last card: the next player if it's a bot, else any bot after a moment
  const exposed = state.exposed;
  if (exposed?.botWillCatch) {
    const catcher = current.bot && current.id !== exposed.playerId && botDue ? current
      : now - exposed.at >= (exposed.catchDelay ?? CATCH_DELAY_MS) ? state.players.find(p => p.bot && p.id !== exposed.playerId) : null;
    if (catcher) {
      applyAction(state, catcher.id, { type: 'catch', playerId: exposed.playerId }, now);
      return true;
    }
  }

  if (botDue) {
    applyAction(state, current.id, botAction(state), now);
    return true;
  }

  const limit = state.rules.turnSeconds * 1000;
  if (!current.bot && limit && now - state.turnStartedAt >= limit) {
    log(state, `${current.name} ran out of time.`, now);
    if (state.color === null) applyAction(state, current.id, { type: 'color', color: COLORS[randomInt(4)] }, now);
    else if (state.drawn !== null) applyAction(state, current.id, { type: 'pass' }, now);
    else {
      applyAction(state, current.id, { type: 'draw' }, now);
      if (state.drawn !== null) applyAction(state, current.id, { type: 'pass' }, now);
    }
    return true;
  }
  return false;
}

// ---- What each player sees ----

// How soon this player's page should ask the server for news (js/online.js): 'fast' when something is about to
// happen they'll want to see or act on (their turn is next, a bot is moving, someone can be caught, jump-in is on),
// 'normal' on their own turn (catches and the timer), 'slow' otherwise.
export function pollPace(view) {
  if (view.phase !== 'playing') return view.phase === 'lobby' ? 'normal' : 'slow';
  const players = view.players;
  const turn = players.findIndex(p => p.id === view.turn);
  if (players[turn]?.bot || view.exposed || view.rules.jumpIn) return 'fast';
  const me = view.me?.id;
  if (!me) return 'slow';
  if (players[turn]?.id === me) return 'normal';
  const n = players.length;
  return players[(((turn + view.direction) % n) + n) % n]?.id === me ? 'fast' : 'slow';
}

// The state as one player may see it: their own hand, only counts for everyone else, never the draw pile.
// playerId null gives a spectator's view.
export function viewFor(state, playerId, now) {
  const index = playerId ? indexOf(state, playerId) : -1;
  const me = index >= 0 ? state.players[index] : null;
  const pending = state.pending;
  return {
    code: state.code, phase: state.phase, rules: state.rules, version: state.version, round: state.round,
    hostId: state.hostId, turn: state.players[state.turn]?.id || null, direction: state.direction,
    color: state.color, top: topCard(state), deckCount: state.deck.length, discardCount: state.discard.length,
    pending: pending && { amount: pending.amount, kind: pending.kind, by: pending.by, challengeable: pending.challengeable },
    drawn: me && index === state.turn ? state.drawn : null,
    exposed: state.exposed?.playerId || null,
    turnStartedAt: state.turnStartedAt, turnCount: state.turnCount || 0, serverNow: now,
    players: state.players.map(p => ({
      id: p.id, name: p.name, bot: p.bot, level: p.bot ? p.level || DEFAULT_LEVEL : null, count: p.hand.length, score: p.score, safe: p.safe && p.hand.length === 1,
    })),
    me: me && { id: me.id, hand: me.hand, playable: legalPlays(state, index), jumpIn: jumpInPlays(state, index) },
    result: state.result,
    log: state.log.slice(-40),
  };
}
