const crypto = require("crypto");

const RAZORPAY_BASE_URL = "https://api.razorpay.com/v1";

const getRazorpayConfig = () => {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) {
    throw new Error("Razorpay credentials are not configured");
  }

  return { keyId, keySecret };
};

const buildAuthHeader = () => {
  const { keyId, keySecret } = getRazorpayConfig();
  return `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`;
};

const razorpayRequest = async (path, options = {}) => {
  const response = await fetch(`${RAZORPAY_BASE_URL}${path}`, {
    method: options.method || "GET",
    headers: {
      Authorization: buildAuthHeader(),
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const rawText = await response.text();
  let payload = null;

  if (rawText) {
    try {
      payload = JSON.parse(rawText);
    } catch (_error) {
      payload = { rawText };
    }
  }

  if (!response.ok) {
    const error = new Error(
      payload?.error?.description ||
        payload?.message ||
        "Razorpay API request failed"
    );
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
};

const verifyRazorpaySignature = ({ orderId, paymentId, signature }) => {
  const { keySecret } = getRazorpayConfig();
  const expectedSignature = crypto
    .createHmac("sha256", keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");

  return expectedSignature === signature;
};

module.exports = {
  getRazorpayConfig,
  razorpayRequest,
  verifyRazorpaySignature,
};
