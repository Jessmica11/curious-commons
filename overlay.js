import { $, LIVE_FN, S, parseSchedule, load, SCHEDULE_TAB, autoPick, when } from './commons.js';

const Q = new URLSearchParams(location.search);
const POLL_MS = 3000; // how often to check the Host Desk; the seconds tick locally in between
const wrap = $('wrap');
if (Q.get('style') === 'bare') document.body.classList.add('bare');
if (Q.get('style') === 'column') document.body.classList.add('column');
if (Q.get('title') === '0') $('film').hidden = true;
if (Q.get('label') === '0') $('label').hidden = true;
const sc = parseFloat(Q.get('scale'));
if (sc > 0 && sc < 5) document.documentElement.style.setProperty('--scale', sc);

let clock = null,
  title = '',
  last = '',
  nextFilm = '';
const pad = n => String(Math.floor(n)).padStart(2, '0');
const fmt = s => `${pad(s / 3600)}:${pad((s % 3600) / 60)}:${pad(s % 60)}`;
// same format the Host Desk writes: "run|<start time>" while playing, "pause|<seconds>" while paused, "" when reset
function parse(v) {
  if (!v) return null;
  const [m, x] = v.split('|');
  if (m === 'run') {
    const t = Date.parse(x);
    return isNaN(t) ? null : { running: true, start: t };
  }
  if (m === 'pause' && !isNaN(+x)) return { running: false, base: +x };
  return null;
}
function secs() {
  return !clock
    ? null
    : clock.running
      ? Math.max(0, (Date.now() - clock.start) / 1000)
      : clock.base;
}

function draw() {
  const s = secs(),
    mode = !clock ? 'idle' : clock.running ? 'run' : 'paused';
  wrap.className = 'wrap ' + mode + (mode === 'idle' && Q.get('idle') === 'hide' ? ' gone' : '');
  $('time').textContent = s == null ? 'Starting soon' : fmt(s);
  $('film').textContent = title || (mode === 'idle' ? nextFilm : '');
  $('state').textContent =
    mode === 'paused'
      ? 'Paused · hold your place here'
      : mode === 'run'
        ? 'Commoners, match your film to this time'
        : 'Pull up a chair';
}
async function poll() {
  try {
    const r = await fetch(LIVE_FN, { cache: 'no-store' });
    if (r.ok) {
      const d = await r.json();
      if (d && !d.error) {
        const key = (d.clock || '') + '¦' + (d.title || '');
        if (key !== last) {
          last = key;
          clock = parse(d.clock || '');
          title = d.title || '';
          draw();
        }
      }
    }
  } catch (e) {
    /* keep ticking with the last known clock; try again next poll */
  }
  setTimeout(poll, POLL_MS);
}
// before the clock starts, name the film that is about to open, from the schedule (checked every 5 minutes)
async function loadNext() {
  try {
    S.rows = parseSchedule(await load(SCHEDULE_TAB));
    S.liveTitle = '';
    const n = autoPick();
    nextFilm = n && when(n) === 'soon' ? n.title : '';
    draw();
  } catch (e) {}
  setTimeout(loadNext, 5 * 60 * 1000);
}
loadNext();
// tick a few times a second so the seconds never stutter or skip
setInterval(draw, 250);
draw();
poll();
