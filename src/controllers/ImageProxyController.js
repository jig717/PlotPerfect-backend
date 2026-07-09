const PropertyImage = require("../models/PropertyImageModel");

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

    const origin = req.headers.origin || '';
    const isRazorpayRequest = origin.includes('razorpay') || origin.includes('api.razorpay.com');
    
    res.setHeader('Access-Control-Allow-Origin', isRazorpayRequest ? origin : '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Max-Age', '86400');

    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }

    return res.redirect(301, image.image_url);
  } catch (error) {
    console.error('Image proxy error:', error);
    res.status(500).json({ message: "Image proxy failed" });
  }
};

module.exports = { getImage };

