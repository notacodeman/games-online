// The start page (join with a code, public games, create a lobby or practice) and switching between it, the lobby
// and a game's table. An online game lives in the URL as ?g=CODE so a refresh or a shared link comes back to it.

import { el, $, api, store, seats, toast } from './util.js';
import { unlock, isMuted, setMuted } from './sound.js';
import { OnlineGame } from './online.js';
import { PracticeGame } from './practice.js';
import { showLobby, rulesForm } from './lobby.js';
import { GAMES, DEFAULT_GAME, TABLES, HOW_TO } from './games.js';
import { cleanCode } from '../lib/store.js';

const NAME_LENGTH = 16;
const LIST_REFRESH_MS = 5000;   // how often the public games list refreshes while the start page is open
const LIST_ROWS = 8;            // public games shown before the list scrolls

const root = $('#app');
let game = null;       // the current OnlineGame or PracticeGame
let teardown = null;   // undoes the current screen's listeners and timers

function clearScreen() {
  if (teardown) teardown();
  teardown = null;
}
function stopGame() {
  if (game) game.stop();
  game = null;
}
function setUrl(code) {
  const url = code ? `/?g=${code}` : '/';
  if (location.pathname + location.search !== url) history.pushState(null, '', url);
}
const myName = () => store.get('name', '');

// ---- start page ----
function showHome(message) {
  clearScreen();
  stopGame();
  setUrl(null);
  document.title = 'Games';
  let chosen = GAMES[store.get('lastGame')] ? store.get('lastGame') : DEFAULT_GAME;
  let isPublic = store.get('public', true);

  const nameInput = el('input', { id: 'name', maxlength: NAME_LENGTH, autocomplete: 'nickname', value: myName(), placeholder: 'Your name' });
  nameInput.addEventListener('input', () => store.set('name', nameInput.value.trim()));
  const codeInput = el('input', { id: 'code', maxlength: 8, autocomplete: 'off', placeholder: 'ABCDE', spellcheck: 'false' });

  root.replaceChildren(el('div.home', {},
    el('section.hero', {},
      el('h1', {}, 'Games'),
      el('p.tagline', {}, 'Card and party games to play with friends in the browser. No accounts, no installs.'),
      message ? el('p.notice', {}, message) : null,
    ),
    el('div.home-top', {},
      el('div.field', {}, el('label', { for: 'name' }, 'Your name'), nameInput),
      el('form.join', { onsubmit: event => { event.preventDefault(); join(cleanCode(codeInput.value)); } },
        el('label', { for: 'code' }, 'Have a code? Join a game'),
        el('div.inline', {}, codeInput, el('button.primary', { type: 'submit' }, 'Join'))),
    ),
    el('div.home-grid', {},
      el('section.panel.public-games', {},
        el('div.panel-head', {}, el('h2', {}, 'Public games'), el('span.muted.small.list-status')),
        el('ul.game-list', { style: { '--rows': LIST_ROWS } }),
      ),
      el('section.panel.create', {},
        el('h2', {}, 'Create a lobby'),
        el('div.game-picker', { role: 'radiogroup', 'aria-label': 'Game' }),
        el('p.muted.game-blurb'),
        el('div.segmented', { role: 'group', 'aria-label': 'Who can find this game' },
          el('button.public-on', { type: 'button', onclick: () => setVisibility(true) }, 'Public'),
          el('button.public-off', { type: 'button', onclick: () => setVisibility(false) }, 'Private')),
        el('p.muted.small.visibility-note'),
        el('div.buttons', {}, el('button.primary', { type: 'button', onclick: create }, 'Create lobby')),
        el('div.practice', {},
          el('h3', {}, 'Or practice against bots'),
          el('div.inline', {}, el('label.sr-only', { for: 'bots' }, 'Bots'), el('select', { id: 'bots' }),
            el('button', { type: 'button', onclick: practice }, 'Play')),
          el('details.rules-details', {}, el('summary', {}, 'Practice rules'), el('div.practice-rules'))),
      ),
    ),
    el('section.panel.how', {}, el('h2'), el('ul')),
  ));

  function setVisibility(value) {
    isPublic = value;
    store.set('public', value);
    drawCreate();
  }

  // the chosen game's tile, blurb, visibility, bots and practice rules
  function drawCreate() {
    const info = GAMES[chosen];
    $('.game-picker', root).replaceChildren(
      ...Object.values(GAMES).map(g => el(`button.game-tile${g.id === chosen ? '.selected' : ''}`, {
        type: 'button', role: 'radio', 'aria-checked': String(g.id === chosen),
        onclick: () => { chosen = g.id; store.set('lastGame', g.id); drawCreate(); },
      }, el('span.tile-name', {}, g.name), el('span.tile-meta', {}, `${g.minPlayers}–${g.maxPlayers} players`))),
      el('div.game-tile.soon', { 'aria-hidden': 'true' }, el('span.tile-name', {}, 'More games'), el('span.tile-meta', {}, 'coming later')),
    );
    $('.game-blurb', root).textContent = info.blurb;
    $('.public-on', root).classList.toggle('selected', isPublic);
    $('.public-off', root).classList.toggle('selected', !isPublic);
    $('.public-on', root).setAttribute('aria-pressed', String(isPublic));
    $('.public-off', root).setAttribute('aria-pressed', String(!isPublic));
    $('.visibility-note', root).textContent = isPublic
      ? 'Public: listed under Public games so anyone can join. You can change this in the lobby.'
      : 'Private: only people with the code or link can join. You can change this in the lobby.';
    const saved = store.get('bots', 3);
    $('#bots', root).replaceChildren(...Array.from({ length: info.maxPlayers - 1 }, (_, i) =>
      el('option', { value: i + 1, selected: i + 1 === saved }, `${i + 1} bot${i ? 's' : ''}`)));
    const rules = practiceRules();
    $('.practice-rules', root).replaceChildren(rulesForm(info.ruleOptions, rules, next => store.set(`rules:${chosen}`, next)));
    $('.how h2', root).textContent = `How to play ${info.name}`;
    $('.how ul', root).replaceChildren(...(HOW_TO[chosen] || []).map(line => el('li', {}, line)));
  }
  const practiceRules = () => ({ ...GAMES[chosen].defaultRules, ...store.get(`rules:${chosen}`, {}) });

  // the public games list, refreshed while this page is open
  async function loadList() {
    const status = $('.list-status', root);
    try {
      const { games } = await api('/api/games');
      status.textContent = games.length ? `${games.length} open` : '';
      const list = $('.game-list', root);
      list.replaceChildren(...(games.length ? games.map(g => {
        const open = g.phase === 'lobby';
        const full = g.players >= g.maxPlayers;
        return el(`li.row${open ? '' : '.playing'}`, {},
          el('div.row-main', {},
            el('span.row-title', {}, `${g.host || 'Someone'}’s game`),
            el('span.row-sub', {}, `${g.gameName} · ${g.players}/${g.maxPlayers} players · ${open ? (full ? 'full' : 'waiting in lobby') : 'playing'}`)),
          el('button', { type: 'button', onclick: () => join(g.code), disabled: open && full }, open ? 'Join' : 'Watch'));
      }) : [el('li.empty', {}, 'No public games right now. Create one and it shows up here.')]));
    } catch (error) {
      status.textContent = error.message;
    }
  }

  drawCreate();
  loadList();
  const listTimer = setInterval(() => { if (!document.hidden) loadList(); }, LIST_REFRESH_MS);
  teardown = () => clearInterval(listTimer);

  async function create() {
    unlock();
    try {
      const body = await api('/api/games', { json: { game: chosen, name: myName(), rules: GAMES[chosen].defaultRules, public: isPublic } });
      seats.set(body.code, { token: body.token, playerId: body.playerId });
      openOnline(body.code, body.view);
    } catch (error) { toast(error.message); }
  }

  function practice() {
    unlock();
    const bots = Number($('#bots', root).value);
    store.set('bots', bots);
    startPractice(chosen, { name: myName(), bots, rules: practiceRules() });
  }
}

function startPractice(gameId, settings) {
  clearScreen();
  stopGame();
  setUrl(null);
  game = new PracticeGame(GAMES[gameId].engine, settings);
  teardown = TABLES[gameId](root, game, {
    onLeave: () => showHome(),
    onPlayAgain: () => startPractice(gameId, settings),
  });
}

// ---- online ----
async function join(code) {
  if (!code) { toast('Enter the game code.'); return; }
  unlock();
  if (seats.get(code)) { openOnline(code); return; }
  if (!myName()) { openOnline(code); return; }   // shows the name prompt for a lobby, or the table to watch
  try {
    const body = await api(`/api/games/${code}/join`, { json: { name: myName() } });
    seats.set(code, { token: body.token, playerId: body.playerId });
    openOnline(code, body.view);
  } catch (error) {
    // a game that already started can still be watched
    if (error.status === 409) openOnline(code);
    else toast(error.message);
  }
}

function openOnline(code, view = null) {
  clearScreen();
  stopGame();
  setUrl(code);
  game = new OnlineGame(code, seats.get(code), view);
  const current = game;
  const leave = async () => {
    if (current.playerId && !confirm('Leave this game? A bot takes your seat if it has started.')) return;
    if (current.playerId) await current.send({ type: 'leave' }).catch(() => {});
    seats.set(code, null);
    showHome();
  };
  const show = () => {
    clearScreen();
    const v = current.view;
    if (!v) {
      // wait for the first poll, then pick the screen
      root.replaceChildren(el('p.loading', {}, `Loading game ${code}…`));
      const off = current.subscribe((next, error) => {
        off();
        if (error) showHome(error.status === 404 ? `No game with the code ${code}. It may have ended.` : error.message);
        else show();
      });
      teardown = off;
      return;
    }
    if (v.phase === 'lobby' && !current.playerId) {
      showJoinPrompt(code, v);
      return;
    }
    const table = TABLES[v.game];
    if (!table) { showHome('This game type isn’t available any more.'); return; }
    teardown = v.phase === 'lobby'
      ? showLobby(root, current, { onStart: show, onLeave: leave })
      : table(root, current, {
        onLeave: leave,
        onPlayAgain: next => (next ? show() : current.send({ type: 'playAgain' }).catch(error => toast(error.message))),
      });
  };
  show();
}

// someone opened an invite link (or picked a public game) without a seat or a name yet
function showJoinPrompt(code, view) {
  const nameInput = el('input', { id: 'join-name', maxlength: NAME_LENGTH, value: myName(), placeholder: 'Your name', required: true });
  const host = view.players.find(p => p.id === view.hostId);
  root.replaceChildren(el('section.panel.join-prompt', {},
    el('h2', {}, `Join ${host ? `${host.name}’s` : 'this'} ${GAMES[view.game]?.name || ''} game`),
    el('p.muted', {}, `Code ${code} · ${view.players.length} seated`),
    el('form', {
      onsubmit: event => {
        event.preventDefault();
        store.set('name', nameInput.value.trim());
        seats.set(code, null);
        join(code);
      },
    }, el('label', { for: 'join-name' }, 'Your name'), el('div.inline', {}, nameInput, el('button.primary', { type: 'submit' }, 'Join'))),
    el('button.link', { type: 'button', onclick: () => showHome() }, 'Back'),
  ));
  nameInput.focus();
}

// ---- banner: logo goes home, sound toggle ----
$('#logo').addEventListener('click', event => { event.preventDefault(); showHome(); });
const soundButton = $('#sound');
const drawSoundButton = () => {
  soundButton.setAttribute('aria-pressed', String(!isMuted()));
  soundButton.textContent = isMuted() ? 'Sound off' : 'Sound on';
};
soundButton.addEventListener('click', () => { setMuted(!isMuted()); drawSoundButton(); });
drawSoundButton();

function route() {
  const code = cleanCode(new URLSearchParams(location.search).get('g'));
  if (code) openOnline(code); else showHome();
}
window.addEventListener('popstate', route);
route();
