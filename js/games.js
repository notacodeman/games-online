// The page's side of each game in lib/games.js: how to draw its table, and its how-to-play notes.

import { GAMES, DEFAULT_GAME } from '../lib/games.js';
import { showTable as lastCardTable } from './last-card/table.js';
import { showTable as spyWordsTable, teamsPanel as spyWordsTeams } from './spy-words/table.js';

export { GAMES, DEFAULT_GAME };

export const TABLES = {
  'last-card': lastCardTable,
  'spy-words': spyWordsTable,
};

// Extra lobby sections for games that need them: (view, send) → elements.
export const LOBBY_PANELS = {
  'spy-words': spyWordsTeams,
};

export const HOW_TO = {
  'last-card': [
    'On your turn, play a card that matches the top card’s color, number or symbol, or a Wild. If you can’t (or don’t want to), draw one; if it fits you may play it.',
    'Skip: the next player misses a turn. Reverse: play changes direction. Draw Two: the next player draws 2 and misses a turn.',
    'Wild: pick the color. Wild Draw Four: pick the color and the next player draws 4, but only if you had no card of the current color. They can challenge you.',
    'Press Last card! as you play your second-to-last card, or anyone can catch you before the next player moves.',
    'First to empty their hand wins the round and scores the cards left in everyone else’s: numbers at face value, action cards 20, wilds 50.',
  ],
  'spy-words': [
    'Split into red and blue. Each team has one spymaster; everyone else is an operative. The spymasters see which words are their team’s agents, the other team’s, innocent bystanders and the assassin.',
    'On your team’s turn your spymaster gives one word and a number: “OCEAN 3” means three of your words connect to ocean. The clue can’t be a word on the board.',
    'Operatives tap a card to point at it (teammates see who’s pointing), and tap again to pick it. Keep going while you find your own agents, up to one more than the number, or stop.',
    'A bystander or the other team’s agent ends your turn. The assassin loses the game. First team to uncover all its agents wins; the team that goes first has 9, the other 8.',
    'Only 2 or 3 of you? Put everyone on red. Blue is played automatically and uncovers one of its own agents each turn, so you’re racing it.',
  ],
};
