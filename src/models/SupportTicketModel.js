const mongoose = require("mongoose");

const supportSchema = new mongoose.Schema({

  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "users",
     required: true
    },
  
  issue_type: {
    type: String
  },

  description:{
    type: String
  },

  status: {
    type: String,
    enum: ["OPEN", "IN_PROGRESS", "RESOLVED"],
    default: "OPEN"
  }

}, { timestamps: true });

module.exports = mongoose.model("SupportTicket", supportSchema);