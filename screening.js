import {
  S,
  $,
  midnight,
  DAY,
  when,
  HOST,
  isImg,
  cover,
  el,
  linkify,
  safe,
  load,
  PINS_TAB,
  cell,
  getLive,
  LIVE_TAB,
  autoPick,
  enrich,
  parseSchedule,
  SCHEDULE_TAB,
  LIVE_FN
} from './commons.js';

window.onEnriched = r => {
  if (r === S.cur) renderDoc();
};
const nk = r => 'cc_notes_' + r.title + '|' + r.dateLabel;
function renderDoc() {
  const r = S.cur,
    box = $('doc');
  box.textContent = '';
  if (!r) return;
  $('nowh').textContent = {
    now: 'Now on View',
    soon: !r.date || r.date - midnight() > 7 * DAY ? 'Future Exhibition' : 'Opening Soon',
    past: 'From the Archive'
  }[when(r)];
  // the watch-party clock only belongs on the Now Showing film; the host still sees it everywhere, to run the desk
  const live = when(r) === 'now';
  document.querySelector('.clock').hidden = !live && !HOST;
  $('howto').hidden = !live;
  document.querySelector('[data-cmd="time"]').hidden = !live;
  // once a film is open, its framed poster takes the portrait's place; the channel stays named and pictured beside it
  const hd = $('hdr'),
    film = isImg(r.img);
  hd.classList.toggle('film', film);
  $('kick').hidden = !film;
  $('h1').textContent = film ? r.title : 'The Curiosity Commons';
  if (film) {
    const f = cover(r);
    f.setAttribute('role', 'img');
    f.setAttribute('aria-label', 'Poster for ' + r.title);
    hd.firstElementChild.replaceWith(f);
  } else if (hd.firstElementChild.tagName !== 'IMG') {
    const i = new Image();
    i.src = 'profile.webp';
    i.alt = 'Portrait of a woman in a white gown seated before towering stacks of old books';
    hd.firstElementChild.replaceWith(i);
  }
  document.title = r.title + ' · The Curiosity Commons';
  {
    const d = (r.desc || '').replace(/\s+/g, ' ').trim(),
      u = location.origin + '/screening.html?show=' + encodeURIComponent(r.title),
      meta =
        (r.year ? r.title + ' (' + r.year + ')' : r.title) +
        ' at The Curiosity Commons: where to watch, the watch-party clock and research links.' +
        (d ? ' ' + d : ''),
      set = (sel, attr, v) => {
        const m = document.querySelector(sel);
        if (m) m.setAttribute(attr, v);
      };
    set(
      'meta[name="description"]',
      'content',
      meta.length > 160 ? meta.slice(0, 157).replace(/\s+\S*$/, '') + '…' : meta
    );
    set('link[rel="canonical"]', 'href', u);
    set('meta[property="og:url"]', 'content', u);
    set('meta[property="og:title"]', 'content', document.title);
  }
  // the wall placard: labelled facts on the left, critic and audience scores on the right
  const longDate = d =>
    d.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      ...(d.getFullYear() !== new Date().getFullYear() && { year: 'numeric' })
    });
  // "Documentary" is on every film, so it is left out of the genre
  const genre = (r.cats || '')
    .split(',')
    .map(x => x.trim())
    .filter(x => x && !/^documentary$/i.test(x))
    .join(', ');
  const facts = el('dl', null, 'facts');
  const fact = (label, value) => value && facts.append(el('dt', label), el('dd', value));
  fact(
    { now: 'On view', soon: 'Opening', past: 'Shown' }[when(r)],
    r.date ? longDate(r.date) : r.dateLabel
  );
  fact('Released', r.year);
  fact('Runtime', r.dur);
  fact('Genre', genre);
  const tiles = el('div', null, 'tiles');
  const tile = (value, out, source, kind, hint) => {
    const t = el('div', null, 'tile'),
      b = el('b', value),
      label = el('span', source);
    t.title = hint;
    if (out) b.append(el('small', out));
    label.append(el('small', kind));
    t.append(b, label);
    tiles.append(t);
  };
  if (r.rt)
    tile(
      r.rt,
      '',
      'Rotten Tomatoes',
      'critics',
      "Share of professional critics' reviews that are positive"
    );
  // IMDb only once enough people have rated it to mean something
  if (r.imdb && r.imdb.votes >= 1000)
    tile(
      r.imdb.rating,
      '/10',
      'IMDb',
      'audience',
      `Average of ${r.imdb.votes.toLocaleString()} IMDb user ratings`
    );
  const placard = el('div', null, 'placard');
  placard.append(facts);
  if (tiles.childNodes.length) placard.append(tiles);
  box.append(placard);
  box.append(el('h3', 'Description'));
  if (r.desc.length > 320) {
    const d = el('p', r.desc.slice(0, 300).trim() + '…', 'desc'),
      dt = document.createElement('details'),
      sm = el('summary', 'Read the full description');
    dt.append(sm, el('p', r.desc, 'desc'));
    dt.addEventListener('toggle', () => {
      d.hidden = dt.open;
    });
    box.append(d, dt);
  } else box.append(el('p', r.desc, 'desc'));
  if (r.tags) box.append(el('p', 'Topics: ' + r.tags, 'meta'));
  if (r.more) {
    const p = el('p', null);
    p.append(el('b', 'Keep exploring: '));
    linkify(p, r.more);
    box.append(p);
  }
  const w = $('watch');
  w.textContent = '';
  // one simple list; free and library options stay in it, just labelled
  const lib = x => /kanopy|hoopla/i.test(x);
  const names = [...new Set([...r.open, ...r.free, ...r.stream])];
  const tag = x =>
    r.free.includes(x) || r.open.includes(x)
      ? lib(x)
        ? x + ' (free with a library card)'
        : x + ' (free)'
      : x;
  // open the service's own search for this title; unknown services fall back to the JustWatch page
  const SITES = [
    [/netflix/i, 'https://www.netflix.com/search?q='],
    [/amazon|prime video/i, 'https://www.amazon.com/s?i=instant-video&k='],
    [/^max$|hbo/i, 'https://play.max.com/search?q='],
    [/hulu/i, 'https://www.hulu.com/search?q='],
    [/disney/i, 'https://www.disneyplus.com/search?q='],
    [/apple tv/i, 'https://tv.apple.com/search?term='],
    [/tubi/i, 'https://tubitv.com/search/'],
    [/pluto/i, 'https://pluto.tv/search/details?query='],
    [/peacock/i, 'https://www.peacocktv.com/search?q='],
    [/paramount/i, 'https://www.paramountplus.com/search/?q='],
    [/youtube/i, 'https://www.youtube.com/results?search_query='],
    [/google play/i, 'https://play.google.com/store/search?c=movies&q='],
    [/kanopy/i, 'https://www.kanopy.com/en/search?query='],
    [/hoopla/i, 'https://www.hoopladigital.com/search?q='],
    [/criterion/i, 'https://www.criterionchannel.com/search?q='],
    [/mubi/i, 'https://mubi.com/en/search/films?query='],
    [/plex/i, 'https://watch.plex.tv/search?q='],
    [/shudder/i, 'https://www.shudder.com/search?q='],
    [/amc\+/i, 'https://www.amcplus.com/search?q='],
    [/fandango|vudu/i, 'https://www.fandangoathome.com/search?searchString=']
  ];
  const href = x => {
    const n = x.replace(/ \(rent\/buy\)$/, ''),
      s = SITES.find(p => p[0].test(n));
    return s ? s[1] + encodeURIComponent(r.title) : r.watchLink || '';
  };
  const chip = x => {
    const u = href(x);
    if (!u) return el('span', tag(x), 'chip');
    const a = el('a', tag(x), 'chip');
    a.href = u;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.append(el('span', ' (opens in a new tab)', 'sr'));
    return a;
  };
  if (names.length) {
    const d = el('div', null, 'plat');
    names.forEach(x => d.append(chip(x)));
    w.append(d);
  } else
    w.append(
      el('p', r.status ? 'Not listed for this title yet.' : 'Looking this up\u2026', 'none')
    );
  w.append(el('p', 'US availability, from JustWatch.', 'meta'));
  $('status').textContent = 'Showing ' + r.title;
  if (S.nkey !== nk(r)) {
    S.nkey = nk(r);
    loadNotes(r);
  }
  renderPins();
}

/* --- clock --- */
const pad = n => String(Math.floor(n)).padStart(2, '0');
const fmt = s => `${pad(s / 3600)}:${pad((s % 3600) / 60)}:${pad(s % 60)}`;
function secs() {
  const c = S.clock;
  if (!c) return null;
  return c.running ? c.base + (Date.now() - c.at) / 1000 : c.base;
}
function parseClock(v) {
  if (!v) return null;
  const [m, x] = v.split('|');
  if (m === 'run') {
    const t = Date.parse(x);
    return isNaN(t) ? null : { running: true, base: (Date.now() - t) / 1000, at: Date.now() };
  }
  if (m === 'pause' && !isNaN(+x)) return { running: false, base: +x, at: Date.now() };
  return null;
}
function tick() {
  const s = secs();
  $('time').textContent = s == null ? '--:--:--' : fmt(Math.max(0, s));
  $('state').textContent =
    s == null
      ? 'The host has not started the clock yet'
      : S.clock.running
        ? 'Documentary timestamp · playing now'
        : 'Documentary timestamp · paused';
  if (HOST && S.cur && when(S.cur) !== 'now')
    $('state').textContent += ' · viewers don’t see the clock on this page';
}
function clockStr() {
  const s = secs();
  if (s == null) return '';
  return S.clock.running
    ? 'run|' + new Date(Date.now() - s * 1000).toISOString()
    : 'pause|' + Math.round(s);
}

/* --- pins --- */
const localPins = () => {
  try {
    return JSON.parse(localStorage.getItem('cc_pins') || '[]');
  } catch (e) {
    return [];
  }
};
const forCur = p => !p.doc || (S.cur && p.doc.toLowerCase() === S.cur.title.toLowerCase());
function renderPins() {
  const ol = $('pins');
  ol.textContent = '';
  const all = [
    ...S.pins.filter(forCur),
    ...(HOST
      ? localPins()
          .filter(p => forCur(p) && !S.pins.some(q => q.url === p.url))
          .map(p => ({ ...p, local: 1 }))
      : [])
  ];
  if (!all.length) {
    const li = document.createElement('li');
    li.append(el('span', ''), el('span', 'No resources pinned yet.', 'none'));
    ol.append(li);
  }
  all.forEach(p => {
    const li = document.createElement('li'),
      r = el('span', null);
    li.append(el('span', p.time || '—', 'stamp'), r);
    if (safe(p.url)) {
      const a = el('a', p.note || p.url);
      a.href = p.url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      r.append(a);
    } else r.append(document.createTextNode(p.note));
    if (p.local) r.append(el('small', 'not saved yet', 'loc'));
    if (HOST && p.id) {
      li.classList.add('has-x');
      li.append(unpinBtn(p));
    }
    ol.append(li);
  });
  fillSlip();
  ol.scrollTop = ol.scrollHeight;
}
// host only: a small × at the end of the row; the first tap asks "Remove?", the second removes it
function unpinBtn(p) {
  const name = p.note || p.url,
    x = el('button', null, 'unpin');
  x.type = 'button';
  const idle = () => {
    x.classList.remove('ask');
    x.innerHTML = '<span aria-hidden="true">×</span>';
    x.setAttribute('aria-label', 'Remove pin: ' + name);
    x.title = 'Remove';
  };
  let t;
  idle();
  x.onclick = () => {
    if (!x.classList.contains('ask')) {
      x.classList.add('ask');
      x.textContent = 'Remove?';
      x.setAttribute('aria-label', 'Confirm: remove pin ' + name);
      clearTimeout(t);
      t = setTimeout(idle, 3500);
      return;
    }
    clearTimeout(t);
    x.disabled = true;
    x.textContent = '…';
    Promise.resolve(window.unpin?.(p.id)).finally(() => {
      if (x.isConnected) {
        x.disabled = false;
        idle();
      }
    });
  };
  x.addEventListener('blur', () => {
    if (!x.disabled) {
      clearTimeout(t);
      idle();
    }
  });
  x.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      clearTimeout(t);
      idle();
    }
  });
  return x;
}
// blank ruled lines down to the bottom of the slip, so the card never shows an empty gap
function fillSlip() {
  const ol = $('pins');
  ol.querySelectorAll('li.blank').forEach(li => li.remove());
  if (!ol.clientHeight) return;
  for (let i = 0; i < 60 && ol.scrollHeight <= ol.clientHeight; i++) {
    const li = document.createElement('li');
    li.className = 'blank';
    li.setAttribute('aria-hidden', 'true');
    li.append(el('span', ''), el('span', ''));
    ol.append(li);
  }
  const last = ol.lastElementChild;
  if (ol.scrollHeight > ol.clientHeight && last && last.classList.contains('blank')) last.remove();
}
if (window.ResizeObserver) new ResizeObserver(() => fillSlip()).observe($('pins'));

/* --- polling --- */
// the clock and Now Showing come from the Netlify function; the sheet's Live tab is only a fallback. Pins come from both.
async function refreshLive(force) {
  if (document.hidden && !force) return;
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
  let lv = fn ? { clock: fn.clock || '', title: fn.title || '' } : null;
  if (!lv) {
    try {
      const t = await load(LIVE_TAB, /clock|now playing/i),
        r = (t.rows[0] && t.rows[0].c) || [];
      lv = { clock: cell(r[0]), title: cell(r[1]) };
    } catch (e) {}
  }
  if (lv) {
    let changed = false;
    if (Date.now() > (S.hold || 0) && lv.title !== S.liveTitle) {
      S.liveTitle = lv.title;
      S.manualPick = false;
      changed = true;
    }
    if (!S.override) S.clock = parseClock(lv.clock);
    if (S.rows.length && !S.manualPick) {
      const n = autoPick();
      if (n !== S.cur) {
        S.cur = n;
        renderDoc();
        enrich(n);
      } else if (changed && S.cur) renderDoc();
    }
  }
  const pins = [...(await sheetPins), ...(fn && Array.isArray(fn.pins) ? fn.pins : [])];
  if (JSON.stringify(pins) !== JSON.stringify(S.pins)) {
    S.pins = pins;
    renderPins();
  }
}
async function init() {
  const live = refreshLive(true);
  try {
    S.rows = parseSchedule(await load(SCHEDULE_TAB));
  } catch (e) {
    $('doc').innerHTML = '';
    const p = el(
      'p',
      'Could not load the schedule (' +
        e.message +
        '). Check the sheet is shared as “Anyone with the link: Viewer”, then reload.',
      'err'
    );
    p.setAttribute('role', 'alert');
    $('doc').append(p);
  }
  await live;
  if (!S.cur && S.rows.length) S.cur = autoPick();
  if (S.cur) {
    renderDoc();
    enrich(S.cur);
  }
  renderPins();
  tick();
  setInterval(tick, 1000);
  setInterval(refreshLive, 15000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refreshLive();
  });
}

/* --- host desk --- */
if (HOST) {
  $('hostpanel').hidden = false;
  const KEYNAME = 'cc_host_key';
  const pw = () => {
    try {
      return localStorage.getItem(KEYNAME) || '';
    } catch (e) {
      return '';
    }
  };
  const msg = t => {
    $('hostMsg').textContent = t;
  };
  const syncCfg = () => {
    $('connect').open = !pw();
  };
  const VIEW = ' Viewers see it within about 15 seconds.';
  async function send(payload, ok) {
    if (!pw()) {
      msg('Enter your host password under "Host password" first.');
      $('connect').open = true;
      return false;
    }
    let res,
      d = {};
    try {
      res = await fetch(LIVE_FN, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, key: pw() })
      });
    } catch (e) {
      msg(
        'Could not reach your site. Check your internet connection, and that this page is open on your Netlify address.'
      );
      return false;
    }
    try {
      d = await res.json();
    } catch (e) {}
    if (res.ok) {
      msg(ok);
      return true;
    }
    if (res.status === 404) {
      msg(
        'The clock function was not found. Check the file is at netlify/functions/live.mjs and the site has redeployed.'
      );
      return false;
    }
    if (res.status === 401) {
      msg(
        'Wrong host password. Re-enter it under "Host password". It must match HOST_PASSWORD in Netlify exactly.'
      );
      $('connect').open = true;
      return false;
    }
    if (/HOST_PASSWORD/.test(d.error || '')) {
      msg(
        'HOST_PASSWORD is not set yet. Add it in Netlify (Site configuration, Environment variables), then redeploy.'
      );
      return false;
    }
    msg('The site answered: ' + (d.error || 'error ' + res.status));
    return false;
  }
  syncCfg();
  $('bSaveCfg').onclick = () => {
    const key = $('cfgKey').value;
    if (!key) {
      msg('Type your host password first.');
      return;
    }
    try {
      localStorage.setItem(KEYNAME, key);
    } catch (e) {
      msg('This browser would not save it (private window?).');
      return;
    }
    $('cfgKey').value = '';
    syncCfg();
    msg('Saved in this browser. Press Test connection.');
  };
  $('bTestCfg').onclick = () =>
    send({ action: 'ping' }, 'Connection works. The password is correct.');
  window.unpin = async id => {
    if (await send({ action: 'unpin', id }, 'Pin removed.' + VIEW)) refreshLive(true);
  };

  const parseHMS = v => {
    const p = v.trim().split(':').map(Number);
    if (!v.trim() || p.some(isNaN)) return null;
    return p.reduce((a, n) => a * 60 + n, 0);
  };
  const pushClock = ok => {
    tick();
    send({ action: 'clock', clock: clockStr() }, ok + VIEW);
  };
  // Play also makes the film on this page Now Showing, for everyone
  $('bPlay').onclick = () => {
    const t = parseHMS($('setT').value),
      s = t != null ? t : secs() || 0;
    S.override = true;
    S.clock = { running: true, base: s, at: Date.now() };
    $('setT').value = '';
    const r = S.cur;
    if (r) {
      S.liveTitle = r.title;
      S.manualPick = false;
      S.hold = Date.now() + 30000;
      renderDoc();
    }
    tick();
    send(
      { action: 'clock', clock: clockStr(), title: r ? r.title : '' },
      (r ? 'Clock started, and ' + r.title + ' is now on view.' : 'Clock started.') + VIEW
    );
  };
  $('bPause').onclick = () => {
    const s = secs();
    if (s == null) return;
    S.override = true;
    S.clock = { running: false, base: s, at: Date.now() };
    pushClock('Clock paused.');
  };
  // Reset clears the clock and takes the film off Now Showing, so it goes back to Coming Soon (or Past)
  $('bReset').onclick = () => {
    S.override = true;
    S.clock = null;
    S.liveTitle = '';
    S.manualPick = false;
    S.hold = Date.now() + 30000;
    if (S.cur) renderDoc();
    tick();
    send(
      { action: 'clock', clock: '', title: '' },
      'Clock reset, and the film is no longer on view.' + VIEW
    );
  };

  $('bGoLive').onclick = () => {
    if (!S.cur) return;
    S.liveTitle = S.cur.title;
    S.manualPick = false;
    S.hold = Date.now() + 30000;
    renderDoc();
    send({ action: 'live', title: S.cur.title }, 'Now on view.' + VIEW);
  };
  $('bUnlive').onclick = () => {
    S.liveTitle = '';
    S.manualPick = false;
    S.hold = Date.now() + 30000;
    const n = autoPick();
    if (n) {
      S.cur = n;
      renderDoc();
      enrich(n);
    }
    send({ action: 'live', title: '' }, 'Back to the schedule.' + VIEW);
  };

  $('bPin').onclick = async () => {
    const note = $('pinNote').value.trim(),
      url = $('pinUrl').value.trim();
    if (!note && !url) return;
    if (url && !safe(url)) {
      msg('The link must start with http:// or https://');
      return;
    }
    const s = secs(),
      p = { time: s == null ? '' : fmt(s), note, url, doc: S.cur ? S.cur.title : '' };
    $('pinNote').value = '';
    $('pinUrl').value = '';
    if (await send({ action: 'pin', ...p }, 'Pinned.' + VIEW)) {
      refreshLive(true);
      return;
    }
    try {
      localStorage.setItem('cc_pins', JSON.stringify([...localPins(), p]));
    } catch (e) {}
    renderPins();
  };
}
/* --- notes editor: rich text, autosaves in this browser --- */
const ed = $('notes'),
  rk = r => 'cc_rich_' + r.title + '|' + r.dateLabel;
const esc = t =>
  String(t)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
const OK = new Set([
  'B',
  'STRONG',
  'I',
  'EM',
  'U',
  'H3',
  'UL',
  'OL',
  'LI',
  'P',
  'DIV',
  'BR',
  'BLOCKQUOTE',
  'A'
]);
function clean(html) {
  // allow-list sanitiser: only simple formatting and http(s) links survive
  const doc = new DOMParser().parseFromString('<body>' + html + '</body>', 'text/html');
  (function walk(n) {
    [...n.childNodes].forEach(ch => {
      if (ch.nodeType === 3) return;
      if (
        ch.nodeType !== 1 ||
        /^(SCRIPT|STYLE|IFRAME|OBJECT|EMBED|TEMPLATE|NOSCRIPT)$/.test(ch.tagName)
      ) {
        ch.remove();
        return;
      }
      walk(ch);
      if (!OK.has(ch.tagName)) {
        ch.replaceWith(...ch.childNodes);
        return;
      }
      [...ch.attributes].forEach(a => {
        if (!(ch.tagName === 'A' && a.name === 'href' && /^https?:\/\//i.test(a.value)))
          ch.removeAttribute(a.name);
      });
      if (ch.tagName === 'A') {
        if (ch.getAttribute('href')) {
          ch.target = '_blank';
          ch.rel = 'noopener noreferrer';
        } else ch.replaceWith(...ch.childNodes);
      }
    });
  })(doc.body);
  return doc.body.innerHTML;
}

let saved = null,
  timer = null,
  edFor = null;
const note = t => {
  $('status').textContent = t;
};
const keep = () => {
  const s = getSelection();
  if (s.rangeCount && ed.contains(s.anchorNode)) saved = s.getRangeAt(0).cloneRange();
};
function restore() {
  ed.focus();
  const s = getSelection();
  if (saved) {
    s.removeAllRanges();
    s.addRange(saved);
  } else {
    const r = document.createRange();
    r.selectNodeContents(ed);
    r.collapse(false);
    s.removeAllRanges();
    s.addRange(r);
  }
}
const isEmpty = () => !ed.textContent.trim() && !ed.querySelector('li,a,blockquote');
const words = () => {
  const t = ed.textContent.trim();
  return t ? t.split(/\s+/).length : 0;
};
const setState = t => {
  $('saveState').textContent = t + ' · ' + words() + ' words';
};
function save() {
  if (!edFor) return;
  try {
    localStorage.setItem(rk(edFor), ed.innerHTML);
    setState('Saved');
  } catch (e) {
    setState('Could not save (is this a private window?)');
  }
}
function onEdit() {
  if (isEmpty()) ed.innerHTML = '';
  setState('Saving…');
  clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    save();
  }, 400);
}
function loadNotes(r) {
  if (timer) {
    clearTimeout(timer);
    timer = null;
    save();
  } // never lose the last few keystrokes when switching films
  let h = '';
  try {
    h = localStorage.getItem(rk(r));
    if (h == null) {
      const old = localStorage.getItem(nk(r));
      h = old
        ? old
            .split('\n')
            .map(l => '<div>' + (esc(l) || '<br>') + '</div>')
            .join('')
        : '';
    }
  } catch (e) {
    h = '';
  }
  ed.innerHTML = clean(h);
  edFor = r;
  saved = null;
  setState('Saved');
}
window.addEventListener('pagehide', () => {
  if (timer) {
    clearTimeout(timer);
    timer = null;
    save();
  }
});

const BLOCK = () =>
  String(document.queryCommandValue('formatBlock')).toLowerCase().replace(/[<>]/g, '');
function tools() {
  const on = (c, v) => {
    const b = document.querySelector('[data-cmd="' + c + '"]');
    if (b) b.setAttribute('aria-pressed', String(!!v));
  };
  try {
    on('bold', document.queryCommandState('bold'));
    on('italic', document.queryCommandState('italic'));
    on('underline', document.queryCommandState('underline'));
    on('ul', document.queryCommandState('insertUnorderedList'));
    on('ol', document.queryCommandState('insertOrderedList'));
    on('heading', BLOCK() === 'h3');
    on('quote', BLOCK() === 'blockquote');
  } catch (e) {}
}
function exec(cmd, val) {
  restore();
  document.execCommand(cmd, false, val);
  keep();
  onEdit();
  tools();
}

$('tools').addEventListener('mousedown', e => {
  if (e.target.closest('button')) e.preventDefault();
}); // keep the text selection while clicking buttons
$('tools').addEventListener('click', e => {
  const b = e.target.closest('button[data-cmd]');
  if (!b) return;
  const c = b.dataset.cmd;
  if (c === 'bold' || c === 'italic' || c === 'underline') exec(c);
  else if (c === 'ul') exec('insertUnorderedList');
  else if (c === 'ol') exec('insertOrderedList');
  else if (c === 'heading') {
    restore();
    exec('formatBlock', BLOCK() === 'h3' ? 'p' : 'h3');
  } else if (c === 'quote') {
    restore();
    exec('formatBlock', BLOCK() === 'blockquote' ? 'p' : 'blockquote');
  } else if (c === 'link') {
    keep();
    $('linkForm').hidden = false;
    $('linkUrl').focus();
  } else if (c === 'time') {
    const s = secs();
    if (s == null) {
      note('The clock has not started yet.');
      return;
    }
    exec('insertHTML', '<b>[' + fmt(s) + ']</b>&nbsp;');
  }
});
$('linkUrl').addEventListener('input', () => $('linkUrl').setCustomValidity(''));
$('linkForm').addEventListener('submit', e => {
  e.preventDefault();
  const u = $('linkUrl').value.trim();
  if (!safe(u)) {
    $('linkUrl').setCustomValidity('Use a full address starting with https://');
    $('linkUrl').reportValidity();
    return;
  }
  restore();
  if (getSelection().isCollapsed)
    document.execCommand('insertHTML', false, '<a href="' + esc(u) + '">' + esc(u) + '</a>&nbsp;');
  else document.execCommand('createLink', false, u);
  $('linkForm').hidden = true;
  $('linkUrl').value = '';
  keep();
  onEdit();
});
$('linkCancel').onclick = () => {
  $('linkForm').hidden = true;
  restore();
};

ed.addEventListener('input', onEdit);
ed.addEventListener('keyup', keep);
ed.addEventListener('mouseup', keep);
ed.addEventListener('blur', keep);
ed.addEventListener('paste', e => {
  e.preventDefault();
  document.execCommand(
    'insertText',
    false,
    (e.clipboardData || window.clipboardData).getData('text/plain')
  );
}); // paste as plain text: no stray fonts or colours
document.addEventListener('selectionchange', () => {
  if (document.activeElement === ed) {
    keep();
    tools();
  }
});
try {
  document.execCommand('defaultParagraphSeparator', false, 'div');
} catch (e) {}

/* --- take it home --- */
const slug = t =>
  t
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase() || 'notes';
function parts() {
  const r = S.cur;
  if (!r) return null;
  if (timer) {
    clearTimeout(timer);
    timer = null;
    save();
  }
  return {
    r,
    meta: [r.dateLabel, r.year, r.dur].filter(Boolean).join(' · '),
    html: isEmpty() ? '' : clean(ed.innerHTML),
    pins: S.pins.filter(forCur)
  };
}
function download(name, type, text) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
const pinsHtml = pins =>
  pins.length
    ? '<ul>' +
      pins
        .map(
          p =>
            '<li>' +
            (p.time ? '[' + esc(p.time) + '] ' : '') +
            (safe(p.url)
              ? '<a href="' + esc(p.url) + '">' + esc(p.note || p.url) + '</a>'
              : esc(p.note)) +
            '</li>'
        )
        .join('') +
      '</ul>'
    : '<p>(none)</p>';
const docHtml = p =>
  '<h1>' +
  esc(p.r.title) +
  '</h1><p><i>' +
  esc(p.meta) +
  '</i></p><h2>My notes</h2>' +
  (p.html || '<p>(none)</p>') +
  '<h2>Commoner resources</h2>' +
  pinsHtml(p.pins);
function toText(html) {
  const t = document.createElement('div');
  t.innerHTML = html;
  t.querySelectorAll('a').forEach(a => a.append(' (' + a.href + ')'));
  t.querySelectorAll('li').forEach(li => li.prepend('• '));
  t.querySelectorAll('div,p,ul,ol,h3,blockquote').forEach(b => {
    const q = b.previousSibling;
    if (q && (q.nodeType === 3 || /^(B|I|U|A|STRONG|EM)$/.test(q.tagName))) b.before('\n');
  });
  t.querySelectorAll('br').forEach(b => b.replaceWith('\n'));
  t.querySelectorAll('p,div,h3,li,blockquote').forEach(b => b.append('\n'));
  return t.textContent.replace(/\n{3,}/g, '\n\n').trim();
}
$('exWord').onclick = () => {
  const p = parts();
  if (!p) return;
  download(
    slug(p.r.title) + '-notes.doc',
    'application/msword',
    '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><title>' +
      esc(p.r.title) +
      '</title><style>body{font-family:Georgia,serif;font-size:12pt;line-height:1.5}h1{font-size:20pt}h2{font-size:14pt}h3{font-size:12pt}blockquote{margin-left:24pt;font-style:italic}</style></head><body>' +
      docHtml(p) +
      '</body></html>'
  );
  note('Word file downloaded.');
};
$('exTxt').onclick = () => {
  const p = parts();
  if (!p) return;
  const L = [
    p.r.title,
    p.meta,
    '',
    'MY NOTES',
    '',
    p.html ? toText(p.html) : '(none)',
    '',
    'COMMONER RESOURCES',
    ''
  ];
  p.pins.forEach(x =>
    L.push((x.time ? '[' + x.time + '] ' : '') + x.note + (x.url ? ' - ' + x.url : ''))
  );
  if (!p.pins.length) L.push('(none)');
  download(slug(p.r.title) + '-notes.txt', 'text/plain', L.join('\n'));
  note('Text file downloaded.');
};
$('exPdf').onclick = () => {
  const p = parts();
  if (!p) return;
  $('printArea').innerHTML = docHtml(p);
  window.print();
};
window.addEventListener('afterprint', () => {
  $('printArea').textContent = '';
});
init();
(() => {
  const c = document.querySelector('.clock');
  if (!c) return;
  let t = false;
  const f = () => {
    t = false;
    c.classList.toggle('compact', window.scrollY > 140);
  };
  addEventListener(
    'scroll',
    () => {
      if (!t) {
        t = true;
        requestAnimationFrame(f);
      }
    },
    { passive: true }
  );
  f();
})();
