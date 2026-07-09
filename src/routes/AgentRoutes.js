const express = require("express");
const router = express.Router();
const { authenticate } = require("../middlewares/AuthMiddleware");
const { authorizeRoles } = require("../middlewares/RoleMiddleware");
const {
  getAgentStats,
  getDailyViews,
  getLeadSources,
  getAgentCommissionAnalytics,
} = require("../controllers/AgentController");

router.get("/stats", authenticate, authorizeRoles("agent"), getAgentStats);
router.get("/daily-views", authenticate, authorizeRoles("agent"), getDailyViews);
router.get("/lead-sources", authenticate, authorizeRoles("agent"), getLeadSources);
router.get("/commissions", authenticate, authorizeRoles("agent"), getAgentCommissionAnalytics);

module.exports = router;
