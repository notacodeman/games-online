// Spy Words' engine: two teams, a 5×5 board of words, and a secret key only the spymasters see.
// Each turn a team's spymaster gives a one-word clue and a number; their operatives pick cards until they miss,
// run out of guesses or stop. A team with no players is played automatically (the official 2–3 player rule):
// on its turn it uncovers one of its own agents. Same exports as the other games (see lib/games.js).

import { cleanRules } from './rules.js';
import { WORDS } from './words.js';
import { GameError } from '../errors.js';

export { GameError };
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 16;
export const NAME_LENGTH = 16;
export const TEAMS = ['red', 'blue'];
export const UNLIMITED = 'unlimited';       // a clue number meaning "as many guesses as you like"
export const AUTO_DELAY_MS = 1800;          // how long the automatic team waits before uncovering its agent
const BOARD_SIZE = 25;
const FIRST_TEAM_AGENTS = 9;
const SECOND_TEAM_AGENTS = 8;
const CLUE_LENGTH = 24;
const LOG_LENGTH = 80;

const refuse = message => { throw new GameError(message); };
const other = team => (team === 'red' ? 'blue' : 'red');
const capital = text => text[0].toUpperCase() + text.slice(1);

function randomInt(n) {
  return crypto.getRandomValues(new Uint32Array(1))[0] % n;
}
function shuffle(items) {
  for (let i = items.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

// ---- Setting up ----

export function newGame(code, rules, now) {
  return {
    code, phase: 'lobby', rules: cleanRules(rules), players: [], hostId: null, nextId: 1,
    board: [],          // [{ word, role: 'red' | 'blue' | 'bystander' | 'assassin', revealed }]
    turn: null,         // { team, phase: 'clue' | 'guess', clue: { word, number } | null, guessesLeft, guessesMade }
    marks: {},          // card index → ids of operatives pointing at it, so teammates see what's being considered
    winner: null, reason: null, wins: { red: 0, blue: 0 }, round: 0,
    turnStartedAt: now, turnCount: 0, log: [], version: 1,
  };
}

const teamPlayers = (state, team) => state.players.filter(p => p.team === team);
const spymasterOf = (state, team) => state.players.find(p => p.team === team && p.role === 'spymaster') || null;

export function addPlayer(state, { name, bot = false, tokenHash = null }) {
  if (bot) refuse('Spy Words has no bots: the clues need a person.');
  if (state.players.length >= MAX_PLAYERS) refuse(`The game is full (${MAX_PLAYERS} players).`);
  let clean = String(name || '').replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, NAME_LENGTH);
  if (!clean) clean = 'Player';
  const taken = new Set(state.players.map(p => p.name.toLowerCase()));
  let unique = clean;
  for (let n = 2; taken.has(unique.toLowerCase()); n++) unique = `${clean.slice(0, NAME_LENGTH - 2)} ${n}`;
  // new players join the smaller team, as an operative
  const team = teamPlayers(state, 'red').length <= teamPlayers(state, 'blue').length ? 'red' : 'blue';
  const player = { id: `p${state.nextId++}`, name: unique, bot: false, tokenHash, team, role: 'operative' };
  state.players.push(player);
  if (!state.hostId) state.hostId = player.id;
  return player;
}

function log(state, text, now) {
  state.log.push({ at: now, text });
  if (state.log.length > LOG_LENGTH) state.log.splice(0, state.log.length - LOG_LENGTH);
}

// A team is played by people if anyone is on it; otherwise it's automatic.
const isAutomatic = (state, team) => teamPlayers(state, team).length === 0;
const agentsLeft = (state, team) => state.board.filter(c => c.role === team && !c.revealed).length;

// ---- Moves ----

export function applyAction(state, playerId, action, now) {
  const index = state.players.findIndex(p => p.id === playerId);
  if (index < 0) refuse('You’re not in this game.');
  const handler = ACTIONS[action?.type];
  if (!handler) refuse('Unknown move.');
  handler(state, state.players[index], action, now);
  state.version += 1;
  return state;
}

function requireHost(state, player) {
  if (player.id !== state.hostId) refuse('Only the host can do that.');
}
function requireOperativeGuessing(state, player) {
  if (state.phase !== 'playing') refuse('The game isn’t being played right now.');
  if (player.team !== state.turn.team) refuse('It’s the other team’s turn.');
  if (player.role !== 'operative') refuse('Spymasters give clues; their operatives pick the cards.');
  if (state.turn.phase !== 'guess') refuse('Wait for your spymaster’s clue.');
}

function startTurn(state, team, now) {
  state.turn = { team, phase: 'clue', clue: null, guessesLeft: 0, guessesMade: 0 };
  state.marks = {};
  state.turnStartedAt = now;
  state.turnCount += 1;
}
const endTurn = (state, now) => startTurn(state, other(state.turn.team), now);

function finish(state, winner, reason, now) {
  state.phase = 'gameOver';
  state.winner = winner;
  state.reason = reason;
  state.wins[winner] += 1;
  state.marks = {};
  state.turnCount += 1;
  log(state, `${capital(winner)} wins${reason === 'assassin' ? ': the other team found the assassin' : ''}!`, now);
}

// After a card is uncovered: a team with no agents left wins.
function checkWin(state, now) {
  for (const team of TEAMS) {
    if (agentsLeft(state, team) === 0) {
      finish(state, team, 'agents', now);
      return true;
    }
  }
  return false;
}

const ACTIONS = {
  // ---- lobby ----
  // pick a team and role; the host can move anyone (playerId). A spymaster who has seen the key can't become an
  // operative or switch teams mid-game, but an operative can take over an empty spymaster seat on their own team.
  setTeam(state, player, { team, role, playerId }) {
    const target = playerId && playerId !== player.id ? state.players.find(p => p.id === playerId) : player;
    if (!target) refuse('That player isn’t here any more.');
    if (target !== player) requireHost(state, player);
    if (team !== null && !TEAMS.includes(team)) refuse('Pick red or blue.');
    if (!['operative', 'spymaster'].includes(role)) refuse('Pick operative or spymaster.');
    if (state.phase !== 'lobby') {
      const takingEmptySeat = team === target.team && role === 'spymaster' && target.role === 'operative' && !spymasterOf(state, team);
      if (!takingEmptySeat) refuse('Teams are set until this game ends. An operative can only take an empty spymaster seat.');
    }
    if (team && role === 'spymaster') {
      const current = spymasterOf(state, team);
      if (current && current !== target) current.role = 'operative';   // the new spymaster takes over
    }
    target.team = team;
    target.role = team ? role : 'operative';
  },
  // host: deal everyone into two even teams at random, with a random spymaster on each
  shuffleTeams(state, player) {
    requireHost(state, player);
    if (state.phase !== 'lobby') refuse('Teams can only be shuffled in the lobby.');
    const order = shuffle([...state.players]);
    // under 4 players everyone plays on red against the automatic blue team (the official small-group rule)
    order.forEach((p, i) => { p.team = order.length < 4 ? 'red' : TEAMS[i % 2]; p.role = 'operative'; });
    for (const team of TEAMS) {
      const first = order.find(p => p.team === team);
      if (first && teamPlayers(state, team).length > 1) first.role = 'spymaster';
    }
  },
  removePlayer(state, player, { playerId }, now) {
    requireHost(state, player);
    if (state.phase !== 'lobby') refuse('Players can only be removed in the lobby.');
    const target = state.players.findIndex(p => p.id === playerId);
    if (target < 0 || playerId === player.id) refuse('Pick someone else to remove.');
    log(state, `${state.players[target].name} was removed.`, now);
    state.players.splice(target, 1);
  },
  setRules(state, player, { rules }) {
    requireHost(state, player);
    if (state.phase !== 'lobby') refuse('Rules can only be changed in the lobby.');
    state.rules = cleanRules(rules);
  },
  start(state, player, _action, now) {
    requireHost(state, player);
    if (state.phase !== 'lobby') refuse('The game has already started.');
    const unassigned = state.players.filter(p => !p.team);
    if (unassigned.length) refuse(`Everyone needs a team first: ${unassigned.map(p => p.name).join(', ')}.`);
    for (const team of TEAMS) {
      const members = teamPlayers(state, team);
      if (!members.length) continue;
      if (!spymasterOf(state, team)) refuse(`${capital(team)} needs a spymaster.`);
      if (members.length < 2) refuse(`${capital(team)} needs at least one operative as well as the spymaster.`);
    }
    if (TEAMS.every(team => isAutomatic(state, team))) refuse('Put someone on a team first.');
    deal(state, now);
  },
  playAgain(state, player, _action, now) {
    requireHost(state, player);
    if (state.phase !== 'gameOver') refuse('The game isn’t over yet.');
    Object.assign(state, { phase: 'lobby', board: [], turn: null, winner: null, reason: null, marks: {} });
    log(state, 'Back to the lobby. Swap spymasters if you like.', now);
  },
  leave(state, player, _action, now) {
    state.players.splice(state.players.indexOf(player), 1);
    log(state, `${player.name} left.`, now);
    if (state.hostId === player.id) {
      state.hostId = state.players[0]?.id || null;
      if (state.hostId) log(state, `${state.players[0].name} is now the host.`, now);
    }
    // a game can't go on if a team was left with people but no spymaster; an operative can take the seat
    if (state.phase === 'playing' && player.role === 'spymaster' && teamPlayers(state, player.team).length) {
      log(state, `${capital(player.team)} has no spymaster: an operative can take the seat.`, now);
    }
  },

  // ---- playing ----
  clue(state, player, { word, number }, now) {
    if (state.phase !== 'playing') refuse('The game isn’t being played right now.');
    if (player.team !== state.turn.team || player.role !== 'spymaster') refuse('Only the spymaster whose turn it is gives the clue.');
    if (state.turn.phase !== 'clue') refuse('Your team already has its clue.');
    const clean = String(word || '').replace(/\s+/g, ' ').trim().toUpperCase();
    if (!clean) refuse('Type a clue.');
    if (clean.length > CLUE_LENGTH) refuse(`Keep the clue under ${CLUE_LENGTH} letters.`);
    if (!/^[\p{L}][\p{L}' -]*$/u.test(clean)) refuse('A clue is one word: letters only (a hyphen or apostrophe is fine).');
    if (state.rules.clueCheck === 'strict') {
      const onBoard = state.board.find(c => !c.revealed && (c.word === clean || clean.split(/[ -]/).includes(c.word)));
      if (onBoard) refuse(`${onBoard.word} is on the board, so it can’t be the clue.`);
    }
    const unlimited = number === UNLIMITED;
    const count = Number(number);
    if (!unlimited && !(Number.isInteger(count) && count >= 0 && count <= 9)) refuse('Pick a number from 0 to 9, or unlimited.');
    state.turn.clue = { word: clean, number: unlimited ? UNLIMITED : count };
    state.turn.phase = 'guess';
    // official: one more guess than the number; 0 and unlimited mean as many as you like
    state.turn.guessesLeft = unlimited || count === 0 ? null : count + 1;
    log(state, `${player.name} (${state.turn.team} spymaster): ${clean}, ${unlimited ? 'unlimited' : count}.`, now);
  },

  // point at a card (tap again to stop pointing), so teammates can see and talk it over
  mark(state, player, { index }) {
    requireOperativeGuessing(state, player);
    const card = state.board[index];
    if (!card || card.revealed) refuse('Pick a face-down card.');
    const marks = state.marks[index] || [];
    state.marks[index] = marks.includes(player.id) ? marks.filter(id => id !== player.id) : [...marks, player.id];
    if (!state.marks[index].length) delete state.marks[index];
  },

  guess(state, player, { index }, now) {
    requireOperativeGuessing(state, player);
    const card = state.board[index];
    if (!card || card.revealed) refuse('That card is already face up.');
    const team = state.turn.team;
    card.revealed = true;
    delete state.marks[index];
    state.turn.guessesMade += 1;
    const what = card.role === team ? 'their own agent' : card.role === 'bystander' ? 'a bystander'
      : card.role === 'assassin' ? 'the assassin' : `a ${card.role} agent`;
    log(state, `${player.name} picks ${card.word}: ${what}.`, now);

    if (card.role === 'assassin') { finish(state, other(team), 'assassin', now); return; }
    if (checkWin(state, now)) return;
    if (card.role !== team) { endTurn(state, now); return; }
    if (state.turn.guessesLeft !== null) {
      state.turn.guessesLeft -= 1;
      if (state.turn.guessesLeft === 0) { log(state, `${capital(team)} is out of guesses.`, now); endTurn(state, now); }
    }
  },

  endTurn(state, player, _action, now) {
    requireOperativeGuessing(state, player);
    if (state.turn.guessesMade === 0) refuse('Pick at least one card before ending the turn.');
    log(state, `${capital(state.turn.team)} stops guessing.`, now);
    endTurn(state, now);
  },
};

function deal(state, now) {
  const pool = shuffle([...new Set(WORDS)]).slice(0, BOARD_SIZE);
  // the first team has one more agent; a team played by people goes first when the other is automatic
  const staffed = TEAMS.filter(team => !isAutomatic(state, team));
  const first = staffed.length === 1 ? staffed[0] : TEAMS[randomInt(2)];
  const assassins = state.rules.assassins;
  const roles = [
    ...Array(FIRST_TEAM_AGENTS).fill(first),
    ...Array(SECOND_TEAM_AGENTS).fill(other(first)),
    ...Array(assassins).fill('assassin'),
  ];
  while (roles.length < BOARD_SIZE) roles.push('bystander');
  shuffle(roles);
  state.board = pool.map((word, i) => ({ word, role: roles[i], revealed: false }));
  state.phase = 'playing';
  state.round += 1;
  state.winner = null;
  state.reason = null;
  log(state, `Game ${state.round}. ${capital(first)} goes first with ${FIRST_TEAM_AGENTS} agents to find.`, now);
  startTurn(state, first, now);
}

// ---- Things that happen by themselves: the automatic team, the turn timer ----

export function advance(state, now) {
  if (state.phase !== 'playing') return false;
  const team = state.turn.team;
  if (isAutomatic(state, team)) {
    if (now - state.turnStartedAt < AUTO_DELAY_MS) return false;
    const hidden = state.board.filter(c => c.role === team && !c.revealed);
    const card = hidden[randomInt(hidden.length)];
    card.revealed = true;
    log(state, `${capital(team)} has no players and uncovers one of its agents: ${card.word}.`, now);
    if (!checkWin(state, now)) endTurn(state, now);
    state.version += 1;
    return true;
  }
  const limit = state.rules.turnSeconds * 1000;
  if (limit && now - state.turnStartedAt >= limit) {
    log(state, `${capital(team)} ran out of time.`, now);
    endTurn(state, now);
    state.version += 1;
    return true;
  }
  return false;
}

// ---- What each player sees ----

// How soon this player's page should ask the server for news (js/online.js): 'fast' while their own team is
// playing (clue coming, teammates pointing) or the automatic team is moving, 'slow' while the other team thinks.
export function pollPace(view) {
  if (view.phase !== 'playing') return view.phase === 'lobby' ? 'normal' : 'slow';
  const team = view.turn?.team;
  return view.automatic?.[team] || (view.me && view.me.team === team) ? 'fast' : 'slow';
}

// Everyone sees the words and the uncovered cards. Spymasters also see the key; everyone does once the game ends.
export function viewFor(state, playerId, now) {
  const me = state.players.find(p => p.id === playerId) || null;
  const showKey = state.phase === 'gameOver' || (state.phase === 'playing' && me?.role === 'spymaster' && !!me.team);
  return {
    code: state.code, phase: state.phase, rules: state.rules, version: state.version, round: state.round,
    hostId: state.hostId, turn: state.turn, marks: state.marks, winner: state.winner, reason: state.reason,
    wins: state.wins, turnStartedAt: state.turnStartedAt, turnCount: state.turnCount, serverNow: now,
    board: state.board.map(c => ({ word: c.word, revealed: c.revealed ? c.role : null, key: showKey ? c.role : null })),
    left: Object.fromEntries(TEAMS.map(t => [t, agentsLeft(state, t)])),
    automatic: Object.fromEntries(TEAMS.map(t => [t, isAutomatic(state, t)])),
    players: state.players.map(p => ({ id: p.id, name: p.name, bot: false, team: p.team, role: p.role })),
    me: me && { id: me.id, team: me.team, role: me.role },
    log: state.log.slice(-40),
  };
}
