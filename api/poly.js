// Vercel serverless proxy for Polymarket's public APIs.
//
// The browser can't call Polymarket's APIs directly (no CORS headers), so the
// dashboard calls this function on its own origin instead:
//
//     /api/poly?path=/v1/leaderboard?category=OVERALL&timePeriod=MONTH...
//     /api/poly?path=/positions?user=0x...&limit=500...
//     /api/poly?path=/markets?condition_ids=0x...   (geo-restriction lookup)
//
// The upstream host is picked from the path prefix:
//     /v1/leaderboard, /positions  -> data-api.polymarket.com
//     /markets, /events            -> gamma-api.polymarket.com
//
// We only forward this small allow-list of paths so this can't be abused as an
// open proxy. Everything is read-only GET.

const UPSTREAMS = {
  data: "https://data-api.polymarket.com",
  gamma: "https://gamma-api.polymarket.com",
};

// path prefix -> which upstream host handles it
const ROUTES = [
  { prefix: "/v1/leaderboard", host: "data" },
  { prefix: "/positions", host: "data" },
  { prefix: "/markets", host: "gamma" },
  { prefix: "/events", host: "gamma" },
];

export default async function handler(req, res) {
  // --- CORS (so the page works even if served from another origin) ---
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  if (req.method !== "GET") {
    res.status(405).json({ error: "method not allowed" });
    return;
  }

  // The real upstream path arrives in ?path=... (URL-encoded, may include its
  // own query string). Vercel decodes query values for us.
  let path = req.query.path;
  if (Array.isArray(path)) path = path[0];
  if (!path || typeof path !== "string") {
    res.status(400).json({ error: "missing ?path=" });
    return;
  }
  if (!path.startsWith("/")) path = "/" + path;

  // Allow-list check (ignore the query-string portion when matching) and pick
  // the upstream host for this path.
  const pathname = path.split("?")[0];
  const route = ROUTES.find((r) => pathname === r.prefix || pathname.startsWith(r.prefix));
  if (!route) {
    res.status(403).json({ error: "path not allowed", path: pathname });
    return;
  }

  const target = UPSTREAMS[route.host] + path;

  try {
    const upstream = await fetch(target, {
      headers: { accept: "application/json", "user-agent": "consensus-dashboard" },
    });

    const body = await upstream.text();

    // Cache successful reads briefly at the edge to spare the upstream APIs
    // during a scan and to make repeat scans snappy.
    if (upstream.ok) {
      res.setHeader("Cache-Control", "public, s-maxage=30, stale-while-revalidate=120");
    }
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.status(upstream.status).send(body);
  } catch (err) {
    res.status(502).json({ error: "upstream fetch failed", detail: String(err) });
  }
}
