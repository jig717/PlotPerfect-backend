const mongoose = require("mongoose");

const saleRequestSchema = new mongoose.Schema(
  {
    property: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Property",
      required: true,
      index: true,
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["open", "accepted", "sold", "payment_completed", "cancelled"],
      default: "open",
      index: true,
    },
    ownerMessage: {
      type: String,
      trim: true,
      default: "",
      maxlength: 1000,
    },
    acceptedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    acceptedAt: {
      type: Date,
      default: null,
    },
    soldAt: {
      type: Date,
      default: null,
    },
    soldPrice: {
      type: Number,
      default: null,
    },
    commissionRate: {
      type: Number,
      default: null,
      min: 0,
    },
    commissionAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    commissionStatus: {
      type: String,
      enum: ["pending", "earned", "paid", "cancelled"],
      default: "pending",
      index: true,
    },
    commissionCalculatedAt: {
      type: Date,
      default: null,
    },
    commissionEarnedAt: {
      type: Date,
      default: null,
    },
    saleNotes: {
      type: String,
      trim: true,
      default: "",
      maxlength: 1000,
    },
    thread: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Thread",
      default: null,
    },
    payment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Payment",
      default: null,
    },
    commissionPayment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Payment",
      default: null,
    },
  },
  { timestamps: true }
);

saleRequestSchema.index({ property: 1, owner: 1 }, { unique: true });

module.exports = mongoose.model("SaleRequest", saleRequestSchema);
