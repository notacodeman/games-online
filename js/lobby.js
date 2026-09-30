// The lobby of an online game (invite link, public or private, who's seated, the rules) and the rules form it
// shares with practice mode on the start page. Works for any game in lib/games.js.

import { el, $, toast } from './util.js';
import { GAMES } from './games.js';

const officialLabel = option => option.choices.find(([v]) => v === option.official)[1].toLowerCase();

// The rules that differ from official, as "Label: choice" lines.
export const houseRules = (options, rules) => options
  .filter(o => rules[o.key] !== o.official)
  .map(o => `${o.label}: ${o.choices.find(([v]) => v === rules[o.key])[1]}`);

// One select per rule, with its note under it. onChange gets the whole rules object after every change.
export function rulesForm(options, rules, onChange, { readOnly = false } = {}) {
  const form = el('div.rules-form');
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
    form.append(field);
  }
  if (!readOnly) {
    form.append(el('button.link', {
      type: 'button',
      onclick: () => {
        const official = Object.fromEntries(options.map(o => [o.key, o.official]));
        form.replaceWith(rulesForm(options, official, onChange));
        onChange(official);
      },
    }, 'Reset to official rules'));
  }
  return form;
}

export function showLobby(root, game, { onStart, onLeave }) {
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

    $('.player-list', root).replaceChildren(...view.players.map(p => el('li', {},
      el('span.name', {}, p.name),
      p.id === me?.id ? el('span.tag', {}, 'you') : null,
      p.id === view.hostId ? el('span.tag', {}, 'host') : null,
      p.bot ? el('span.tag', {}, 'bot') : null,
      isHost && p.id !== me.id
        ? el('button.link.small', { type: 'button', onclick: () => send({ type: 'removePlayer', playerId: p.id }) }, 'Remove') : null,
    )));
    const count = view.players.length;
    $('.host-buttons', root).replaceChildren(isHost
      ? el('div.buttons', {},
        el('button', { type: 'button', disabled: count >= info.maxPlayers, onclick: () => send({ type: 'addBot' }) }, 'Add a bot'),
        el('button.primary', { type: 'button', disabled: count < info.minPlayers, onclick: () => send({ type: 'start' }) },
          count < info.minPlayers ? 'Waiting for players…' : `Start with ${count}`))
      : el('p.muted', {}, me ? `Waiting for ${hostName} to start.` : 'This game hasn’t started yet.'));

    const key = JSON.stringify(view.rules);
    if (key !== rulesVersion) {
      rulesVersion = key;
      const house = houseRules(info.ruleOptions, view.rules);
      $('.rules-box', root).replaceChildren(
        isHost ? el('p.muted', {}, 'Official rules are set. Change any of them before you start; everyone sees your choices.')
          : el('p.muted', {}, house.length ? `${hostName} changed ${house.length} rule${house.length === 1 ? '' : 's'} (highlighted).` : 'Official rules.'),
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
