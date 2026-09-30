// Every game the site offers. Shared by the server (to run a game) and the page (to list them and draw the table).
// To add a game: write its engine in lib/<id>/ with the same functions as lib/last-card/game.js (newGame, addPlayer,
// applyAction, advance, viewFor; lobby actions addBot, removePlayer, setRules, start, leave), its rule options,
// and its table in js/<id>/table.js, then add it here and in js/games.js.

import * as lastCard from './last-card/game.js';
import { RULE_OPTIONS as lastCardRules, DEFAULT_RULES as lastCardDefaults } from './last-card/rules.js';
import * as spyWords from './spy-words/game.js';
import { RULE_OPTIONS as spyWordsRules, DEFAULT_RULES as spyWordsDefaults } from './spy-words/rules.js';

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
    bots: true,        // the lobby offers "Add a bot"
    practice: true,    // can be played against bots in the browser
  },
  'spy-words': {
    id: 'spy-words',
    name: 'Spy Words',
    blurb: 'Two teams, 25 words. Your spymaster links your agents with one-word clues; find them all before the other team, and don’t touch the assassin.',
    minPlayers: spyWords.MIN_PLAYERS,
    maxPlayers: spyWords.MAX_PLAYERS,
    engine: spyWords,
    ruleOptions: spyWordsRules,
    defaultRules: spyWordsDefaults,
    bots: false,       // clues need a person
    practice: false,
  },
};

export const DEFAULT_GAME = 'last-card';
export const gameFor = id => GAMES[id] || null;
