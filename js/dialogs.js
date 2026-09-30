// Dialogs shared by the games.

import { el } from './util.js';

// A small dialog with one button per choice. Resolves with the chosen value, or null when closed.
export function choose(title, options) {
  return new Promise(resolve => {
    const dialog = el('dialog.chooser', {},
      el('h2', {}, title),
      el('div.choices', {}, ...options.map(([value, label, className]) =>
        el(`button${className ? '.' + className.split(' ').join('.') : ''}`, { type: 'button', onclick: () => { dialog.close(value); } }, label))),
      el('button.link', { type: 'button', onclick: () => dialog.close('') }, 'Cancel'),
    );
    dialog.addEventListener('close', () => { dialog.remove(); resolve(dialog.returnValue || null); });
    document.body.append(dialog);
    dialog.showModal();
  });
}
