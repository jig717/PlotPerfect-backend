const mongoose = require("mongoose");

const threadSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["property_inquiry", "support", "owner_agent_sale"],
      default: "property_inquiry",
    },
    title: {
      type: String,
      trim: true,
      required: true,
      maxlength: 200,
    },
    property: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Property",
      default: null,
    },
    inquiry: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Inquiry",
      default: null,
    },
    participants: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        role: {
          type: String,
          enum: ["admin", "agent", "owner", "buyer", "support"],
          required: true,
        },
        lastReadAt: {
          type: Date,
          default: null,
        },
      },
    ],
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    status: {
      type: String,
      enum: ["open", "pending", "closed", "archived"],
      default: "open",
    },
    lastMessageAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

threadSchema.index({ "participants.user": 1, lastMessageAt: -1 });
threadSchema.index({ property: 1, type: 1 });
threadSchema.index({ inquiry: 1 });
threadSchema.index({ status: 1, assignedTo: 1 });

module.exports = mongoose.model("Thread", threadSchema);
