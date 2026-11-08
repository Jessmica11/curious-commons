import {
  $,
  el,
  S,
  when,
  enrich,
  cover,
  autoPick,
  getLive,
  load,
  LIVE_TAB,
  cell,
  parseSchedule,
  SCHEDULE_TAB,
  isLater
} from './commons.js';

const DEBUG = new URLSearchParams(location.search).has('debug');
function showDebug() {
  let d = $('dbg');
  if (!d) {
    d = el('section', null, 'card');
    d.id = 'dbg';
    $('main').append(d);
  }
  d.textContent = '';
  d.append(el('h2', 'Diagnostics'));
  d.append(
    el('p', 'Per film: what the page read from the TMDB column, and what the lookup said.', 'meta')
  );
  S.rows.forEach(r => {
    const p = el('p', null);
    p.append(el('b', r.title + ': '));
    p.append(
      document.createTextNode(
        'TMDB cell = ' +
          (r.tmdb || '(empty)') +
          ' | poster = ' +
          (r.img || '(none)') +
          ' | lookup = ' +
          (r.status || 'not run yet')
      )
    );
    d.append(p);
  });
}
window.onStatus = () => {
  if (DEBUG) showDebug();
};
let q;
window.onEnriched = () => {
  cancelAnimationFrame(q);
  q = requestAnimationFrame(render);
};
const GROUPS = [
  ['now', 'Now on View', 'On view in the Commons right now. Open it for the watch-party clock.'],
  ['soon', 'Opening Soon', ''],
  ['past', 'From the Archive', 'Catch up on what the Curator has shown.']
];
function render() {
  if (DEBUG) showDebug();
  const wall = $('wall');
  wall.textContent = '';
  GROUPS.forEach(([k, title, blurb]) => {
    const rows = S.rows
      .filter(r => when(r) === k)
      .sort((a, b) =>
        k === 'past' ? (b.date || 0) - (a.date || 0) : (a.date || 1e15) - (b.date || 1e15)
      );
    if (!rows.length) return;
    const sec = el('section', null, 'wall-sec sec-' + k),
      h = el('h3', title),
      ul = el('ul', null, 'gal wall');
    h.id = 'g-' + k;
    // the plaques already say "Opening soon" or "Future exhibition", so this heading is only for screen readers
    if (k === 'soon') h.className = 'sr';
    sec.setAttribute('aria-labelledby', h.id);
    rows.forEach(r => {
      enrich(r);
      const li = document.createElement('li'),
        a = document.createElement('a'),
        cap = el('span', null, 'cap');
      a.href = 'screening.html?show=' + encodeURIComponent(r.title);
      cap.append(
        el('span', r.dateLabel, 'd'),
        el('span', r.title, 'n'),
        el('span', [r.year, r.dur].filter(Boolean).join(' \u00b7 '), 'm')
      );
      if (k !== 'past') {
        const far = k === 'soon' && isLater(r);
        cap.append(
          el(
            'span',
            k === 'now' ? 'On view' : far ? 'Future exhibition' : 'Opening soon',
            'badge ' + (far ? 'later' : k)
          )
        );
      }
      if (k === 'now') li.classList.add('lit');
      a.append(cover(r), cap);
      li.append(a);
      ul.append(li);
    });
    sec.append(h);
    if (blurb) sec.append(el('p', blurb, 'meta'));
    sec.append(ul);
    wall.append(sec);
  });
  const next = S.rows.length ? autoPick() : null,
    t = $('tonight');
  t.textContent = '';
  if (next && when(next) !== 'past') {
    const a = el(
      'a',
      (when(next) === 'now' ? 'Now on view: ' : 'Opening soon: ') +
        next.title +
        (when(next) === 'soon' && next.dateLabel ? ' \u00b7 ' + next.dateLabel : '') +
        ' \u2192'
    );
    a.href = 'screening.html?show=' + encodeURIComponent(next.title);
    t.append(a);
  }
}
// Now Showing comes from the host's Play/Reset (Netlify function); the sheet's Live tab is only a fallback
async function liveTitle() {
  const fn = await getLive();
  if (fn) return fn.title || '';
  try {
    const t = await load(LIVE_TAB, /clock|now playing/i),
      r = (t.rows[0] && t.rows[0].c) || [];
    return cell(r[1]);
  } catch (e) {
    return null;
  }
}
async function refreshLive() {
  if (document.hidden || !S.rows.length) return;
  const t = await liveTitle();
  if (t != null && t !== S.liveTitle) {
    S.liveTitle = t;
    render();
  }
}
(async () => {
  const lv = liveTitle().then(t => {
    if (t != null) S.liveTitle = t;
  });
  try {
    S.rows = parseSchedule(await load(SCHEDULE_TAB));
  } catch (e) {
    const p = el(
      'p',
      'Could not load the schedule (' +
        e.message +
        '). Check the sheet is shared as “Anyone with the link: Viewer”, then reload.',
      'err'
    );
    p.setAttribute('role', 'alert');
    $('tonight').append(p);
    return;
  }
  await lv;
  render();
  setInterval(refreshLive, 15000);
  document.addEventListener('visibilitychange', refreshLive);
})();
