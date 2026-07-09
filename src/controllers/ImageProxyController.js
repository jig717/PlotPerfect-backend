const PropertyImage = require("../models/PropertyImageModel");
const http = require('http');
const https = require('https');
const { URL } = require('url');

const getImage = async (req, res) => {
  try {
    const { filename } = req.params;
    if (!filename) {
      return res.status(400).json({ message: "Filename required" });
    }

    const image = await PropertyImage.findOne({
      image_url: { $regex: new RegExp(filename + '$', 'i') }
    }).sort({ createdAt: -1 }).limit(1);

    if (!image || !image.image_url) {
      return res.status(404).json({ message: "Image not found" });
    }

    // CORS headers for the proxy endpoint
    const origin = req.headers.origin || '*';
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Max-Age', '86400');

    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }

    const imageUrl = image.image_url;
    const parsed = new URL(imageUrl);
    const client = parsed.protocol === 'https:' ? https : http;

    client.get(parsed.href, (proxRes) => {
      const contentType = proxRes.headers['content-type'] || 'application/octet-stream';
      res.setHeader('Content-Type', contentType);
      // Prevent the browser from treating this as third-party resource
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.statusCode = proxRes.statusCode || 200;
      proxRes.pipe(res);
    }).on('error', (err) => {
      console.error('Error fetching image from origin:', err);
      res.status(502).json({ message: 'Failed to fetch image' });
    });

  } catch (error) {
    console.error('Image proxy error:', error);
    res.status(500).json({ message: "Image proxy failed" });
  }
};

module.exports = { getImage };

