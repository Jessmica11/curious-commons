// Looks up a film on TMDB (token stays on the server) and returns poster, overview and where to watch.
// Also returns the Rotten Tomatoes critics score and the IMDb audience rating from OMDb, when OMDB_TOKEN is set.
// Set TMDB_TOKEN, OMDB_TOKEN (and optionally REGION, default US) in Netlify > Site configuration > Environment variables.
// Never put the keys in the code: this repository is public.
const TOKEN = process.env.TMDB_TOKEN;
const OMDB = process.env.OMDB_TOKEN;
const REGION = (process.env.REGION || 'US').toUpperCase();
const names = a => (a || []).map(p => p.provider_name);
const uniq = a => [...new Set(a)];
const isLibrary = n => /kanopy|hoopla/i.test(n);

const reply = (code, body, cache) => ({
  statusCode: code,
  headers: {
    'Content-Type': 'application/json',
    'Cache-Control': cache ? 'public, max-age=86400' : 'no-store',
    ...(cache ? { 'Netlify-CDN-Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800' } : {})
  },
  body: JSON.stringify(body)
});

// Rotten Tomatoes (share of critics' reviews that are positive) and IMDb (audience average), via OMDb.
// A missing key, an unknown film or a slow answer just means no scores: the rest of the lookup still works.
async function ratings(imdbId) {
  if (!OMDB || !/^tt\d+$/.test(imdbId || '')) return {};
  try {
    const r = await fetch(`https://www.omdbapi.com/?i=${imdbId}&apikey=${encodeURIComponent(OMDB)}`, {
      signal: AbortSignal.timeout(4000)
    });
    const d = await r.json();
    if (d.Response !== 'True') return {};
    const rt = ((d.Ratings || []).find(x => x.Source === 'Rotten Tomatoes') || {}).Value || '';
    const votes = parseInt(String(d.imdbVotes || '').replace(/,/g, ''), 10) || 0;
    const rating = /^\d+(\.\d)?$/.test(d.imdbRating || '') ? d.imdbRating : '';
    return { rt: /^\d{1,3}%$/.test(rt) ? rt : '', imdb: rating ? { rating, votes } : null };
  } catch (e) {
    return {};
  }
}

exports.handler = async event => {
  const q = event.queryStringParameters || {};
  const title = String(q.title || '').slice(0, 200).trim();
  const year = /^\d{4}$/.test(q.year || '') ? q.year : '';
  const id = /^\d+$/.test(q.id || '') ? q.id : '';
  if (!TOKEN) return reply(500, { error: 'TMDB_TOKEN is not set' });
  if (!title && !id) return reply(400, { error: 'title or id is required' });

  const get = path =>
    fetch('https://api.themoviedb.org/3' + path, {
      headers: { Authorization: 'Bearer ' + TOKEN, accept: 'application/json' }
    }).then(r => { if (!r.ok) throw new Error('TMDB ' + r.status); return r.json(); });

  try {
    const find = y => get(`/search/movie?query=${encodeURIComponent(title)}${y ? '&year=' + y : ''}`);
    let kind0 = q.type === 'tv' ? 'tv' : 'movie';
    let hit = id ? await get(`/${kind0}/${id}`).catch(() => null) : ((await find(year)).results || [])[0];
    if (!hit && !id && year) hit = ((await find('')).results || [])[0];
    let kind = kind0;
    if (!hit && !id) {
      const t = ((await get(`/search/tv?query=${encodeURIComponent(title)}`)).results || [])[0];
      if (t) { hit = t; kind = 'tv'; }
    }
    if (!hit) return reply(200, { found: false }, true);

    const [providers, ids] = await Promise.all([
      get(`/${kind}/${hit.id}/watch/providers`),
      get(`/${kind}/${hit.id}/external_ids`).catch(() => ({}))
    ]);
    const where = (providers.results || {})[REGION] || {};
    const scores = await ratings(ids.imdb_id);
    const free = uniq([...names(where.free), ...names(where.ads)]);
    const flat = uniq(names(where.flatrate));
    const rentBuy = uniq([...names(where.rent), ...names(where.buy)])
      .filter(n => !flat.includes(n) && !free.includes(n));

    return reply(200, {
      found: true,
      title: hit.title || hit.name,
      poster: hit.poster_path ? 'https://image.tmdb.org/t/p/w342' + hit.poster_path : '',
      overview: hit.overview || '',
      genres: (hit.genres || []).map(g => g.name),
      year: String(hit.release_date || hit.first_air_date || '').slice(0, 4),
      runtime: hit.runtime || (hit.episode_run_time && hit.episode_run_time[0]) || 0,
      url: `https://www.themoviedb.org/${kind}/${hit.id}`,
      watchLink: where.link || '',
      free,
      open: flat.filter(isLibrary),
      stream: [...flat.filter(n => !isLibrary(n)), ...rentBuy.map(n => n + ' (rent/buy)')],
      ...scores
    }, true);
  } catch (err) {
    return reply(502, { error: 'lookup failed', detail: String((err && err.message) || err) });
  }
};
