/**
 * Polymarket CLOB API Proxy - Vercel Serverless Function
 * Region pinned to hnd1 (Tokyo) to bypass German geo-block on POST /order
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

  const url = new URL(req.url, `https://${req.headers.host}`);
  
  // Health check
  if (url.searchParams.get('health') === '1') {
    return res.status(200).json({ 
      ok: true, ts: Date.now(), 
      region: process.env.VERCEL_REGION || 'unknown' 
    });
  }
  
  // Auth
  const secret = url.searchParams.get('secret');
  if (!secret || secret !== process.env.PROXY_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  const target = url.searchParams.get('target');
  const path = url.searchParams.get('path') || '/';
  
  const targetBase = TARGETS[target];
  if (!targetBase) {
    return res.status(404).json({ error: 'Use target=clob or target=gamma' });
  }
  
  const targetUrl = targetBase + path;
  
  // Build headers
  const headers = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (!STRIP_HEADERS.has(key.toLowerCase())) {
      headers[key] = value;
    }
  }
  // Ensure content-type for POST
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    headers['content-type'] = req.headers['content-type'] || 'application/json';
  }
  
  // Read raw body for non-GET
  let body = undefined;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
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
    
    // Forward select response headers
    const ct = resp.headers.get('content-type');
    if (ct) res.setHeader('content-type', ct);
    
    return res.status(resp.status).send(data);
  } catch (e) {
    return res.status(502).json({ 
      error: 'fetch failed', 
      detail: e.message,
      cause: e.cause ? String(e.cause) : undefined,
      target: targetUrl 
    });
  }
}
