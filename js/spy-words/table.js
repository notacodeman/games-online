// Spy Words' table: the score and turn banner, the clue (or the spymaster's clue form), the 5×5 board, teams and
// log; plus the teams section of the lobby. Redrawn from the view every time it changes.

import { el, $, toast } from '../util.js';
import { play as playSound } from '../sound.js';
import { UNLIMITED } from '../../lib/spy-words/game.js';

const LOG_ROWS = 10;           // log lines shown before the log scrolls
const LONG_WORD = 9;           // words this long get a smaller font so they fit a card on a phone
const LONGER_WORD = 11;
const capital = text => (text ? text[0].toUpperCase() + text.slice(1) : '');

// ---- lobby section: teams and spymasters ----

export function teamsPanel(view, send) {
  const me = view.me;
  const isHost = me && view.hostId === me.id;
  const column = team => {
    const members = view.players.filter(p => p.team === team);
    const spymaster = members.find(p => p.role === 'spymaster');
    const operatives = members.filter(p => p.role !== 'spymaster');
    const mine = me?.team === team;
    const hostTools = p => (isHost ? el('span.host-tools', {},
      p.role !== 'spymaster' ? el('button.link.small', { type: 'button', onclick: () => send({ type: 'setTeam', playerId: p.id, team, role: 'spymaster' }) }, 'spymaster') : null,
      el('button.link.small', { type: 'button', onclick: () => send({ type: 'setTeam', playerId: p.id, team: team === 'red' ? 'blue' : 'red', role: 'operative' }) }, 'swap'),
    ) : null);
    return el(`div.team-column.${team}`, {},
      el('h3', {}, capital(team)),
      el('p.role-label', {}, 'Spymaster'),
      spymaster
        ? el('p.member.spymaster', {}, el('span', {}, spymaster.name), spymaster.id === me?.id ? el('span.tag', {}, 'you') : null)
        : el('p.member.empty', {}, members.length ? 'Nobody yet' : '—'),
      el('p.role-label', {}, 'Operatives'),
      operatives.length
        ? el('ul.members', {}, ...operatives.map(p => el('li.member', {}, el('span', {}, p.name), p.id === me?.id ? el('span.tag', {}, 'you') : null, hostTools(p))))
        : el('p.member.empty', {}, members.length ? 'Nobody yet' : 'No players: played automatically'),
      me ? el('div.buttons', {},
        !mine || me.role === 'spymaster' ? el('button.small', { type: 'button', onclick: () => send({ type: 'setTeam', team, role: 'operative' }) }, mine ? 'Be an operative' : `Join ${team}`) : null,
        !(mine && me.role === 'spymaster') ? el('button.small', { type: 'button', onclick: () => send({ type: 'setTeam', team, role: 'spymaster' }) }, spymaster ? 'Take over as spymaster' : 'Be spymaster') : null,
      ) : null,
    );
  };
  return [
    el('h2', {}, 'Teams'),
    el('div.teams-grid', {}, column('red'), column('blue')),
    el('p.muted.small', {}, 'Each team with players needs a spymaster and at least one operative. With 2 or 3 people, put everyone on red: blue then plays automatically.'),
    isHost ? el('div.buttons', {}, el('button', { type: 'button', onclick: () => send({ type: 'shuffleTeams' }) }, 'Shuffle teams')) : null,
    view.wins.red || view.wins.blue ? el('p.muted.small', {}, `Games won so far: red ${view.wins.red}, blue ${view.wins.blue}.`) : null,
  ];
}

// ---- the table ----

export function showTable(root, game, { onLeave, onPlayAgain }) {
  let view = null;
  let busy = false;
  let clockOffset = 0;

  root.replaceChildren(el('div.sw-screen', {},
    el('section.sw-main', { 'aria-label': 'Board' },
      el('div.sw-score'),
      el('div.sw-clue', { 'aria-live': 'polite' }),
      el('div.sw-board'),
      el('div.sw-actions'),
      el('div.round-panel', { hidden: true }),
    ),
    el('aside.side', {},
      el('div.side-head', {}, el('h2', {}, 'Spy Words'), el('button.link', { type: 'button', onclick: () => onLeave() }, 'Leave')),
      el('div.game-info'),
      el('div.sw-teams'),
      el('h2', {}, 'Log'),
      el('ol.log', { style: { '--rows': LOG_ROWS } }),
    ),
  ));

  async function send(action) {
    if (busy) return;
    busy = true;
    try {
      await game.send(action);
    } catch (error) {
      playSound('error');
      toast(error.message);
    } finally {
      busy = false;
    }
  }

  const me = () => view.me;
  const nameOf = id => view.players.find(p => p.id === id)?.name || '?';
  const spymasterName = team => view.players.find(p => p.team === team && p.role === 'spymaster')?.name;
  // it's this player's move: their spymaster turn to give a clue, or their operative turn to guess
  const myJob = v => {
    const m = v?.me;
    if (!m || v.phase !== 'playing' || m.team !== v.turn?.team) return false;
    return m.role === 'spymaster' ? v.turn.phase === 'clue' : v.turn.phase === 'guess';
  };
  const canGuess = () => myJob(view) && me().role === 'operative';

  // ---- sounds ----
  function playSounds(before, after) {
    if (!before) return;
    if (after.phase === 'gameOver' && before.phase !== 'gameOver') { playSound('roundOver'); return; }
    const flipped = after.board.find((c, i) => c.revealed && !before.board[i]?.revealed);
    if (flipped) {
      const team = before.turn?.team;
      playSound(flipped.revealed === 'assassin' ? 'caught' : flipped.revealed === team ? 'play' : 'draw');
    }
    if (after.turnCount > before.turnCount) playSound('turnEnd', 120);
    if (myJob(after) && !myJob(before)) playSound('yourTurn', 280);
  }

  // ---- drawing ----
  function render() {
    document.title = myJob(view) ? '● Your turn · Spy Words' : 'Spy Words · Games';
    renderScore();
    renderClue();
    renderBoard();
    renderActions();
    renderGameOver();
    renderSide();
  }

  function renderScore() {
    const turnTeam = view.phase === 'playing' ? view.turn.team : null;
    const side = team => el(`div.sw-team.${team}${turnTeam === team ? '.current' : ''}`, {},
      el('span.sw-left', {}, view.left[team]),
      el('span.sw-team-name', {}, `${capital(team)} agents left`, view.automatic[team] ? ' (automatic)' : ''));
    let status = '';
    if (view.phase === 'gameOver') status = `${capital(view.winner)} wins`;
    else if (view.automatic[turnTeam]) status = `${capital(turnTeam)} is uncovering an agent…`;
    else if (view.turn.phase === 'clue') status = `${capital(turnTeam)}: ${spymasterName(turnTeam) || 'no spymaster yet'} is thinking…`;
    else status = `${capital(turnTeam)} is guessing`;
    $('.sw-score', root).replaceChildren(side('red'), el('div.sw-status', {}, status, timerBar()), side('blue'));
  }

  // a bar that empties over the turn timer's length
  function timerBar() {
    const total = view.rules.turnSeconds;
    if (!total || view.phase !== 'playing' || view.automatic[view.turn.team]) return null;
    const elapsed = Math.max(0, (Date.now() + clockOffset - view.turnStartedAt) / 1000);
    return el('span.timer', { style: { '--total': `${total}s`, '--elapsed': `-${elapsed}s` } });
  }

  function renderClue() {
    const box = $('.sw-clue', root);
    const turn = view.turn;
    const m = me();
    if (view.phase !== 'playing') { box.replaceChildren(); return; }
    box.className = `sw-clue ${turn.team}`;
    if (!(m?.role === 'spymaster' && m.team === turn.team && turn.phase === 'clue')) delete box.dataset.turn;
    if (turn.phase === 'guess' && turn.clue) {
      const n = turn.clue.number;
      const left = turn.guessesLeft === null ? 'unlimited guesses' : `${turn.guessesLeft} guess${turn.guessesLeft === 1 ? '' : 'es'} left`;
      box.replaceChildren(el('span.clue-label', {}, 'Clue'), el('span.clue-word', {}, turn.clue.word),
        el('span.clue-number', {}, n === UNLIMITED ? '∞' : n), el('span.clue-left', {}, left));
      return;
    }
    if (m?.role === 'spymaster' && m.team === turn.team && turn.phase === 'clue') {
      // keep the form (and whatever is typed in it) when other updates arrive during the same turn
      if (box.querySelector('.clue-form') && box.dataset.turn === String(view.turnCount)) return;
      box.dataset.turn = String(view.turnCount);
      const word = el('input', { id: 'clue-word', maxlength: 24, autocomplete: 'off', placeholder: 'One word', 'aria-label': 'Clue word' });
      const number = el('select', { id: 'clue-number', 'aria-label': 'How many cards' },
        ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map(n => el('option', { value: n }, n)), el('option', { value: UNLIMITED }, '∞'));
      box.replaceChildren(el('form.clue-form', {
        onsubmit: event => {
          event.preventDefault();
          const value = number.value === UNLIMITED ? UNLIMITED : Number(number.value);
          send({ type: 'clue', word: word.value, number: value });
        },
      }, el('span.clue-label', {}, 'Your clue'), word, number, el('button.primary', { type: 'submit' }, 'Give clue')));
      if (!box.contains(document.activeElement)) word.focus({ preventScroll: true });
      return;
    }
    box.replaceChildren(el('span.clue-waiting', {}, view.automatic[turn.team]
      ? `${capital(turn.team)} has no players and will uncover one of its own agents.`
      : `Waiting for ${spymasterName(turn.team) || `a ${turn.team} spymaster`} to give a clue.`));
  }

  function renderBoard() {
    const guessing = canGuess();
    const myId = me()?.id;
    $('.sw-board', root).replaceChildren(...view.board.map((card, index) => {
      const marks = view.marks[index] || [];
      const classes = ['sw-card'];
      if (card.revealed) classes.push('revealed', card.revealed);
      else if (card.key) classes.push('key', card.key);
      if (marks.includes(myId)) classes.push('mine');
      if (guessing && !card.revealed) classes.push('pickable');
      if (card.word.length >= LONGER_WORD) classes.push('longer');
      else if (card.word.length >= LONG_WORD) classes.push('long');
      const label = card.revealed ? `${card.word}: ${card.revealed}` : card.key ? `${card.word} (${card.key})` : card.word;
      return el(`button.${classes.join('.')}`, {
        type: 'button', 'aria-label': label, disabled: !guessing || !!card.revealed,
        onclick: () => send({ type: marks.includes(myId) ? 'guess' : 'mark', index }),
      },
      el('span.sw-word', {}, card.word),
      card.revealed === 'assassin' || (!card.revealed && card.key === 'assassin') ? el('span.sw-icon', { 'aria-hidden': 'true' }, '☠') : null,
      marks.length ? el('span.sw-marks', {}, ...marks.map(id => el('span.sw-mark', {}, nameOf(id)))) : null);
    }));
  }

  function renderActions() {
    const box = $('.sw-actions', root);
    const m = me();
    if (view.phase !== 'playing') { box.replaceChildren(); return; }
    if (canGuess()) {
      box.replaceChildren(
        el('p.muted.small', {}, 'Tap a card to point at it, tap it again to pick it.'),
        el('button', { type: 'button', disabled: view.turn.guessesMade === 0, onclick: () => send({ type: 'endTurn' }) }, 'End turn'));
    } else if (m?.role === 'spymaster' && m.team) {
      box.replaceChildren(el('p.muted.small', {}, 'You’re a spymaster: you see the key. Tinted cards are agents, ☠ is the assassin.'));
    } else if (!m) {
      box.replaceChildren(el('p.muted.small', {}, 'You’re watching.'));
    } else if (!view.players.some(p => p.team === m.team && p.role === 'spymaster')) {
      box.replaceChildren(el('button', { type: 'button', onclick: () => send({ type: 'setTeam', team: m.team, role: 'spymaster' }) }, `Become ${m.team}’s spymaster`));
    } else box.replaceChildren();
  }

  function renderGameOver() {
    const panel = $('.round-panel', root);
    if (view.phase !== 'gameOver') { panel.hidden = true; return; }
    panel.hidden = false;
    const isHost = me() && view.hostId === me().id;
    panel.replaceChildren(el(`div.round-box.sw-over.${view.winner}`, {},
      el('h2', {}, `${capital(view.winner)} wins!`),
      el('p.muted', {}, view.reason === 'assassin'
        ? `${capital(view.winner === 'red' ? 'blue' : 'red')} picked the assassin.`
        : `${capital(view.winner)} found all its agents.`),
      el('p.muted', {}, `Games won: red ${view.wins.red}, blue ${view.wins.blue}. The whole key is shown on the board.`),
      el('div.buttons', {},
        el('button', { type: 'button', onclick: () => { panel.hidden = true; } }, 'See the board'),
        isHost ? el('button.primary', { type: 'button', onclick: () => onPlayAgain() }, 'New game') : el('p.muted', {}, `Waiting for ${nameOf(view.hostId)} to start a new game.`)),
    ));
  }

  function renderSide() {
    $('.game-info', root).replaceChildren(
      game.code ? el('p', {}, 'Code ', el('strong.code', {}, game.code)) : null,
      el('p.muted', {}, `Game ${view.round} · won: red ${view.wins.red}, blue ${view.wins.blue}`),
    );
    const list = team => view.players.filter(p => p.team === team)
      .map(p => el('li', {}, p.name, p.role === 'spymaster' ? el('span.tag', {}, 'spymaster') : null, p.id === me()?.id ? el('span.tag', {}, 'you') : null));
    $('.sw-teams', root).replaceChildren(
      el('div.sw-roster.red', {}, el('h3', {}, 'Red'), el('ul', {}, ...list('red'))),
      el('div.sw-roster.blue', {}, el('h3', {}, 'Blue'), el('ul', {}, ...list('blue'))));
    const logBox = $('.log', root);
    const atBottom = logBox.scrollHeight - logBox.scrollTop - logBox.clientHeight < 8;
    logBox.replaceChildren(...view.log.map(l => el('li', {}, l.text)));
    if (atBottom) logBox.scrollTop = logBox.scrollHeight;
  }

  const unsubscribe = game.subscribe((next, error) => {
    if (error) { toast(error.message); return; }
    if (next.phase === 'lobby') { onPlayAgain(next); return; }
    const before = view;
    view = next;
    clockOffset = next.serverNow - Date.now();
    playSounds(before, next);
    render();
  });
  if (game.view) {
    view = game.view;
    render();
    if (myJob(view)) playSound('yourTurn');
  }
  return () => { unsubscribe(); document.title = 'Games'; };
}
