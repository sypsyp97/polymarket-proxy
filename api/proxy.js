/**
 * Polymarket CLOB API Proxy - Vercel Serverless Function
 * Region pinned to hnd1 (Tokyo) to bypass German geo-block on POST /order
 * 
 * Usage:
 *   GET  /api/proxy?secret=XXX&target=clob&path=/time
 *   POST /api/proxy?secret=XXX&target=clob&path=/order  (with JSON body)
 *   GET  /api/proxy?health=1
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
]);

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, POLY_ADDRESS, POLY_SIGNATURE, POLY_TIMESTAMP, POLY_NONCE, POLY_API_KEY, POLY_PASSPHRASE');
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
  
  // Forward headers, strip identifying ones
  const headers = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (!STRIP_HEADERS.has(key.toLowerCase())) {
      headers[key] = value;
    }
  }
  
  let body = undefined;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    headers['content-type'] = 'application/json';
  }
  
  try {
    const resp = await fetch(targetUrl, { method: req.method, headers, body });
    const data = await resp.text();
    for (const [key, value] of resp.headers.entries()) {
      if (!key.startsWith('x-vercel') && key !== 'set-cookie') {
        res.setHeader(key, value);
      }
    }
    return res.status(resp.status).send(data);
  } catch (e) {
    return res.status(502).json({ error: e.message });
  }
}
