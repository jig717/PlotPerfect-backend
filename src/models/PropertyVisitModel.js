const mongoose = require("mongoose");

const visitSchema = new mongoose.Schema({
  property: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Property",
    required: true,
  },
  buyer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  agent: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  scheduledDate: {
    type: Date,
    required: true,
  },
  status: {
    type: String,
    enum: ["REQUESTED", "CONFIRMED", "COMPLETED", "CANCELLED"],
    default: "REQUESTED",
  },
  notes: {
    type: String,
    trim: true,
    maxlength: 500,
  },
}, { timestamps: true });

visitSchema.index({ buyer: 1, scheduledDate: 1 });
visitSchema.index({ agent: 1, status: 1 });

module.exports = mongoose.model("Visit", visitSchema);