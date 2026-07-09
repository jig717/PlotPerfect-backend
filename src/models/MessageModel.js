const mongoose = require("mongoose");

const attachmentSchema = new mongoose.Schema(
  {
    fileName: {
      type: String,
      trim: true,
      required: true,
    },
    url: {
      type: String,
      required: true,
    },
    mimeType: {
      type: String,
      required: true,
    },
    sizeBytes: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  { _id: false }
);

const readReceiptSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    readAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const messageSchema = new mongoose.Schema(
  {
    thread: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Thread",
      required: true,
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    content: {
      type: String,
      trim: true,
      default: "",
      maxlength: 5000,
    },
    attachments: {
      type: [attachmentSchema],
      default: [],
    },
    status: {
      type: String,
      enum: ["sent", "delivered", "read"],
      default: "sent",
    },
    readBy: {
      type: [readReceiptSchema],
      default: [],
    },
  },
  { timestamps: true }
);

messageSchema.index({ thread: 1, createdAt: -1 });
messageSchema.index({ sender: 1, createdAt: -1 });

module.exports = mongoose.model("Message", messageSchema);
