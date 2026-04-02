# Polymarket CLOB Proxy

Vercel Serverless Function that proxies requests to Polymarket's CLOB API from Tokyo (hnd1) to bypass geo-restrictions.

## Deploy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/sypsyp97/polymarket-proxy&env=PROXY_SECRET&envDescription=Secret%20key%20for%20proxy%20authentication)

After deploying, set `PROXY_SECRET` in your Vercel project environment variables.

## Usage

```
GET  https://your-project.vercel.app/api/proxy?secret=YOUR_SECRET&target=clob&path=/time
POST https://your-project.vercel.app/api/proxy?secret=YOUR_SECRET&target=clob&path=/order
GET  https://your-project.vercel.app/api/proxy?health=1
```
