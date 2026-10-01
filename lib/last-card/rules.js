// The rules a game can be played with. Defaults are the official rules of the classic 108-card shedding game;
// everything else is a house rule the host can switch on in the lobby. Shared by the server and the browser.

// Each rule: its key, the label and note shown in the lobby, its choices, and which choice is official.
// default (when set) is what a new game starts with instead of the official choice; main rules are shown first,
// the rest sit under "More rules" in the lobby.
export const RULE_OPTIONS = [
  {
    key: 'turnSeconds', label: 'Turn timer', official: 0, default: 15, main: true,
    note: 'Not an official rule, but stops a game stalling. When time runs out the player draws a card and the turn moves on.',
    choices: [[0, 'Off'], [10, '10 seconds'], [15, '15 seconds'], [20, '20 seconds'], [30, '30 seconds'], [60, '60 seconds'], [90, '90 seconds']],
  },
  {
    key: 'targetScore', label: 'Play to', official: 500, main: true,
    note: 'The round winner scores the cards left in everyone else’s hand. First to this score wins the game.',
    choices: [[500, '500 points'], [250, '250 points'], [100, '100 points'], [0, 'One round']],
  },
  {
    key: 'startingHand', label: 'Cards dealt', official: 7, main: true,
    note: 'How many cards each player starts a round with.',
    choices: [[5, '5'], [6, '6'], [7, '7'], [8, '8'], [9, '9'], [10, '10']],
  },
  {
    key: 'stacking', label: 'Stacking', official: false,
    note: 'Answer a +2 with a +2, or a +2 or +4 with a +4, and pass the whole total on. No challenges on a stack.',
    choices: [[false, 'Off'], [true, 'On']],
  },
  {
    key: 'jumpIn', label: 'Jump in', official: false,
    note: 'Play a card identical to the top card (same color and number or symbol) out of turn. Play continues from you.',
    choices: [[false, 'Off'], [true, 'On']],
  },
  {
    key: 'sevenZero', label: '7 and 0', official: false,
    note: 'Playing a 7 swaps hands with a player you pick; playing a 0 passes every hand on in the direction of play.',
    choices: [[false, 'Off'], [true, 'Swap hands']],
  },
  {
    key: 'wild4', label: 'Wild Draw Four', official: 'challenge',
    note: 'Officially you may only play it when you have no card of the current color. The next player can challenge: '
      + 'if you broke the rule you draw 4, if you didn’t they draw 6.',
    choices: [['challenge', 'Can be challenged'], ['anytime', 'Play any time']],
  },
  {
    key: 'playAfterDraw', label: 'After drawing', official: true,
    note: 'Whether you may play the card you just drew, if it fits.',
    choices: [[true, 'May play it'], [false, 'Turn ends']],
  },
  {
    key: 'drawUntilPlayable', label: 'Drawing', official: false,
    note: 'Keep drawing until you get a card you can play, instead of drawing one.',
    choices: [[false, 'Draw one card'], [true, 'Until playable']],
  },
  {
    key: 'lastCardPenalty', label: 'Forgot “Last card!”', official: 2,
    note: 'Press Last card! when you play your second-to-last card. If someone catches you before the next player '
      + 'moves, you draw this many.',
    choices: [[2, 'Draw 2'], [4, 'Draw 4'], [0, 'No penalty']],
  },
];

export const DEFAULT_RULES = Object.fromEntries(RULE_OPTIONS.map(r => [r.key, r.default ?? r.official]));

// Any input → a complete, valid rules object. Unknown keys are dropped, bad values fall back to the default.
export function cleanRules(input = {}) {
  const rules = {};
  for (const option of RULE_OPTIONS) {
    const value = input?.[option.key];
    rules[option.key] = option.choices.some(([choice]) => choice === value) ? value : option.default ?? option.official;
  }
  return rules;
}

// The rules that differ from official, as "Label: choice" lines, for the lobby and table summaries.
export function houseRules(rules) {
  return RULE_OPTIONS
    .filter(option => rules[option.key] !== option.official)
    .map(option => `${option.label}: ${option.choices.find(([v]) => v === rules[option.key])[1]}`);
}
