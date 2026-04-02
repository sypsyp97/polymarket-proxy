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
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { secret, target, rest = [] } = req.query;
  if (!process.env.PROXY_SECRET || secret !== process.env.PROXY_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const targetBase = TARGETS[target];
  if (!targetBase) {
    return res.status(404).json({ error: 'Use /api/SECRET/clob/... or /api/SECRET/gamma/...' });
  }

  const restParts = Array.isArray(rest) ? rest : [rest];
  const path = '/' + restParts.filter(Boolean).join('/');
  const url = new URL(req.url, `https://${req.headers.host}`);
  const qs = url.search || '';
  const targetUrl = targetBase + path + qs;

  const headers = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (!STRIP_HEADERS.has(key.toLowerCase())) headers[key] = value;
  }

  let body;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    headers['content-type'] = req.headers['content-type'] || 'application/json';
    body = await readBody(req);
  }

  try {
    const fetchOpts = { method: req.method, headers };
    if (body) fetchOpts.body = body;
    const resp = await fetch(targetUrl, fetchOpts);
    const data = await resp.text();
    const ct = resp.headers.get('content-type');
    if (ct) res.setHeader('content-type', ct);
    return res.status(resp.status).send(data);
  } catch (e) {
    return res.status(502).json({ error: 'fetch failed', detail: e.message, target: targetUrl });
  }
}
