# Consensus

A single-page dashboard for **Polymarket smart-money overlap**. It pulls the top
traders off Polymarket's public leaderboard, reads every trader's open positions,
and ranks markets by how many of those top traders independently hold the same
position. The idea: when a lot of winning traders are in the same trade, that
overlap is a signal worth looking at.

It is **read-only**. It surfaces overlap; it does not place trades.

## How it works

- The browser can't call `data-api.polymarket.com` directly — that API sends no
  CORS headers, so the request is blocked. To get around that, this project ships
  a tiny serverless proxy at **`/api/poly`** (see [`api/poly.js`](api/poly.js)).
- The dashboard ([`index.html`](index.html)) calls `/api/poly` on its own origin,
  the function forwards an allow-listed path to Polymarket, and returns the JSON
  with CORS headers + light edge caching.
- If `/api/poly` is ever unreachable (or you open the file locally), it falls back
  to a direct fetch and a couple of public CORS proxies.

```
consensus/
├── index.html      ← the dashboard (UI + scan logic)
├── api/
│   └── poly.js     ← serverless proxy to data-api.polymarket.com
├── vercel.json     ← Vercel config (clean URLs, function timeout)
├── package.json
└── .gitignore
```

---

## Deploy it (GitHub + Vercel)

You'll need a [GitHub](https://github.com) account and a [Vercel](https://vercel.com)
account (Vercel's free Hobby tier is plenty). Two ways to do it — pick one.

### Option A — Vercel CLI (fastest)

From this folder:

```bash
# 1. install the Vercel CLI once
npm i -g vercel

# 2. deploy (it will ask you to log in the first time)
vercel

# 3. push it live to production
vercel --prod
```

That's it — the CLI prints your live URL. Skip to **Verify** below.

### Option B — GitHub repo + Vercel dashboard (nice for ongoing edits)

**1. Put the code on GitHub**

```bash
cd consensus
git init
git add .
git commit -m "Consensus: Polymarket smart-money overlap dashboard"

# create an empty repo on github.com first (no README/license), then:
git remote add origin https://github.com/<your-username>/consensus.git
git branch -M main
git push -u origin main
```

**2. Import it into Vercel**

1. Go to <https://vercel.com/new>.
2. Click **Import** next to your `consensus` repo (authorize GitHub if asked).
3. Leave everything at defaults — **no build command, no framework, no env vars**.
   Vercel auto-detects `index.html` as a static site and `api/poly.js` as a
   serverless function.
4. Click **Deploy**.

After ~30 seconds you get a live URL like `https://consensus-xxxx.vercel.app`.
Every future `git push` to `main` redeploys automatically.

---

## Verify it works

1. Open your live URL. It auto-runs a scan on load.
2. Watch the status line walk through "Reading positions — 1/50…".
3. You should land on a ranked table of overlapping positions.

Quick backend check (replace the domain):

```bash
curl "https://<your-domain>.vercel.app/api/poly?path=/v1/leaderboard?category=OVERALL%26timePeriod=MONTH%26orderBy=PNL%26limit=3"
```

You should get a JSON array of traders back.

---

## Run locally

```bash
npm i -g vercel
vercel dev        # serves index.html + /api/poly at http://localhost:3000
```

Opening `index.html` directly as a `file://` also works, but with no backend it
relies on the flaky public-proxy fallbacks — `vercel dev` is the real test.

---

## The "Proxy" button

The dashboard uses this deployment's own `/api/poly` by default, so you normally
never touch it. If you want to point at a different backend (say a Cloudflare
Worker, or another Vercel deployment), click **Proxy** and paste:

- Vercel-style: `https://your-domain.com/api/poly`
- Worker-style: `https://name.you.workers.dev`

Leave it blank to clear the override and go back to the default. The override is
remembered in your browser's `localStorage`.

---

## Notes & caveats

- **Leaderboard rank is past P&L.** A lot of top *volume* is market-making, not
  directional conviction. Treat consensus as a lead to investigate, not a
  recommendation.
- Top-P&L traders have often *realized* their gains, so they may show few open
  positions. Ranking by **Volume** tends to surface more live overlap.
- A 50-trader scan is ~51 sequential API calls with a polite delay, so it takes
  a bit. The edge cache (30s) makes repeat scans much faster.
- The proxy only forwards `/v1/leaderboard` and `/positions` paths — it can't be
  abused as a general open proxy.
