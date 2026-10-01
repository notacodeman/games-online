// The lobby of an online game (invite link, public or private, who's seated, the rules) and the rules form it
// shares with practice mode on the start page. Works for any game in lib/games.js.

import { el, $, toast, store } from './util.js';
import { GAMES, LOBBY_PANELS } from './games.js';
import { BOT_LEVELS, DEFAULT_LEVEL } from '../lib/last-card/bot.js';

const defaultOf = option => option.default ?? option.official;

// A select of bot levels (Easy … Impossible). onChange gets the level key.
export function botLevelSelect(level, onChange, attrs = {}) {
  const select = el('select.bot-level', attrs,
    ...BOT_LEVELS.map(([key, label]) => el('option', { value: key, selected: key === level }, label)));
  select.addEventListener('change', () => onChange(select.value));
  return select;
}

const officialLabel = option => option.choices.find(([v]) => v === option.official)[1].toLowerCase();

// The rules that differ from official, as "Label: choice" lines.
export const houseRules = (options, rules) => options
  .filter(o => rules[o.key] !== o.official)
  .map(o => `${o.label}: ${o.choices.find(([v]) => v === rules[o.key])[1]}`);

// One select per rule, with its note under it. Main rules come first; the rest sit under "More rules", open when one
// of them is changed. onChange gets the whole rules object after every change.
export function rulesForm(options, rules, onChange, { readOnly = false } = {}) {
  const form = el('div.rules-form');
  const moreGrid = el('div.rules-grid');
  const hasMain = options.some(o => o.main);
  for (const option of options) {
    const id = `rule-${option.key}`;
    const select = el('select', { id, disabled: readOnly },
      ...option.choices.map(([value, label]) =>
        el('option', { value: JSON.stringify(value), selected: value === rules[option.key] }, label)));
    select.addEventListener('change', () => {
      rules = { ...rules, [option.key]: JSON.parse(select.value) };
      field.classList.toggle('house', rules[option.key] !== option.official);
      onChange(rules);
    });
    const field = el(`div.rule${rules[option.key] !== option.official ? '.house' : ''}`, {},
      el('label', { for: id }, option.label), select, el('p.note', {}, `${option.note} Official: ${officialLabel(option)}.`));
    (option.main || !hasMain ? form : moreGrid).append(field);
  }
  if (moreGrid.childElementCount) {
    const changed = options.some(o => !o.main && rules[o.key] !== o.official);
    form.append(el('details.more-rules', { open: changed }, el('summary', {}, 'More rules'), moreGrid));
  }
  if (!readOnly) {
    form.append(el('button.link', {
      type: 'button',
      onclick: () => {
        const defaults = Object.fromEntries(options.map(o => [o.key, defaultOf(o)]));
        form.replaceWith(rulesForm(options, defaults, onChange));
        onChange(defaults);
      },
    }, 'Reset to defaults'));
  }
  return form;
}

export function showLobby(root, game, { onStart, onLeave, onSolo }) {
  let view = null;
  let rulesVersion = null;   // redraw the rules form only when someone else changed them, not while the host edits
  const info = GAMES[game.view?.game] || Object.values(GAMES)[0];

  root.replaceChildren(el('div.lobby',
    {},
    el('section.panel.share', {},
      el('h2', {}, `${info.name} · lobby`),
      el('p.big-code', { 'aria-label': 'Game code' }, game.code),
      el('p.muted', {}, 'Send friends the link, or they can enter the code on the start page.'),
      el('div.buttons', {},
        el('button.primary', { type: 'button', onclick: copyLink }, 'Copy invite link'),
        el('button.link', { type: 'button', onclick: () => onLeave() }, 'Leave'),
      ),
      el('div.visibility'),
    ),
    el('section.panel.players', {}, el('h2', {}, 'Players'), el('ul.player-list'), el('div.host-buttons')),
    LOBBY_PANELS[info.id] ? el('section.panel.game-panel') : null,
    el('section.panel.rules', {}, el('h2', {}, 'Rules'), el('div.rules-box')),
  ));

  async function copyLink() {
    const link = `${location.origin}/?g=${game.code}`;
    try {
      await navigator.clipboard.writeText(link);
      toast('Invite link copied.');
    } catch (_) {
      prompt('Copy this link:', link);
    }
  }

  async function send(action) {
    try { await game.send(action); } catch (error) { toast(error.message); }
  }

  function render() {
    const me = view.me;
    const isHost = me && view.hostId === me.id;
    const hostName = view.players.find(p => p.id === view.hostId)?.name || 'the host';

    $('.visibility', root).replaceChildren(isHost
      ? el('div.segmented', { role: 'group', 'aria-label': 'Who can find this game' },
        el(`button${view.public ? '.selected' : ''}`, { type: 'button', 'aria-pressed': String(view.public), onclick: () => send({ type: 'setPublic', public: true }) }, 'Public'),
        el(`button${view.public ? '' : '.selected'}`, { type: 'button', 'aria-pressed': String(!view.public), onclick: () => send({ type: 'setPublic', public: false }) }, 'Private'))
      : null,
    el('p.muted.small', {}, view.public
      ? 'Public: listed on the start page, anyone can join.'
      : 'Private: only people with the code or link can join.'));

    const levelName = p => BOT_LEVELS.find(([key]) => key === (p.level || DEFAULT_LEVEL))?.[1] || '';
    $('.player-list', root).replaceChildren(...view.players.map(p => el('li', {},
      el('span.name', {}, p.name),
      p.id === me?.id ? el('span.tag', {}, 'you') : null,
      p.id === view.hostId ? el('span.tag', {}, 'host') : null,
      p.bot ? el('span.tag', {}, isHost ? 'bot' : `bot · ${levelName(p)}`) : null,
      isHost && p.bot
        ? botLevelSelect(p.level || DEFAULT_LEVEL, level => send({ type: 'setBotLevel', playerId: p.id, level }),
          { 'aria-label': `${p.name}’s level` }) : null,
      isHost && p.id !== me.id
        ? el('button.link.small', { type: 'button', onclick: () => send({ type: 'removePlayer', playerId: p.id }) }, 'Remove') : null,
    )));
    const count = view.players.length;
    // just the host and bots: the game can run in this browser instead of on the server
    const solo = info.practice && onSolo && count >= info.minPlayers && view.players.filter(p => !p.bot).length === 1;
    const start = () => (solo
      ? onSolo({ bots: view.players.filter(p => p.bot).map(p => p.level || DEFAULT_LEVEL), rules: view.rules })
      : send({ type: 'start' }));
    const newLevel = store.get('botLevel', DEFAULT_LEVEL);
    $('.host-buttons', root).replaceChildren(isHost
      ? el('div', {},
        info.bots ? el('div.inline.add-bot', {},
          botLevelSelect(newLevel, level => store.set('botLevel', level), { 'aria-label': 'Level of the next bot' }),
          el('button', { type: 'button', disabled: count >= info.maxPlayers, onclick: () => send({ type: 'addBot', level: store.get('botLevel', DEFAULT_LEVEL) }) }, 'Add a bot')) : null,
        el('div.buttons', {},
          el('button.primary', { type: 'button', disabled: count < info.minPlayers, onclick: start },
            count < info.minPlayers ? 'Waiting for players…' : `Start with ${count}`)),
        solo ? el('p.muted.small', {}, 'Only you and bots: the game runs in your browser, so this lobby closes when you start.') : null)
      : el('p.muted', {}, me ? `Waiting for ${hostName} to start.` : 'This game hasn’t started yet.'));

    // a game's own lobby section (Spy Words: teams and spymasters)
    if (LOBBY_PANELS[info.id]) $('.game-panel', root).replaceChildren(...LOBBY_PANELS[info.id](view, send).filter(Boolean));

    const key = JSON.stringify(view.rules);
    if (key !== rulesVersion) {
      rulesVersion = key;
      const changed = info.ruleOptions.filter(o => view.rules[o.key] !== defaultOf(o)).length;
      const extras = info.ruleOptions.filter(o => defaultOf(o) !== o.official).map(o => o.label.toLowerCase());
      const startsWith = extras.length ? `Official rules plus a ${extras.join(' and ')} to start with.` : 'Official rules to start with.';
      $('.rules-box', root).replaceChildren(
        isHost ? el('p.muted', {}, `${startsWith} Change any of them before you start; everyone sees your choices.`)
          : el('p.muted', {}, changed ? `${hostName} changed ${changed} rule${changed === 1 ? '' : 's'} from the defaults. House rules are highlighted.` : startsWith),
        rulesForm(info.ruleOptions, view.rules, rules => { rulesVersion = JSON.stringify(rules); send({ type: 'setRules', rules }); }, { readOnly: !isHost }),
      );
    }
  }

  const unsubscribe = game.subscribe((next, error) => {
    if (error) { toast(error.message); return; }
    view = next;
    if (view.phase !== 'lobby') { onStart(); return; }
    render();
  });
  if (game.view) { view = game.view; render(); }
  return () => unsubscribe();
}
