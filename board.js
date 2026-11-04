import {
  $,
  S,
  el,
  load,
  PINS_TAB,
  cell,
  getLive,
  LIVE_TAB,
  autoPick,
  enrich,
  parseSchedule,
  SCHEDULE_TAB
} from './commons.js';

const Q = new URLSearchParams(location.search);
const POLL_MS = 4000,
  SHEET_MS = 5 * 60 * 1000,
  NPINS = Math.max(1, Math.min(8, parseInt(Q.get('pins')) || 3));
if (Q.get('only') === 'watch') $('slipCard').hidden = true;
if (Q.get('only') === 'slip') $('watchCard').hidden = true;
const sc = parseFloat(Q.get('scale'));
if (sc > 0 && sc < 5) document.documentElement.style.setProperty('--scale', sc);

let seen = new Set(),
  first = true,
  lastWatch = '';
const lib = x => /kanopy|hoopla/i.test(x);
const host = u => {
  try {
    return new URL(u).hostname.replace(/^www\./, '');
  } catch (e) {
    return '';
  }
};

/* --- Where To Watch: free and library first, the way the site labels them --- */
function renderWatch() {
  const r = S.cur,
    w = $('watch');
  $('film').textContent = r ? r.title : '';
  if (!r) {
    w.innerHTML = '';
    w.append(el('p', 'Nothing on the Gallery Wall yet.', 'none'));
    return;
  }
  const free = [...new Set([...r.open, ...r.free])],
    paid = r.stream.filter(x => !free.includes(x));
  const key = r.title + '|' + free.join() + '|' + paid.join() + '|' + (r.status || '');
  if (key === lastWatch) return;
  lastWatch = key;
  w.textContent = '';
  if (free.length || paid.length) {
    const d = el('div', null, 'chips');
    free.forEach(x =>
      d.append(el('span', lib(x) ? x + ' · free with a library card' : x + ' · free', 'chip free'))
    );
    paid
      .slice(0, Math.max(0, 6 - free.length))
      .forEach(x => d.append(el('span', x.replace(/ \(rent\/buy\)$/, ' · rent or buy'), 'chip')));
    w.append(d);
  } else
    w.append(
      el(
        'p',
        r.status ? 'Not listed yet. Ask in chat and we’ll help you find it.' : 'Looking this up…',
        'none'
      )
    );
}

/* --- checkout slip: the latest pins for this film, newest at the bottom --- */
function renderPins() {
  const forCur = p => !p.doc || (S.cur && p.doc.toLowerCase() === S.cur.title.toLowerCase());
  const all = S.pins.filter(forCur).slice(-NPINS),
    ol = $('pins');
  ol.textContent = '';
  if (!all.length) {
    const li = document.createElement('li');
    li.append(el('span', ''), el('span', 'No resources pinned yet.', 'empty'));
    ol.append(li);
  }
  all.forEach(p => {
    const id = p.id || p.time + p.note + p.url,
      li = document.createElement('li'),
      n = el('span', p.note || host(p.url) || p.url, 'note');
    if (p.note && p.url && host(p.url)) n.append(el('small', host(p.url)));
    li.append(el('span', p.time || '—', 'stamp'), n);
    if (!first && !seen.has(id)) li.className = 'new';
    seen.add(id);
    ol.append(li);
  });
  first = false;
}

/* --- live state: same sources as the site (Netlify function first, the sheet as a fallback) --- */
async function refresh() {
  try {
    const sheetPins = load(PINS_TAB, /note/i)
      .then(t =>
        t.rows
          .filter(r => r.c && (cell(r.c[1]) || cell(r.c[2])))
          .map(r => ({
            time: cell(r.c[0]),
            note: cell(r.c[1]),
            url: cell(r.c[2]),
            doc: cell(r.c[3])
          }))
      )
      .catch(() => []);
    const fn = await getLive();
    if (fn) {
      S.liveTitle = fn.title || '';
    } else {
      try {
        const t = await load(LIVE_TAB, /clock|now playing/i),
          r = (t.rows[0] && t.rows[0].c) || [];
        S.liveTitle = cell(r[1]);
      } catch (e) {}
    }
    if (S.rows.length) {
      const n = autoPick();
      if (n !== S.cur) {
        S.cur = n;
        lastWatch = '';
        if (n) enrich(n);
      }
    }
    const pins = [...(await sheetPins), ...(fn && Array.isArray(fn.pins) ? fn.pins : [])];
    if (JSON.stringify(pins) !== JSON.stringify(S.pins) || first) {
      S.pins = pins;
      renderPins();
    }
    renderWatch();
  } catch (e) {}
  setTimeout(refresh, POLL_MS);
}
async function loadSchedule() {
  try {
    S.rows = parseSchedule(await load(SCHEDULE_TAB));
    S.cur = null;
    lastWatch = '';
  } catch (e) {}
  setTimeout(loadSchedule, SHEET_MS);
}
window.onEnriched = r => {
  if (r === S.cur) renderWatch();
};
window.onStatus = r => {
  if (r === S.cur) renderWatch();
};
loadSchedule().then(refresh);
