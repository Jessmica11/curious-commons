// The watch-party clock, the Now Showing override and pinned links, stored on Netlify itself (Netlify Blobs).
// No Google sign-in involved. Viewers read it with GET; the Host Desk changes it with POST + the host password.
// One-time setup: Netlify > Site configuration > Environment variables > add HOST_PASSWORD, then redeploy.
import { getStore } from '@netlify/blobs';
import { createHash, timingSafeEqual, randomUUID } from 'node:crypto';

const KEY = 'live';
const MAX_PINS = 300;
const reply = (code, body) => new Response(JSON.stringify(body), {
  status: code,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
});
const same = (a, b) => timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());
const text = (v, n) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);
const okUrl = u => u === '' || /^https?:\/\/\S+$/i.test(u);
const okClock = c => c === '' || (/^run\|/.test(c) && !isNaN(Date.parse(c.slice(4)))) || /^pause\|\d{1,6}$/.test(c);

// Short plain-text answers for chatbot commands (StreamElements reads the first 400 bytes):
//   ?say=clock -> the watch-party time      ?say=now -> what is showing, with a link
const pad = n => String(Math.floor(n)).padStart(2, '0');
const hms = s => `${pad(s / 3600)}:${pad(s % 3600 / 60)}:${pad(s % 60)}`;
function chat(say, s, origin) {
  const page = s.title ? `${origin}/screening.html?show=${encodeURIComponent(s.title)}` : origin;
  const film = s.title ? ` in "${s.title}"` : '';
  const [mode, val] = String(s.clock || '').split('|');
  let msg;
  if (say === 'now') {
    msg = s.title ? `Now showing: ${s.title}. Where to watch, the watch-party clock and notes: ${page}`
                  : `Nothing is showing right now. See what's coming up: ${origin}`;
  } else if (mode === 'run') {
    msg = `We're at ${hms(Math.max(0, (Date.now() - Date.parse(val)) / 1000))}${film}. Skip your copy to that time to watch along: ${page}`;
  } else if (mode === 'pause') {
    msg = `Paused at ${hms(+val)}${film}. Line your copy up there and we'll start together: ${page}`;
  } else {
    msg = `The watch-party clock hasn't started yet. See what's showing: ${origin}`;
  }
  return new Response(msg.slice(0, 390), { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
}

export default async req => {
  const store = getStore({ name: 'commons', consistency: 'strong' });
  const read = async () => ({ clock: '', title: '', pins: [], ...((await store.get(KEY, { type: 'json' })) || {}) });

  if (req.method === 'GET') {
    const say = new URL(req.url).searchParams.get('say');
    return say ? chat(say, await read(), new URL(req.url).origin) : reply(200, await read());
  }
  if (req.method !== 'POST') return reply(405, { error: 'method not allowed' });

  const PW = process.env.HOST_PASSWORD;
  if (!PW) return reply(500, { error: 'HOST_PASSWORD is not set in Netlify' });
  let b;
  try { b = await req.json(); } catch (e) { return reply(400, { error: 'bad request' }); }
  if (typeof b.key !== 'string' || !same(b.key, PW)) return reply(401, { error: 'bad password' });

  const s = await read();
  switch (b.action) {
    case 'ping':
      return reply(200, { ok: true });
    case 'clock': {
      const c = text(b.clock, 60);
      if (!okClock(c)) return reply(400, { error: 'bad clock value' });
      s.clock = c;
      if (typeof b.title === 'string') s.title = text(b.title, 200);   // Play sets that film as Now Showing; Reset sends '' to clear it
      break;
    }
    case 'live':
      s.title = text(b.title, 200); break;
    case 'pin': {
      const p = { id: randomUUID(), time: text(b.time, 12), note: text(b.note, 300), url: text(b.url, 1000), doc: text(b.doc, 200) };
      if (!p.note && !p.url) return reply(400, { error: 'a pin needs a note or a link' });
      if (!okUrl(p.url)) return reply(400, { error: 'the link must start with http:// or https://' });
      s.pins = [...s.pins, p].slice(-MAX_PINS); break;
    }
    case 'unpin':
      s.pins = s.pins.filter(p => p.id !== b.id); break;
    default:
      return reply(400, { error: 'unknown action' });
  }
  s.updated = new Date().toISOString();
  await store.setJSON(KEY, s);
  return reply(200, { ok: true, ...s });
};
