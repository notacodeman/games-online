// How bots play, at four levels the host picks per bot (Medium is the original bot).
//   Easy: plays a random card half the time, often forgets Last card!, rarely catches or challenges.
//   Medium: plays what fits, holds on to wilds, attacks a next player close to going out, and now and then forgets
//     to call Last card or takes a risk with a Wild Draw Four, so it can be caught out.
//   Hard: Medium plus what a sharp player tracks from the table: which color each player last drew on (so probably
//     lacks), keeping the color it holds most on top, and dumping high cards when someone is about to go out.
//   Impossible: Hard plus it sees every hand. It picks colors the next player can't follow and only challenges a
//     Wild Draw Four that was played illegally.

import { COLORS, isWild, legalPlays, randomInt, cardPoints } from './game.js';

export const LEVELS = {
  easy:       { label: 'Easy',       callLast: 0.6,  catch: 0.3,  catchDelay: 4000, challenge: 0.1, bluff: 0,   randomPlay: 0.5, randomColor: 0.3, attack: false, smart: false, peek: false },
  medium:     { label: 'Medium',     callLast: 0.85, catch: 0.7,  catchDelay: 2500, challenge: 0.3, bluff: 0.4, randomPlay: 0,   randomColor: 0,   attack: true,  smart: false, peek: false },
  hard:       { label: 'Hard',       callLast: 0.97, catch: 0.95, catchDelay: 1500, challenge: 0.4, bluff: 0.4, randomPlay: 0,   randomColor: 0,   attack: true,  smart: true,  peek: false },
  impossible: { label: 'Impossible', callLast: 1,    catch: 1,    catchDelay: 1000, challenge: 0,   bluff: 0,   randomPlay: 0,   randomColor: 0,   attack: true,  smart: true,  peek: true },
};
export const DEFAULT_LEVEL = 'medium';
export const BOT_LEVELS = Object.entries(LEVELS).map(([key, l]) => [key, l.label]);
export const cleanLevel = level => (LEVELS[level] ? level : DEFAULT_LEVEL);
const levelOf = player => LEVELS[player?.level] || LEVELS[DEFAULT_LEVEL];

const chance = p => randomInt(1000) < p * 1000;

// When someone forgets Last card!: will one of the other bots catch it, and how soon. The sharpest bot decides.
export function botCatch(state, exposedId) {
  const bots = state.players.filter(p => p.bot && p.id !== exposedId).map(levelOf);
  if (!bots.length) return { botWillCatch: false, catchDelay: LEVELS.medium.catchDelay };
  const best = bots.reduce((a, b) => (b.catch > a.catch ? b : a));
  return { botWillCatch: chance(best.catch), catchDelay: best.catchDelay };
}

const colorCounts = hand => COLORS.map(color => hand.filter(c => c.color === color).length);
const nextOf = (state, index) => {
  const n = state.players.length;
  return state.players[(((index + state.direction) % n) + n) % n];
};

// The color to name for a wild, from the cards left after playing it.
function pickColor(state, me, rest, level) {
  if (level.randomColor && chance(level.randomColor)) return COLORS[randomInt(4)];
  const mine = colorCounts(rest);
  const next = nextOf(state, state.players.indexOf(me));
  if (level.peek && next !== me) {
    // the color the next player holds least of; among ties, the one this bot holds most of
    const theirs = colorCounts(next.hand.filter(c => !isWild(c)));
    const rank = i => theirs[i] * 100 - mine[i];
    return COLORS[[0, 1, 2, 3].reduce((a, b) => (rank(b) < rank(a) ? b : a))];
  }
  if (level.smart && next !== me) {
    const lacks = state.lacks?.[next.id];
    if (lacks && mine[COLORS.indexOf(lacks)] > 0) return lacks;
  }
  const most = Math.max(...mine);
  return most ? COLORS[mine.indexOf(most)] : COLORS[randomInt(4)];
}

// Whether to challenge a Wild Draw Four.
function wantsChallenge(state, level) {
  const pending = state.pending;
  if (level.peek) return pending.hadMatch;
  if (level.smart && state.lacks?.[pending.by] === pending.prevColor) return false;   // they drew on that color: probably fair
  return chance(level.challenge);
}

export function botAction(state) {
  const index = state.turn;
  const me = state.players[index];
  const level = levelOf(me);
  if (state.color === null) return { type: 'color', color: pickColor(state, me, me.hand, level) };

  const plays = legalPlays(state, index).map(id => me.hand.find(c => c.id === id));
  if (state.pending) {
    if (plays.length) return playAction(state, me, plays[0], level);
    if (state.pending.challengeable && wantsChallenge(state, level)) return { type: 'challenge' };
    return { type: 'draw' };
  }
  if (state.drawn !== null) return plays.length ? playAction(state, me, plays[0], level) : { type: 'pass' };
  if (!plays.length) return { type: 'draw' };
  if (level.randomPlay && chance(level.randomPlay)) {
    const pick = plays[randomInt(plays.length)];
    // even at random, don't throw away a Wild Draw Four that would break the rule
    if (!(pick.value === 'wild4' && me.hand.some(c => c.color === state.color))) return playAction(state, me, pick, level);
  }

  const next = nextOf(state, index);
  const threat = level.attack && next.hand.length <= 2;
  const danger = state.players.some(p => p !== me && p.hand.length <= 2);   // someone may go out soon
  const holdsColor = me.hand.some(c => c.color === state.color);
  const mine = colorCounts(me.hand);
  const score = card => {
    let s = isWild(card) ? 0 : 10 + (/^\d$/.test(card.value) ? Number(card.value) / 2 : 3);
    if (threat && ['skip', 'reverse', 'draw2'].includes(card.value)) s += 30;
    if (card.value === 'wild4') s = threat ? 35 : -5;
    if (card.value === 'wild4' && holdsColor && !(threat && chance(level.bluff))) s = -50;
    if (card.value === '7' && state.rules.sevenZero) s -= 8;
    if (level.smart && !isWild(card)) {
      s += (mine[COLORS.indexOf(card.color)] - 1) * 1.5;   // keep the color it has most of on top
      if (danger) s += cardPoints(card) / 5;                // get rid of points before someone goes out
      const lacks = state.lacks?.[next.id];
      if (lacks && card.color === lacks) s += 8;            // the next player drew on this color last time
    }
    if (level.peek && !isWild(card) && next !== me) {
      // fewer cards the next player could follow with is better; none at all is best
      const follow = next.hand.filter(c => c.color === card.color || c.value === card.value).length;
      const wilds = next.hand.filter(isWild).length;
      s += follow + wilds === 0 ? 15 : 6 / (1 + follow);
    }
    return s;
  };
  const best = plays.reduce((a, b) => (score(b) > score(a) ? b : a));
  if (score(best) <= -50) return { type: 'draw' };
  return playAction(state, me, best, level);
}

function playAction(state, me, card, level) {
  const action = { type: 'play', cardId: card.id, callLast: me.hand.length === 2 && chance(level.callLast) };
  if (isWild(card)) action.color = pickColor(state, me, me.hand.filter(c => c.id !== card.id), level);
  if (card.value === '7' && state.rules.sevenZero) {
    const others = state.players.filter(p => p.id !== me.id);
    action.target = level.randomPlay
      ? others[randomInt(others.length)].id
      : others.reduce((a, b) => (b.hand.length < a.hand.length ? b : a)).id;   // swap with whoever holds the fewest
  }
  return action;
}
