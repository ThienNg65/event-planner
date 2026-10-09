# Team Party Voter 🎂

A small page where teammates pick their name, tick the party dates they can attend, and suggest or upvote restaurants.

## Change the team or the dates

Edit [`config.json`](config.json), then commit and push. Netlify redeploys automatically.

```json
{
  "title": "October Birthday Party 🎂",
  "team": ["An", "Binh", "Chi"],
  "dates": ["2026-10-23", "2026-10-24"]
}
```

Votes for a date you remove are kept in storage but no longer shown. A teammate you remove can no longer vote.

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:8888. `netlify dev` runs Vite, the `/api/*` function and a local Netlify Blobs sandbox (stored in `.netlify/`).

## Deploy (Netlify)

1. Push this folder to a GitHub repo.
2. Netlify → **Add new site → Import an existing project** → pick the repo. Build settings come from `netlify.toml` (`npm run build`, publish `dist`).
3. Share the site URL with the team.

Storage is Netlify Blobs, which is built in, so there is nothing to configure.

## How it works

| Piece | File |
|---|---|
| UI (React + MUI) | `src/App.tsx` |
| API: `GET /api/state`, `PUT /api/vote`, `POST /api/restaurant` | `netlify/functions/api.mjs` |
| Theme | `src/theme/` |

Each teammate's choices are stored under their own key (`voter/<name>`), so two people saving at the same moment can't overwrite each other. Upvote counts are computed when the data is read.

There is no login: anyone can pick any name. That's fine for a team poll.

## Credits

The theme in `src/theme/` is copied from [minimal-ui-kit/material-kit-react](https://github.com/minimal-ui-kit/material-kit-react) (MIT, see `src/theme/LICENSE.md`). One line in `core/components.tsx` is patched for MUI 7.3 typings.
