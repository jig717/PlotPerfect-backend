const express = require("express");
const router = express.Router();
const { authenticate } = require("../middlewares/AuthMiddleware");
const { authorizeRoles } = require("../middlewares/RoleMiddleware");
const {
  createVisit,
  getBuyerVisits,
  getAgentVisits,
  getVisitById,
  updateVisit,
  updateVisitStatus,
} = require("../controllers/PropertyVisitController");

// Buyer only
router.post("/", authenticate, authorizeRoles("buyer"), createVisit);
router.get("/buyer", authenticate, authorizeRoles("buyer"), getBuyerVisits);

// Agent/Owner only
router.get("/agent", authenticate, authorizeRoles("agent", "owner"), getAgentVisits);

// Shared (authorization inside controller)
router.get("/:id", authenticate, getVisitById);
router.put("/:id", authenticate, updateVisit);
router.patch("/:id/status", authenticate, updateVisitStatus);

module.exports = router;