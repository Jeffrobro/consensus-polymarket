// Vercel serverless proxy for Polymarket's public Data API.
//
// The browser can't call data-api.polymarket.com directly (no CORS headers),
// so the dashboard calls this function on its own origin instead:
//
//     /api/poly?path=/v1/leaderboard?category=OVERALL&timePeriod=MONTH...
//     /api/poly?path=/positions?user=0x...&limit=500...
//
// We only forward a small allow-list of paths so this can't be abused as an
// open proxy. Everything is read-only GET.

const UPSTREAM = "https://data-api.polymarket.com";

// Only these path prefixes are allowed through.
const ALLOWED_PREFIXES = ["/v1/leaderboard", "/positions"];

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

  // Allow-list check (ignore the query-string portion when matching).
  const pathname = path.split("?")[0];
  const ok = ALLOWED_PREFIXES.some((p) => pathname === p || pathname.startsWith(p));
  if (!ok) {
    res.status(403).json({ error: "path not allowed", path: pathname });
    return;
  }

  const target = UPSTREAM + path;

  try {
    const upstream = await fetch(target, {
      headers: { accept: "application/json", "user-agent": "consensus-dashboard" },
    });

    const body = await upstream.text();

    // Cache successful reads briefly at the edge to spare the upstream API
    // during a 50-trader scan and to make repeat scans snappy.
    if (upstream.ok) {
      res.setHeader("Cache-Control", "public, s-maxage=30, stale-while-revalidate=120");
    }
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.status(upstream.status).send(body);
  } catch (err) {
    res.status(502).json({ error: "upstream fetch failed", detail: String(err) });
  }
}
