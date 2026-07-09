const express = require("express");
const router = express.Router();
const { authenticate } = require("../middlewares/AuthMiddleware");
const { authorizeRoles } = require("../middlewares/RoleMiddleware");

const {
  createPayment,
  createAdvanceTokenOrder,
  createFullPaymentOrder,
  verifyAdvanceTokenPayment,
  verifyFullPayment,
  downloadPaymentInvoice,
  getUserPayments,
  getAllPayments,
  updatePaymentStatus
} = require("../controllers/PaymentController");


router.post("/", authenticate, createPayment);
router.post("/advance-token/order", authenticate, authorizeRoles("buyer"), createAdvanceTokenOrder);
router.post("/advance-token/verify", authenticate, authorizeRoles("buyer"), verifyAdvanceTokenPayment);
router.post("/full-payment/order", authenticate, authorizeRoles("buyer"), createFullPaymentOrder);
router.post("/full-payment/verify", authenticate, authorizeRoles("buyer"), verifyFullPayment);
router.get("/user/:userId", authenticate, getUserPayments);
router.get("/all", authenticate, authorizeRoles("admin", "support"), getAllPayments);
router.get("/:id/invoice", authenticate, downloadPaymentInvoice);
router.put("/:id", authenticate, updatePaymentStatus);

module.exports = router;
