const express = require("express");
const router = express.Router();

const {
  createTicket,
  getTickets,
  updateTicketStatus,
} = require("../controllers/SupportController");
const { protect } = require("../middlewares/AuthMiddleware.js");
const { authorizeRoles } = require("../middlewares/RoleMiddleware.js");

router.post("/", protect, authorizeRoles("buyer", "owner", "agent", "admin", "support"), createTicket);
router.get("/", protect, authorizeRoles("support", "admin"), getTickets);
router.put("/:id", protect, authorizeRoles("support", "admin"), updateTicketStatus);

module.exports = router;
