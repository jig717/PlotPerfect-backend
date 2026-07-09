const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema({

  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },

  property: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Property"
  },
  recipient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null
  },
  initiatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null
  },
  saleRequest: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "SaleRequest",
    default: null
  },
  paymentType: {
    type: String,
    enum: ["advance_token", "full_property_payment", "sale_closure", "agent_commission"],
    default: "sale_closure"
  },

  amount: {
    type: Number,
    required: true
  },

  paymentMethod: {
    type: String,
    enum: ["card", "upi", "netbanking"],
    required: true
  },

  currency: {
    type: String,
    default: "INR",
    trim: true
  },

  receipt: {
    type: String,
    trim: true,
    default: ""
  },

  razorpayOrderId: {
    type: String,
    trim: true,
    default: ""
  },

  razorpayPaymentId: {
    type: String,
    trim: true,
    default: ""
  },

  razorpaySignature: {
    type: String,
    trim: true,
    default: ""
  },

  gatewayStatus: {
    type: String,
    trim: true,
    default: ""
  },

  emailStatus: {
    type: String,
    enum: ["pending", "sent", "partial", "failed"],
    default: "pending"
  },

  gatewayResponse: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },

  paidAt: {
    type: Date,
    default: null
  },

  status: {
    type: String,
    enum: ["pending", "completed", "failed"],
    default: "pending"
  },
  notes: {
    type: String,
    trim: true,
    default: ""
  }

}, { timestamps: true });

paymentSchema.index({ user: 1, updatedAt: -1, createdAt: -1 });
paymentSchema.index({ recipient: 1, updatedAt: -1, createdAt: -1 });
paymentSchema.index({ initiatedBy: 1, updatedAt: -1, createdAt: -1 });
paymentSchema.index({ saleRequest: 1 });

module.exports = mongoose.model("Payment", paymentSchema);
