const jwt = require("jsonwebtoken");
const User = require("../models/UserModel");
const JWT_SECRET = process.env.JWT_SECRET;

const extractUserId = (decoded) => {
  if (!decoded) return null;
  return decoded._id || decoded.id || decoded.userId || decoded.sub || null;
};

const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const userId = extractUserId(decoded);

    if (!decoded._id && userId) {
      decoded._id = userId;
    }

    if ((!decoded.role || !decoded._id) && userId) {
      const user = await User.findById(userId).select("role");
      if (user?.role) decoded.role = user.role;
    }
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ message: "Unauthorized" });
  }
};

module.exports = { authenticate, protect: authenticate };
