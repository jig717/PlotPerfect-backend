const express = require('express');
const router = express.Router();

// Simple proxy for the useblackbox TLM endpoint to avoid CORS issues
// Usage: GET /proxy/useblackbox
router.get('/useblackbox', async (req, res) => {
  try {
    const targetUrl = 'https://www.useblackbox.io/tlm';

    // Forward query parameters if any
    const url = new URL(targetUrl);
    Object.keys(req.query || {}).forEach(key => url.searchParams.append(key, req.query[key]));

    const fetchRes = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        // Forward some headers if needed
        'Accept': 'application/json, text/plain, */*',
        'User-Agent': 'PlotPerfect-Proxy/1.0'
      }
    });

    const contentType = fetchRes.headers.get('content-type') || '';
    const body = contentType.includes('application/json') ? await fetchRes.json() : await fetchRes.text();

    // Mirror status and body
    res.status(fetchRes.status);
    if (typeof body === 'object') return res.json(body);
    return res.send(body);
  } catch (err) {
    console.error('Proxy error', err);
    return res.status(502).json({ error: 'Proxy fetch failed', details: err.message });
  }
});

module.exports = router;
