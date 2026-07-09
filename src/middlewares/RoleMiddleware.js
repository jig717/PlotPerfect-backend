const normalizeRole = (role) => {
  const value = String(role || "").trim().toLowerCase();
  if (!value) return "";

  // Backward compatibility for older user records/tokens.
  if (value === "user") return "buyer";
  return value;
};

const authorizeRoles = (...roles) => {
  const allowedRoles = roles.map(normalizeRole);

  return (req, res, next) => {
    const userRole = normalizeRole(req.user?.role);

    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({
        message: "Access denied"
      });
    }

    // Keep downstream checks consistent with normalized role values.
    req.user.role = userRole;
    next();
  };
};

module.exports = { authorizeRoles };
