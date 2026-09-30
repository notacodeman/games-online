// How bots play. Simple on purpose: they play what fits, hold on to wilds, attack a player close to going out,
// and now and then forget to call Last card or take a risk with a Wild Draw Four, so they can be caught out.

import { COLORS, isWild, legalPlays, randomInt } from './game.js';

const CALL_LAST_CHANCE = 0.85;   // bots remember to call Last card this often
const CATCH_CHANCE = 0.7;        // how often a bot notices someone who forgot to call
const CHALLENGE_CHANCE = 0.3;    // how often a bot challenges a Wild Draw Four
const BLUFF_CHANCE = 0.4;        // how often a bot plays Wild Draw Four while holding the current color, to stop a win

const chance = p => randomInt(1000) < p * 1000;
export const botWantsToCatch = () => chance(CATCH_CHANCE);

// The color the bot holds most of (random when it holds only wilds).
function favoriteColor(hand) {
  const counts = COLORS.map(color => hand.filter(c => c.color === color).length);
  const most = Math.max(...counts);
  return most ? COLORS[counts.indexOf(most)] : COLORS[randomInt(4)];
}

export function botAction(state) {
  const index = state.turn;
  const me = state.players[index];
  if (state.color === null) return { type: 'color', color: favoriteColor(me.hand) };

  const plays = legalPlays(state, index).map(id => me.hand.find(c => c.id === id));
  if (state.pending) {
    if (plays.length) return playAction(state, me, plays[0]);
    if (state.pending.challengeable && chance(CHALLENGE_CHANCE)) return { type: 'challenge' };
    return { type: 'draw' };
  }
  if (state.drawn !== null) return plays.length ? playAction(state, me, plays[0]) : { type: 'pass' };
  if (!plays.length) return { type: 'draw' };

  const n = state.players.length;
  const next = state.players[(((index + state.direction) % n) + n) % n];
  const threat = next.hand.length <= 2;
  const holdsColor = me.hand.some(c => c.color === state.color);
  const score = card => {
    let s = isWild(card) ? 0 : 10 + (/^\d$/.test(card.value) ? Number(card.value) / 2 : 3);
    if (threat && ['skip', 'reverse', 'draw2'].includes(card.value)) s += 30;
    if (card.value === 'wild4') s = threat ? 35 : -5;
    if (card.value === 'wild4' && holdsColor && !(threat && chance(BLUFF_CHANCE))) s = -50;
    if (card.value === '7' && state.rules.sevenZero) s -= 8;
    return s;
  };
  const best = plays.reduce((a, b) => (score(b) > score(a) ? b : a));
  if (score(best) <= -50) return { type: 'draw' };
  return playAction(state, me, best);
}

function playAction(state, me, card) {
  const action = { type: 'play', cardId: card.id, callLast: me.hand.length === 2 && chance(CALL_LAST_CHANCE) };
  if (isWild(card)) action.color = favoriteColor(me.hand.filter(c => c.id !== card.id));
  if (card.value === '7' && state.rules.sevenZero) {
    // swap with whoever holds the fewest cards
    const others = state.players.filter(p => p.id !== me.id);
    action.target = others.reduce((a, b) => (b.hand.length < a.hand.length ? b : a)).id;
  }
  return action;
}
