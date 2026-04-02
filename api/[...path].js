/**
 * Polymarket CLOB API Proxy - Path-based routing
 * /{SECRET}/clob/time     → https://clob.polymarket.com/time
 * /{SECRET}/clob/order    → https://clob.polymarket.com/order
 * /{SECRET}/gamma/markets → https://gamma-api.polymarket.com/markets
 * /health                 → { ok: true, region: "hnd1" }
 */

const TARGETS = {
  clob: 'https://clob.polymarket.com',
  gamma: 'https://gamma-api.polymarket.com',
};

const STRIP_HEADERS = new Set([
  'host', 'cf-connecting-ip', 'cf-ipcountry', 'cf-ray',
  'cf-visitor', 'cdn-loop', 'x-forwarded-for', 'x-real-ip',
  'x-forwarded-proto', 'x-forwarded-host', 'x-vercel-forwarded-for',
  'x-vercel-ip-country', 'x-vercel-ip-city', 'x-vercel-id',
  'x-vercel-proxy-signature', 'x-vercel-proxy-signature-ts',
  'connection', 'transfer-encoding', 'content-length',
]);

export const config = {
  api: { bodyParser: false }
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString()));
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Parse path: /api/SECRET/target/rest/of/path
  let parts = req.url.split('?')[0].split('/').filter(Boolean);
  if (parts[0] === 'api') parts = parts.slice(1);
  
  // Health check
  if (parts[0] === 'health') {
    return res.status(200).json({ 
      ok: true, ts: Date.now(), 
      region: process.env.VERCEL_REGION || 'unknown' 
    });
  }
  
  // Auth: first segment is secret
  if (!process.env.PROXY_SECRET || parts[0] !== process.env.PROXY_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  // Target: second segment (clob or gamma)
  const target = parts[1];
  const targetBase = TARGETS[target];
  if (!targetBase) {
    return res.status(404).json({ error: 'Use /SECRET/clob/... or /SECRET/gamma/...' });
  }
  
  // Remaining path
  const remainingPath = '/' + parts.slice(2).join('/');
  // Preserve query string
  const qIdx = req.url.indexOf('?');
  const qs = qIdx >= 0 ? req.url.slice(qIdx) : '';
  const targetUrl = targetBase + remainingPath + qs;
  
  // Build headers
  const headers = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (!STRIP_HEADERS.has(key.toLowerCase())) {
      headers[key] = value;
    }
  }
  
  // Read raw body for non-GET
  let body = undefined;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    headers['content-type'] = req.headers['content-type'] || 'application/json';
    try {
      body = await readBody(req);
    } catch (e) {
      return res.status(400).json({ error: 'Failed to read body', detail: e.message });
    }
  }
  
  try {
    const fetchOpts = { method: req.method, headers };
    if (body !== undefined && body.length > 0) {
      fetchOpts.body = body;
    }
    
    const resp = await fetch(targetUrl, fetchOpts);
    const data = await resp.text();
    
    const ct = resp.headers.get('content-type');
    if (ct) res.setHeader('content-type', ct);
    
    return res.status(resp.status).send(data);
  } catch (e) {
    return res.status(502).json({ 
      error: 'fetch failed', 
      detail: e.message,
      target: targetUrl 
    });
  }
}
