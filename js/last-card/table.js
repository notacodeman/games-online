// The game table: other players' seats, the piles, your hand, the status line with its buttons, the round-over
// panel and the log. Redrawn from the view every time it changes; sounds come from comparing it to the last one.

import { el, $, toast } from '../util.js';
import { cardFace, cardBack } from './cards.js';
import { play as playSound } from '../sound.js';
import { choose } from '../dialogs.js';
import { COLORS, isWild, cardName } from '../../lib/last-card/game.js';
import { houseRules } from '../../lib/last-card/rules.js';

const LOG_ROWS = 10;             // log lines shown before the log scrolls
const MAX_BACKS_SHOWN = 12;      // card backs drawn on a seat; more than this is just the number
const HAND_GAP_PX = 6;           // space between cards when the hand fits
const MAX_OVERLAP = 0.72;        // cards may cover up to this much of each other before the hand scrolls
const COLOR_ORDER = [...COLORS, null];
const VALUE_ORDER = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'skip', 'reverse', 'draw2', 'wild', 'wild4'];

const byColorThenValue = (a, b) =>
  COLOR_ORDER.indexOf(a.color) - COLOR_ORDER.indexOf(b.color) || VALUE_ORDER.indexOf(a.value) - VALUE_ORDER.indexOf(b.value);
const capital = text => text[0].toUpperCase() + text.slice(1);

export function showTable(root, game, { onLeave, onPlayAgain }) {
  let view = null;
  let armed = false;            // Last card! pressed, sent with the next play
  let busy = false;
  let clockOffset = 0;          // server time minus this browser's time, for the turn timer
  const nameOf = id => view.players.find(p => p.id === id)?.name || '?';

  root.replaceChildren(el('div.table-screen',
    {},
    el('section.table', { 'aria-label': 'Game table' },
      el('div.seats'),
      el('div.center',
        {},
        el('button.pile.draw-pile', { type: 'button', 'aria-label': 'Draw a card', onclick: () => send({ type: 'draw' }) }),
        el('div.pile.discard-pile'),
        el('div.direction', { 'aria-hidden': 'true' }),
      ),
      el('div.status', { 'aria-live': 'polite' }),
      el('div.hand-area', {}, el('div.me-line'), el('div.hand')),
      el('div.round-panel', { hidden: true }),
    ),
    el('aside.side',
      {},
      el('div.side-head', {}, el('h2', {}, 'Game'), el('button.link', { type: 'button', onclick: () => onLeave() }, 'Leave')),
      el('div.game-info'),
      el('h2', {}, 'Log'),
      el('ol.log', { style: { '--rows': LOG_ROWS } }),
    ),
  ));

  // keep the hand fitted to its width, refitting only when the width changes
  const handBox = $('.hand', root);
  let lastWidth = 0;
  const resize = new ResizeObserver(() => {
    if (handBox.clientWidth !== lastWidth) { lastWidth = handBox.clientWidth; fitHand(); }
  });
  resize.observe(handBox);

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

  // ---- sounds: compare the new view with the last one ----
  function playSounds(before, after) {
    if (!before || before.phase !== 'playing' && after.phase !== 'playing') return;
    const lines = newLogLines(before, after);
    const text = lines.map(l => l.text).join('\n');
    if (after.phase === 'roundOver' || after.phase === 'gameOver') {
      if (before.phase === 'playing') playSound('roundOver');
      return;
    }
    if (/ catches /.test(text)) playSound('caught');
    else if (/“Last card!”/.test(text)) playSound('lastCard');
    if (after.top?.id !== before.top?.id) playSound('play');
    else if (/ draws? /.test(text)) playSound('draw');
    if (after.turnCount > before.turnCount) {
      playSound('turnEnd', 90);
      if (after.turn === game.playerId) playSound('yourTurn', 260);
    } else if (before.phase !== 'playing' && after.turn === game.playerId) {
      playSound('yourTurn', 200);
    }
  }
  const newLogLines = (before, after) => {
    const last = before.log[before.log.length - 1];
    if (!last) return after.log;
    const at = after.log.findIndex(l => l.at === last.at && l.text === last.text);
    return at < 0 ? after.log : after.log.slice(at + 1);
  };

  // ---- drawing ----
  function render() {
    const me = view.me;
    const myTurn = me && view.turn === me.id && view.phase === 'playing';
    if (!me || me.hand.length !== 2) armed = false;
    document.title = myTurn ? '● Your turn · Last Card' : 'Last Card · Games';
    renderSeats(me);
    renderCenter(myTurn);
    renderStatus(me, myTurn);
    renderHand(me, myTurn);
    renderRoundPanel();
    renderSide();
  }

  // everyone else, in playing order starting after you
  function renderSeats(me) {
    const players = view.players;
    const mine = me ? players.findIndex(p => p.id === me.id) : -1;
    const ordered = mine < 0 ? players : [...players.slice(mine + 1), ...players.slice(0, mine)];
    const isHost = me && view.hostId === me.id;
    $('.seats', root).replaceChildren(...ordered.map(p => {
      const current = view.phase === 'playing' && view.turn === p.id;
      const backs = Math.min(p.count, MAX_BACKS_SHOWN);
      return el(`div.seat${current ? '.current' : ''}`, {},
        el('div.seat-name', {}, el('span.name', {}, p.name), p.bot ? el('span.tag', { title: `Bot, ${p.level || 'medium'} level` }, 'bot') : null,
          p.id === view.hostId ? el('span.tag', {}, 'host') : null),
        el('div.seat-cards', { 'aria-label': `${p.count} cards` },
          el('span.fan', { style: { '--n': backs } }, ...Array.from({ length: backs }, (_, i) => el('span.mini-back', { style: { '--i': i } }))),
          el('span.count', {}, p.count)),
        el('div.seat-foot', {},
          view.rules.targetScore ? el('span.score', {}, `${p.score} pts`) : null,
          p.safe ? el('span.badge.last', {}, 'Last card!') : null,
          view.exposed === p.id && me && me.id !== p.id
            ? el('button.catch', { type: 'button', onclick: () => send({ type: 'catch', playerId: p.id }) }, 'Catch!') : null,
        ),
        current ? timerBar() : null,
        isHost && !p.bot && view.phase !== 'lobby'
          ? el('button.link.small', { type: 'button', onclick: () => confirmReplace(p) }, 'Bot takes seat') : null,
      );
    }));
  }

  function confirmReplace(player) {
    if (confirm(`Let a bot take over ${player.name}’s seat? They keep their cards and score, and ${player.name} can’t come back to it.`)) {
      send({ type: 'replaceWithBot', playerId: player.id });
    }
  }

  // a bar that empties over the turn timer's length
  function timerBar() {
    const total = view.rules.turnSeconds;
    if (!total || view.phase !== 'playing') return null;
    const elapsed = Math.max(0, (Date.now() + clockOffset - view.turnStartedAt) / 1000);
    return el('span.timer', { style: { '--total': `${total}s`, '--elapsed': `-${elapsed}s` } });
  }

  function renderCenter(myTurn) {
    const drawPile = $('.draw-pile', root);
    drawPile.replaceChildren(cardBack(), el('span.pile-count', {}, `${view.deckCount} left`));
    drawPile.disabled = !(myTurn && view.color !== null && view.drawn === null);
    const discard = $('.discard-pile', root);
    discard.replaceChildren(...[view.top ? cardFace(view.top, { chosenColor: view.color }) : null,
      view.color ? el(`span.current-color.${view.color}`, {}, capital(view.color)) : null].filter(Boolean));
    discard.dataset.color = view.color || '';
    $('.direction', root).textContent = view.direction === 1 ? '↻' : '↺';
    $('.direction', root).title = view.direction === 1 ? 'Play goes clockwise' : 'Play goes counter-clockwise';
  }

  function renderStatus(me, myTurn) {
    const box = $('.status', root);
    const parts = [];
    const buttons = [];
    const current = nameOf(view.turn);
    if (view.phase !== 'playing') {
      parts.push(view.phase === 'gameOver' ? 'Game over.' : 'Round over.');
    } else if (view.color === null) {
      if (myTurn) {
        parts.push('The first card is a Wild: pick the starting color.');
        buttons.push(...COLORS.map(c => el(`button.color-choice.${c}`, { type: 'button', onclick: () => send({ type: 'color', color: c }) }, capital(c))));
      } else parts.push(`${current} is picking the starting color.`);
    } else if (myTurn && view.pending) {
      const { amount, kind, challengeable } = view.pending;
      parts.push(`${nameOf(view.pending.by)} hit you with ${kind === 'wild4' ? 'a Wild Draw Four' : 'a Draw Two'}: ${amount} cards.`);
      if (me.playable.length) parts.push('Stack a card to pass it on, or take them.');
      buttons.push(el('button.primary', { type: 'button', onclick: () => send({ type: 'draw' }) }, `Take ${amount}`));
      if (challengeable) {
        buttons.push(el('button', {
          type: 'button', title: 'If they had a card of the previous color they draw 4; if not you draw 6.',
          onclick: () => send({ type: 'challenge' }),
        }, 'Challenge'));
      }
    } else if (myTurn && view.drawn !== null) {
      parts.push('You drew a card you can play. Play it or keep it.');
      buttons.push(el('button', { type: 'button', onclick: () => send({ type: 'pass' }) }, 'Keep it'));
    } else if (myTurn) {
      parts.push(me.playable.length ? 'Your turn: play a card or draw.' : 'Your turn: nothing fits, draw a card.');
      buttons.push(el(`button${me.playable.length ? '' : '.primary'}`, { type: 'button', onclick: () => send({ type: 'draw' }) }, 'Draw'));
    } else {
      const bot = view.players.find(p => p.id === view.turn)?.bot;
      parts.push(`${current}’s turn${bot ? '…' : '.'}`);
      if (me?.jumpIn.length) parts.push('You can jump in!');
    }
    // Last card!: arm it before playing your second-to-last card, or call it late if nobody has caught you yet
    if (me && view.phase === 'playing') {
      if (myTurn && me.hand.length === 2 && me.playable.length && view.rules.lastCardPenalty) {
        buttons.push(el(`button.last-call${armed ? '.armed' : ''}`, {
          type: 'button', 'aria-pressed': String(armed), onclick: () => { armed = !armed; render(); },
        }, armed ? 'Last card! ✓' : 'Last card!'));
      } else if (me.hand.length === 1 && view.exposed === me.id) {
        buttons.push(el('button.last-call.urgent', { type: 'button', onclick: () => send({ type: 'callLast' }) }, 'Last card!'));
      }
    }
    if (!me) parts.push('You’re watching.');
    box.replaceChildren(...[el('p', {}, parts.join(' ')), buttons.length ? el('div.buttons', {}, ...buttons) : null,
      myTurn ? timerBar() : null].filter(Boolean));
    box.classList.toggle('mine', !!myTurn);
  }

  function renderHand(me, myTurn) {
    const hand = $('.hand', root);
    $('.me-line', root).replaceChildren(me
      ? el('span', {}, el('strong', {}, nameOf(me.id)), ` · ${me.hand.length} card${me.hand.length === 1 ? '' : 's'}`,
        view.rules.targetScore ? ` · ${view.players.find(p => p.id === me.id).score} pts` : '')
      : '');
    if (!me) { hand.replaceChildren(); return; }
    const cards = [...me.hand].sort(byColorThenValue);
    hand.replaceChildren(...cards.map(card => {
      const playable = myTurn && me.playable.includes(card.id);
      const jump = !myTurn && me.jumpIn.includes(card.id);
      const node = cardFace(card, { tag: 'button', type: 'button', onclick: () => playCard(card, jump) });
      node.classList.toggle('playable', playable || jump);
      node.classList.toggle('dim', myTurn && !playable);
      node.classList.toggle('just-drawn', view.drawn === card.id);
      return node;
    }));
    hand.classList.toggle('my-turn', !!myTurn);
    fitHand();
  }

  // overlap the cards just enough to fit the width; past MAX_OVERLAP the hand scrolls sideways instead
  function fitHand() {
    const cards = handBox.children;
    if (!cards.length) return;
    const style = getComputedStyle(handBox);
    const width = handBox.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    const cardWidth = cards[0].offsetWidth;
    const n = cards.length;
    let gap = HAND_GAP_PX;
    if (n > 1 && n * cardWidth + (n - 1) * gap > width) {
      gap = Math.max((width - cardWidth) / (n - 1) - cardWidth, -cardWidth * MAX_OVERLAP);
    }
    handBox.style.setProperty('--gap', `${gap}px`);
  }

  async function playCard(card, jump) {
    const me = view.me;
    const myTurn = view.turn === me.id;
    if (!jump && !(myTurn && me.playable.includes(card.id))) {
      playSound('error');
      if (!myTurn) toast(`It’s ${nameOf(view.turn)}’s turn.`);
      else if (view.pending) toast('Take the cards, or stack a matching draw card.');
      else if (view.drawn !== null) toast('You can only play the card you just drew.');
      else toast(`${cardName(card)} doesn’t match. Play ${view.color} or ${cardName(view.top).replace(/^\w+ /, '')}, or draw.`);
      return;
    }
    const action = { type: jump ? 'jumpIn' : 'play', cardId: card.id, callLast: armed };
    if (isWild(card)) {
      action.color = await choose('Pick a color', COLORS.map(c => [c, capital(c), `color-choice ${c}`]));
      if (!action.color) return;
    }
    if (card.value === '7' && view.rules.sevenZero && me.hand.length > 1) {
      const others = view.players.filter(p => p.id !== me.id);
      action.target = await choose('Swap hands with…', others.map(p => [p.id, `${p.name} (${p.count} cards)`, '']));
      if (!action.target) return;
    }
    armed = false;
    send(action);
  }

  function renderRoundPanel() {
    const panel = $('.round-panel', root);
    const result = view.result;
    if (!result || (view.phase !== 'roundOver' && view.phase !== 'gameOver')) { panel.hidden = true; return; }
    panel.hidden = false;
    const gameOver = view.phase === 'gameOver';
    const isHost = view.me && view.hostId === view.me.id;
    const ranked = [...view.players].sort((a, b) => b.score - a.score);
    panel.replaceChildren(el('div.round-box', {},
      el('h2', {}, gameOver ? `${nameOf(result.winnerId)} wins the game!` : `${nameOf(result.winnerId)} wins round ${view.round}`),
      el('p.muted', {}, `+${result.points} points from the cards left in everyone’s hands.`),
      el('ul.leftovers', {}, ...result.hands.map(h => el('li', {},
        el('span.name', {}, nameOf(h.id)), el('span.points', {}, `${h.points}`),
        el('span.mini-cards', {}, ...h.cards.sort(byColorThenValue).map(c => cardFace(c))),
      ))),
      view.rules.targetScore ? el('ol.scores', {}, ...ranked.map(p => el('li', {},
        el('span.name', {}, p.name), el('span.points', {}, `${p.score}`)))) : '',
      view.rules.targetScore && !gameOver ? el('p.muted', {}, `First to ${view.rules.targetScore} wins.`) : '',
      el('div.buttons', {},
        isHost && !gameOver ? el('button.primary', { type: 'button', onclick: () => send({ type: 'nextRound' }) }, 'Next round') : null,
        isHost && gameOver ? el('button.primary', { type: 'button', onclick: () => onPlayAgain() }, 'Play again') : null,
        !isHost ? el('p.muted', {}, `Waiting for ${nameOf(view.hostId)} to ${gameOver ? 'start a new game' : 'deal the next round'}.`) : null,
      ),
    ));
  }

  function renderSide() {
    const rules = houseRules(view.rules);
    $('.game-info', root).replaceChildren(
      game.code ? el('p', {}, 'Code ', el('strong.code', {}, game.code)) : el('p', {}, 'Practice game'),
      el('p.muted', {}, view.rules.targetScore ? `Round ${view.round} · first to ${view.rules.targetScore}` : 'One round'),
      el('p.muted', {}, rules.length ? `House rules: ${rules.join('; ')}.` : 'Official rules.'),
    );
    const logBox = $('.log', root);
    const atBottom = logBox.scrollHeight - logBox.scrollTop - logBox.clientHeight < 8;
    logBox.replaceChildren(...view.log.map(l => el('li', {}, l.text)));
    if (atBottom) logBox.scrollTop = logBox.scrollHeight;
  }

  // ---- updates ----
  const unsubscribe = game.subscribe((next, error) => {
    if (error) { toast(error.message); return; }
    if (next.phase === 'lobby') { onPlayAgain(next); return; }   // the host went back to the lobby
    const before = view;
    view = next;
    clockOffset = next.serverNow - Date.now();
    playSounds(before, next);
    render();
  });
  if (game.view) {
    view = game.view;
    render();
    if (view.phase === 'playing' && view.turn === game.playerId) playSound('yourTurn');
  }

  return () => { unsubscribe(); resize.disconnect(); document.title = 'Games'; };
}
