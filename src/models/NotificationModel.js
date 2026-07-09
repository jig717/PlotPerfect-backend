const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'user',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ['INQUIRY', 'MESSAGE', 'SYSTEM', 'PROPERTY', 'USER'],
      required: true,
    },
    sender: {
      type: String, // E.g., user name or "System"
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    read: {
      type: Boolean,
      default: false,
    },
    referenceId: {
      type: mongoose.Schema.Types.ObjectId,
      // Optional: points to the specific inquiry, thread, or property
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Notification', notificationSchema);
