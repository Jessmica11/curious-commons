# The Curiosity Commons

The companion site for [twitch.tv/curiosity_commons](https://www.twitch.tv/curiosity_commons), a Twitch documentary club. It's hosted on Netlify at curious-commons.netlify.app.

Plain HTML, CSS and JavaScript, with no framework and no build step. Upload a changed file to GitHub and Netlify publishes it.

## Pages

Each page is three files with the same name: the markup (`.html`), its styles (`.css`) and its behaviour (`.js`).

| Page | What it is |
| --- | --- |
| `index` | The Gallery Wall: Now on View, Opening Soon, Future exhibitions and From the Archive. |
| `screening` | A film's own page: the watch-party clock, where to watch, pinned links, notes, and the Host Desk (add `?host` to the address). |
| `overlay` | OBS Browser Source: the watch-party clock. Options are listed at the top of `overlay.html`. |
| `board` | OBS Browser Source: Where To Watch and the latest pinned links. Options are listed at the top of `board.html`. |

## Shared files

- `commons.css`: the colours, fonts, cards, buttons, frames and checkout slip used on every page. Colours are named at the top (`--gold`, `--leather`, `--burgundy` and so on).
- `commons.js`: shared code. It reads the schedule from the Google Sheet, reads the live clock, film and pins from Netlify, and provides small helpers. Each page imports only the parts it uses, for example `import { $, el, S } from './commons.js';`. The Sheet ID and Twitch channel name are set at the top.

## Netlify functions (`netlify/functions/`)

- `live.mjs`: stores the watch-party clock, the film on view and pinned links. The Host Desk changes them with the `HOST_PASSWORD` set in Netlify. It also answers the chat commands (`?say=clock`, `?say=now`).
- `film.js`: looks up a film's poster, description and where to watch on TMDB, plus its Rotten Tomatoes critics score and IMDb audience rating from OMDb. It needs `TMDB_TOKEN` and `OMDB_TOKEN` set in Netlify. Never put either key in the code: this repository is public.

To set a score by hand, add a column headed **Rotten Tomatoes** (or **RT score**) to the Sheet and type the number, e.g. `91`. A typed score wins over the looked-up one.

## Images and icons

`profile.webp` (the portrait), `favicon.svg`, `favicon-32.png`, `apple-touch-icon.png` and `og-image.jpg` (the picture shown when the link is shared).

## Accessibility

Text meets WCAG AA contrast, every control is at least 44px tall, focus is always visible, and motion stops for anyone who has reduced motion turned on. Please keep it that way when changing colours or sizes.
