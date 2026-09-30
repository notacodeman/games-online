// Drawing cards: a neon-outlined face in its color, or the back. Wilds get a four-color ring.

import { el } from '../util.js';
import { cardName, isWild } from '../../lib/last-card/game.js';

const SYMBOLS = { skip: '⊘', reverse: '⇄', draw2: '+2', wild: '', wild4: '+4' };

// chosenColor: the color picked for a wild on the discard pile, shown as its glow.
export function cardFace(card, { chosenColor = null, tag = 'div', ...attrs } = {}) {
  const symbol = SYMBOLS[card.value] ?? card.value;
  const colorClass = isWild(card) ? 'wild' : card.color;
  const node = el(`${tag}.card.${colorClass}`, { 'aria-label': cardName(card), title: cardName(card), ...attrs },
    el('span.corner.top', {}, symbol || 'W'),
    isWild(card) ? el('span.ring', {}, el('span.value', {}, symbol)) : el('span.value', {}, symbol),
    el('span.corner.bottom', {}, symbol || 'W'),
  );
  if (chosenColor && isWild(card)) node.dataset.chosen = chosenColor;
  if (card.value.length > 1 && !isWild(card)) node.classList.add('symbol');
  if (card.value === '6' || card.value === '9') node.classList.add('underline');   // tells 6 and 9 apart upside down
  return node;
}

export const cardBack = (attrs = {}) => el('div.card.back', { 'aria-hidden': 'true', ...attrs }, el('span.mark', {}, 'LC'));
