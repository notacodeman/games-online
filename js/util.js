// Small helpers shared by the page: DOM building, the API, browser storage.

export const $ = (sel, root = document) => root.querySelector(sel);

// el('div.row', { onclick }, child, 'text', …): builds an element. Strings become text nodes, so names are never HTML.
export function el(spec, attrs = {}, ...children) {
  const [tag, ...classes] = spec.split('.');
  const node = document.createElement(tag || 'div');
  if (classes.length) node.className = classes.join(' ');
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value == null || value === false) continue;
    if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else if (key === 'style' && typeof value === 'object') {
      for (const [prop, v] of Object.entries(value)) prop.startsWith('--') ? node.style.setProperty(prop, v) : (node.style[prop] = v);
    } else node.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

// fetch JSON from the API; throws an Error carrying the API's own message.
export async function api(path, { json, token, method } = {}) {
  const init = { method: method || (json !== undefined ? 'POST' : 'GET'), headers: {} };
  if (json !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(json);
  }
  if (token) init.headers['X-Player-Token'] = token;
  let response;
  try {
    response = await fetch(path, init);
  } catch (_) {
    throw new Error('Couldn’t reach the site. Check your connection.');
  }
  const body = await response.json().catch(() => null);
  if (response.status === 404 && !body) throw new Error(`${path} returned 404: the site’s Functions aren’t deployed.`);
  if (!body) throw new Error(`${path} returned ${response.status} without a JSON body.`);
  if (!body.ok) {
    const error = new Error(body.error || `Request failed (${response.status}).`);
    error.status = response.status;
    throw error;
  }
  return body;
}

// localStorage that never throws (private windows, blocked storage).
export const store = {
  get(key, fallback = null) {
    try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch (_) { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) { /* storage blocked: fine */ }
  },
};

// Seats this browser holds in online games: { CODE: { token, playerId } }.
export const seats = {
  get: code => store.get('seats', {})[code] || null,
  set(code, seat) {
    const all = store.get('seats', {});
    if (seat) all[code] = seat; else delete all[code];
    store.set('seats', all);
  },
};

// A short message at the bottom of the screen that fades by itself.
let toastTimer;
export function toast(text) {
  let box = $('#toast');
  if (!box) document.body.append(box = el('div', { id: 'toast', role: 'status' }));
  box.textContent = text;
  box.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => box.classList.remove('show'), 3200);
}
