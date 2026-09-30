// The page's side of each game in lib/games.js: how to draw its table, and its how-to-play notes.

import { GAMES, DEFAULT_GAME } from '../lib/games.js';
import { showTable as lastCardTable } from './last-card/table.js';

export { GAMES, DEFAULT_GAME };

export const TABLES = {
  'last-card': lastCardTable,
};

export const HOW_TO = {
  'last-card': [
    'On your turn, play a card that matches the top card’s color, number or symbol, or a Wild. If you can’t (or don’t want to), draw one; if it fits you may play it.',
    'Skip: the next player misses a turn. Reverse: play changes direction. Draw Two: the next player draws 2 and misses a turn.',
    'Wild: pick the color. Wild Draw Four: pick the color and the next player draws 4, but only if you had no card of the current color. They can challenge you.',
    'Press Last card! as you play your second-to-last card, or anyone can catch you before the next player moves.',
    'First to empty their hand wins the round and scores the cards left in everyone else’s: numbers at face value, action cards 20, wilds 50.',
  ],
};
