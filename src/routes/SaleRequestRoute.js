const router = require("express").Router();
const { authenticate } = require("../middlewares/AuthMiddleware");
const { authorizeRoles } = require("../middlewares/RoleMiddleware");
const {
  createSaleRequest,
  getOpenSaleRequestsForAgents,
  getAgentSaleRequests,
  getOwnerSaleRequests,
  acceptSaleRequest,
  markSaleRequestSold,
  updateSaleRequestPayment,
} = require("../controllers/SaleRequestController");

router.use(authenticate);

router.post("/", authorizeRoles("owner"), createSaleRequest);
router.get("/agent/open", authorizeRoles("agent"), getOpenSaleRequestsForAgents);
router.get("/agent/mine", authorizeRoles("agent"), getAgentSaleRequests);
router.get("/owner", authorizeRoles("owner"), getOwnerSaleRequests);
router.post("/:id/accept", authorizeRoles("agent"), acceptSaleRequest);
router.post("/:id/sold", authorizeRoles("agent"), markSaleRequestSold);
router.patch("/:id/payment", authorizeRoles("owner"), updateSaleRequestPayment);

module.exports = router;
