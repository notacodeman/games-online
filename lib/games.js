// Every game the site offers. Shared by the server (to run a game) and the page (to list them and draw the table).
// To add a game: write its engine in lib/<id>/ with the same functions as lib/last-card/game.js (newGame, addPlayer,
// applyAction, advance, viewFor; lobby actions addBot, removePlayer, setRules, start, leave), its rule options,
// and its table in js/<id>/table.js, then add it here and in js/games.js.

import * as lastCard from './last-card/game.js';
import { RULE_OPTIONS as lastCardRules, DEFAULT_RULES as lastCardDefaults } from './last-card/rules.js';

export const GAMES = {
  'last-card': {
    id: 'last-card',
    name: 'Last Card',
    blurb: 'The UNO-style color-and-number game. Match the top card, empty your hand, and call it.',
    minPlayers: lastCard.MIN_PLAYERS,
    maxPlayers: lastCard.MAX_PLAYERS,
    engine: lastCard,
    ruleOptions: lastCardRules,
    defaultRules: lastCardDefaults,
  },
};

export const DEFAULT_GAME = 'last-card';
export const gameFor = id => GAMES[id] || null;
