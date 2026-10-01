// Spy Words' rule options. Defaults are the official rules of the team word-clue game; the host can change them.

export const RULE_OPTIONS = [
  {
    key: 'turnSeconds', label: 'Turn timer', official: 0, main: true,
    note: 'Not an official rule, but keeps things moving. When time runs out the team’s turn ends.',
    choices: [[0, 'Off'], [60, '1 minute'], [120, '2 minutes'], [180, '3 minutes'], [300, '5 minutes']],
  },
  {
    key: 'assassins', label: 'Assassins', official: 1, main: true,
    note: 'Cards that lose the game for the team that picks one. More makes every clue riskier.',
    choices: [[1, '1'], [2, '2'], [3, '3']],
  },
  {
    key: 'clueCheck', label: 'Clue check', official: 'strict', main: true,
    note: 'A clue may not be one of the words still face-down on the board. Strict refuses those clues; honor system '
      + 'leaves it to the players.',
    choices: [['strict', 'Strict'], ['off', 'Honor system']],
  },
];

export const DEFAULT_RULES = Object.fromEntries(RULE_OPTIONS.map(r => [r.key, r.default ?? r.official]));

export function cleanRules(input = {}) {
  const rules = {};
  for (const option of RULE_OPTIONS) {
    const value = input?.[option.key];
    rules[option.key] = option.choices.some(([choice]) => choice === value) ? value : option.default ?? option.official;
  }
  return rules;
}
